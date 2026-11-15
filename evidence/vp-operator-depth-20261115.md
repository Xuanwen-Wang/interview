# VP 算子、编译器与模块映射核对

采集日期：2026-11-15。指南为未提交的本地预览，不提交、不发布。业务源码只读，没有编译或执行设备 kernel、CycleSim 或 RTL。

本记录区分三件事：当前源代码生成和约束了什么；这些操作对应哪些硬件模块；动画如何用小数组解释数据依赖。静态源码不能证明任意业务 shape 的最终融合数量、指令数量或设备性能。

## 固定来源

| 仓库 | 本轮实际 HEAD | 相关文件状态 |
| --- | --- | --- |
| triton_shared | `a6161ef94b1941f786ce05d4e31104ec91ea22d4` | 核对时无 tracked 修改，未将其他 untracked 文件作为证据 |
| torch_zeus | `6ae99c68bc08476766b1d00e07b97b8df6a1ceeb` | 核对时无 tracked 修改，未将其他 untracked 文件作为证据 |

RTL 数据通路身份与出口核对另见 [RTL 深度记录](vp-rtl-depth-20261115.md)。本文引用路径均相对对应仓库，不把本机绝对目录放进公开内容。

<a id="mapping"></a>
## 值图、模块列表与物理合同

- `triton_shared/lib/Dialect/ZeusHigh/Transforms/VPChaining/ModuleOrder.cpp:43-63` 给出基础与 scalar 区域的物理顺序。`tryMergeModuleLists` 检查正向顺序、支持的 SUM0→SUM1 重映射和 scalar 区域合法性。
- 同文件 `baseCandidatePreservesCmtRoute` 明确：Compare tree 的结果走 scalar 路由，后续基础向量模块仍读取原始向量流。不能仅按模块序号将树结果解释成普通向量后缀输入；另有证明过的 scalar candidate。
- `lib/Dialect/ZeusHigh/Transforms/VPChaining/VPChainingLegality.cpp:578-622` 检查 producer/consumer、中间 buffer 的其他用户、alias 和内存动作；延迟读取可能跨越写入，因此存储语义不能只依赖数学图。

<a id="sigmoid"></a>
## SwiGLU、fast 与 accurate Sigmoid

### 实际 kernel

- `torch_zeus/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_silu_and_mul.py:31-98`：输入 `[N,2D]`、输出 `[N,D]`，前后半行为 gate/up；展宽到 FP32 后计算 `x * tl.zeus.sigmoid(x, approx="fast", seg_num=64) * y`，最终 BF16 存储。原 x 有多个使用者。
- `python/glm53_flash/moe/sgl_moe_router_linear_biased_topk.py:1329-1345`：Shared 激活明确调用 fast sigmoid；LIMIT 的 gate/up 截断由调用决定，激活转 BF16 后进入后续 `tl.dot`。这些不是所有 SwiGLU 的通用定义。

### fast 的真实模块

`triton_shared/lib/Conversion/ZeusLinalgToZeusHigh/ZeusLinalgToZeusHigh.cpp:2140-2250`：

1. 特定 fast sigmoid 64 段分支建立 `max(x,-104)` 下界处理。
2. `prg_load` 编程参数状态，随后 `prg_x` 计算使用该表。
3. 计算链上 CMT 做 `min(x,10)`，避免饱和段的零斜率与无穷输入相乘。
4. PRG 提供 k/b，`mul_x_k`、`sum_1_x_add_y_or_b` 实际计算拟合值。

不能用“PRG 返回精确 sigmoid”代替这组操作。动画 fast 模式使用精确数学 sigmoid 作参考值，明确不模拟生产表误差；它的模块连线、旧值依赖和 FIFO 约束来自源码。

### accurate 的真实依赖

同文件 `1582-1903` 为当前 accurate 分支；不能照抄相邻历史注释推断当前实现：

- 正常分母：PreCal 负号与 CMT 有确定顺序；A 上 `MUL(log2e)→FLR→SUM1` 分离整数/小数，B 上 `PRG→MUL→SUM1→SHF` 形成指数，PostCal 加 1。
- 原 x 的极负尾部另有 carrier、clamp 与 shifted exp；`x<-80` 选择尾部，`-104` 下界与指数偏移 23 / 后缩放 `2^-23` 用于避免误处理 FP32 极小值。
- 先完成使用 exp2 表的正常与 tail 计算，再改装 reciprocal PRG 表。
- `DIP→PRG→MUL→SUM1→SHF` 得到倒数种子 r0；后续计算 `c=2-d*r0`、`r1=r0*c`，不能删除 d/r0 的二次使用或提前释放 scratch。
- PostCal 修正保留原 FP32 MUL→MUL(-1)→ADD(2) 次序，不把它当作任意可结合的精确实数表达式。

动画 accurate 模式仅放大 `x=1` 的正常支路。它故意设置教学种子 `r0=0.97/d`，验证一步 Newton 后相对误差为 `0.03²`；这不是生产 LUT 的误差估计或设备测量。完整尾部合同在主文表格中说明，不声称动画覆盖完整数值实现。

<a id="rmsnorm"></a>
## RMSNorm 的两遍读取与显式行状态

- `torch_zeus/sgl-kernel-zeus-triton/python/common/rmsnorm.py:82-120`：`sum_sq` 明确为 `[BLOCK_T,1]`，第一遍逐块平方和归约，整行形成 rrms 后第二遍重新读取 X 与 weight，结果按 BF16 输出。
- 同文件 `:162-175`：host 调用 `reduction_row_tile`，不能把源文件顶部的初始常量或动画窗口当作实际 launch tile。
- `triton_shared/lib/Dialect/ZeusHigh/IR/VPModuleDefs.cpp` 中 `rsqrt` 模块生成与 `AddModuleListForVP.cpp:451-454` 的 rsqrt policy，说明具体模块配方与参数需按实际 op/layout 核对。
- `lib/Dialect/ZeusHigh/Transforms/VPFeedback.cpp` 处理反馈路线；多 VP 中的标量归属还要通过 producer/consumer 的分片关系证明，不能只因值是标量就假设可跨执行器复用。

正文给出 `[4,4096]` BF16 的逻辑字节账：X 两遍 65,536 B，γ 理想共享 8,192 B，输出 32,768 B，合计 106,496 B；γ 每行各读时为 131,072 B。该计算不含 padding、临时状态、实际 descriptor 服务和外部存储流量。

动画用 8 元素、每组 4 元素演示第一遍的 30+174=204、行系数、第二遍输出。组宽仅为展示窗口，不是硬件 lane 或当前 kernel tile。数值是实数模型，不模拟硬件归约顺序、rsqrt 近似、FP32 舍入或 BF16 窄化。

<a id="topk"></a>
## TopK 跨轮 Mask、TKV 与物理 packet

- `triton_shared/lib/Dialect/ZeusHigh/Transforms/ExpandTopK.cpp:39-87`：中间轮使用 `cmp_mat_tree_c_w_h_msk`，末轮使用 `_msk_out`；TKV 是当前槽位；末轮设置 TKVO 和 MSKRC，包含 K=1。
- 同文件 `:109-163`：primitive K 限定 `[1,16]`，展开 K 个 `topk_step`，每轮设置 `tensor_mode=1`。这不是所有高层逻辑 TopK 的普遍上限。
- `lib/Dialect/ZeusHigh/Transforms/TopKContract.h:21-32`：物理输出前 16 个 FP32 值 word，后 16 个 i32 索引 word，32 word / 128 B；索引偏移 64 B。
- `ExpandTopK.cpp:129-138`：native packet 的传输不能证明 inactive slots 已写。每半只有前 K 项有定义；`BindTopKPacketDestinations` 对观察者有额外证明职责。
- `python/glm53_flash/moe/sgl_moe_router_linear_biased_topk.py:1314-1320`：使用 `scores+bias` 选择索引，然后对原始 scores gather，最后归一化；TopK biased value 不能直接替换原 score 权重。

RTL 出口核对：Mask 输出 packet 回到 Compare 的 packet selector；经 A/B 合法旁路、SMT tensor 旁路、向量/标量出口选择、ReLU 旁路、PostCal 后写回。不能画成 Mask 直接跨过算术链接尾出口，也没有直接绕过 PostCal 写 L2 的路线。标量 SQR 结果则先经 S2P 组包再参与尾出口选择；反馈是 S2P 之前的独立分支。

动画的示例值互异。模型在等值时用较小原始索引建立稳定 oracle，但主文明确它不是硬件 tie/NaN 语义的证明。最终帧清 Mask 且保留已提交结果；单独重跑能重新得到完整结果。

<a id="chaining"></a>
## 融合门禁与 PostCal 特定配方

- `triton_shared/lib/Dialect/ZeusHigh/Transforms/VPChaining/VPChainingLegality.cpp:680-722`：最多两个 tensor operand；单独外部 Y 消费目的地；外部 Y、PRG.b、FLR.s、DIP.s 在通用 CAL FIFO 上最多一个来源类别。
- `ModuleOrder.cpp` 检查模块严格向前和可证明的 scalar remap；比较树路由不能误接基础算术后缀。
- `PostCalScalarChaining.cpp:96-198`：匹配有证明的 producer/consumer、私有 FP32 中间值、类型与存储动作。producer 的 BF16 输入可精确展宽；也允许满足合同的 tensor-Y 乘法；最终消费者可按合同窄化。
- 同文件 `:185-192`：MG0V/QK 或 tensor-Y/QK 使用固定顺序；不能预乘系数或消除 FP32 舍入点。

正文的 `8E` B 是删除 E 个 FP32 元素的一次写与一次读的逻辑量，不是实测带宽收益，也不暗示所有算例已经融合。

<a id="multivp"></a>
## 多 VP 分工和状态归属

- `triton_shared/docs/executor/multi/VP_Usage_Guide.md:58-85` 定义 exact 与 auto 局部策略；`:145-180` 描述 Tree-C 行分区、singleton broadcast 与 lane-local scalar feedback 的前提。这里的执行器分片不能混同 32 个 SIMD lane。
- 继续核对 `lib/Dialect/ZeusHigh/Transforms/ParallelVPPlanning.cpp`、`ParallelVPAnalysis.cpp` 与 `VPFeedback.cpp` 中的 policy、split、依赖闭合和反馈选择；不能从 hint 的存在推断最终编译采用了某个分片。
- 当前公共 RMSNorm 没有凭本文自动新增 exact 4VP hint。主文每 VP 一行的 `[4,4096]` 是条件性分工说明，不冒充当前所有 launch 的既定结果。

## 本地实现和验证

`web/vp-operator-lab.js` 提供四种走读：SwiGLU、accurate sigmoid 正常支路、RMSNorm、TopK。默认静止，可前后步进、跳阶段、播放/暂停与重置；隐藏、离屏、打印和离开章节时停播。`web/vp-operator-lab.css` 只作用于该组件。三个正文挂载点都保留无脚本和打印表格。

`node scripts/check_vp_operator_model.js` 通过：独立整行 RMSNorm oracle 与不同 chunk/tail；行状态隔离；TopK 排序 oracle、等值规则、负值、唯一索引与 Mask 清理；SwiGLU 原值保持；Newton 相对误差平方。模型测试不等于 VCS/RTL、设备 kernel 或整模验收。页面集成和截图由主任务统一验收。

文件 SHA256 见同名 `.json` 记录；哈希用于绑定实际读取内容，不赋予静态代码以设备实测等级。
