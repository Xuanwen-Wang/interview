# 编译器视角独立审查：算法、MoE 与交互实验室

审查日期：2026-10-23。第一轮独立审查；范围为 `content/10-algorithms.json`、`content/20-moe.json` 全文及 `web/app.js` 三个实验室的单位、公式和边界。审查人只写本记录，未修改其他作者文件。

结论：未发现 P1。发现两项 P2 证据表达问题，已通知主编；最终读回时两项均已修正。当前没有剩余阻断问题。教材能支撑资深 AI compiler 面试的机制、合同、反例和证据追问；下列建议用于后续进一步提高源码与执行产物之间的可追踪性。

## 审查边界

- 逐章阅读算法六章、MoE 六章的正文、问答、来源和结论，重点检查 518 映射、形状、ownership、ABI、状态更新、通信、定量口径与验证层级。
- 只读核对 `zeus_dev@05ee10f9cc25d19fca0a144ae095c79b3a888976` 的配置、KDA/DSA/MoE runner 与通信实现；所抽查文件相对该 HEAD 无本地改动。
- MoE 最新实现使用已有 git object `torch_zeus@882bdf9be61303f826cc3eb3338c2c716f898909`，通过 `git show` 核对。当前工作目录 HEAD 是更早的 `68f19fa0a159b8ff861dc9cf736d9c0ae64906ba`，没有把旧 checkout 当成 PR588 的最终代码。
- 没有运行 kernel、编译器、CPU reference、CycleSim、VCS、实板或性能测试；历史性能和数值结果仅确认与冻结记录一致。没有重新查询 PR/issue 实时状态，也没有重新审查所有公开论文。
- 下面源代码位置使用仓库相对路径与 commit；私有仓库内容仍需原访问权限。本记录不复制内部服务地址、操作目录、原始业务输入或完整日志。

## 发现与修复读回

### P2-01：#592 首次分歧表需直接标注 CycleSim 证据层级 — 已修复

位置：`content/20-moe.json:562`，`moe-quantization-and-592` → `592-first-difference`。

初读版本把冻结报告的“CycleSim PE dot”缩写为“PE dot”，其余两行使用“实测 BF16 Up / 实测 FP8 激活”。单独阅读这个章节，会把模拟器对 PE 的累加观测误读成 RTL 或实板观测；数值本身正确，但证据层级不够直接。

证据：`torch_zeus@882bdf9be61303f826cc3eb3338c2c716f898909:dev_docs/evaluations/moe_issue592_20261022/README.md:13-26`。第 13 行明确冻结 CycleSim 与编译器身份；第 19 行明确是 **CycleSim PE dot**。FP64、CPU FP32、CycleSim 的 dot 分别为 `3784.00030517578125`、`3784.0`、`3784.000244140625`，这三项不能反向证明任意硬件实现采用相同累加树。

建议：表中使用“CycleSim PE dot（历史记录）”“原 CPU / CycleSim BF16 Up”“原 CPU / CycleSim FP8 激活”；叙述补充冻结环境更利于脱离前后文阅读。保留数值、阈值以及 FP64 参考不模拟内部累加树的限制。

最终读回：三个表格标签均已改成明确的 CycleSim 标签，并保留冻结定位记录链接。该 P2 已关闭。本案例仍只证明这个冻结输入的因果定位和参考修正，不构成新一轮全量精度或 RTL 验证。

### P2-02：三档 A/B 表应披露不同上下文与 capture 身份 — 已修复

位置：`content/20-moe.json:437`，`moe-token-merge` → `merge-result`。

初读表格只有 T16/4 req、T24/6 req、T32/8 req。虽然各行 PR570→PR588 配对结果正确，但在讨论低并发与硬件饱和的教材中，读者容易把三行视为“只改变 T”的同一输入伸缩曲线。

证据：`torch_zeus@882bdf9be61303f826cc3eb3338c2c716f898909:dev_docs/evaluations/moe_routed_v122_20261022/README.md:26-34`：

| 实际 T | 冻结输入身份 | 能支持的比较 |
| --- | --- | --- |
| 16 | PR567，BS16 / 64K / step0 | 该固定输入上的版本配对 A/B |
| 24 | PR572，BS24 / 4K / 首个 decode / b01 | 该固定输入上的版本配对 A/B |
| 32 | PR583，BS32 / 4K / 首个 decode / t8b00 | 该固定输入上的版本配对 A/B |

建议：表格注明每行的上下文与步次；紧接表格说明三行不是单变量伸缩实验，跨行变化不能全部归因于 batch。可在来源账本保留 batch ID，主表不必塞入全部元数据。

最终读回：表格增加 `64K / step0` 与 `4K / 首 decode`；新增醒目说明“这三行不是只改变 T 的同一工作负载伸缩曲线”，限定每行只支持固定输入下的配对 A/B。该 P2 已关闭。

## 关键源代码核对

以下不是对全部源码的形式验证，而是对会影响叙述可信度的关键路径做抽核。

| 教材主张 | 直接证据 | 判断 |
| --- | --- | --- |
| 内部 Next 配置 H4096、45 层、前三层 Dense、其余 42 层 MoE；E288/top8/I2048 | `zeus_dev@05ee10f9: model_state_dev/glm5next_modules/configs/config_next.json` | 一致；正文没有把同名公开模型参数自动混入 |
| KDA 是先 decay、读出预测值、形成 delta、更新 state，再 query readout | 同 SHA 的 `dev_linear_attn_fused_tp4_dp4.py:243-274` | 与参考执行顺序一致，safe gate 和 Q scaling 均有区分 |
| KDA native BF16 状态轴序与旧参考需要显式转换，workspace/output 按 batch 和 call slot 区分 | 同文件 `478-549` | 一致；没有把数学状态布局直接当硬件 ABI |
| KDA local wrapper 单次 dual-core launch；all_reduce 由 wrapper 的可选 group 分支处理 | 同文件 `559-583` | 一致；没有把单 launch 当作无通信的全模型路径 |
| DSA 是三个计算阶段、三个通信步骤；pool group 选取后展开四 token，尾部另行处理 | 同 SHA 的 `dev_dsa_deepfused_cp4_dp4.py:324-336,450-467` | 一致；教材保留 topk token 数可能加尾部的条件 |
| TP4×EP4 的 rank 编号、I512、E72 与跨 EP lane | 同 SHA 的 `dev_moe_fused_fp8_tp4_ep4.py:1756-1757,1795-1802` 和 `_support/_comm.py:107-127` | 一致；逻辑 rank、Shared 权重 ownership、实际执行、最终通信分开 |
| Routed 输出是未乘路由权重的 `[T,8,4096]`；非本地行未定义；下游必须只消费 valid routes | `torch_zeus@882bdf9:sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py:1684-1696` | 一致；教材明确 NaN×0 不能充当有效性屏蔽 |
| 权重经历 block scale 恢复、BF16 舍入、per-projection FP8 再量化；不能只比较理想数学式 | 同文件 `1499-1514,1548-1560` | 一致；scale、舍入与激活 scale=1 的合同都有说明 |
| token merge 由设备 IDs 决定，host 分派仅用 shape/metadata；限制 owner、ID 精度与形状 | 同文件 `1750-1772` | 一致；没有声称所有 shape 或静态映射都走新归组路径 |
| T24/T32 专属 executor width 2 与 131072-byte headroom | 同文件 `1769-1772`；冻结 V122 报告 `48-58` | 一致；没有把逐 launch 设置推广为全局优化开关 |
| 42 层聚合按每 launch 双核各自 duration 的最大值，再 rank 内累加、TP 最大、EP 最大、逐层累加 | 冻结 V122 报告 `36-40` | 一致；不能替换为各组件独立最慢 EP 之和 |
| 4,032 是两版×三档×42层×16rank；holdout 与 Shared 审计另算 | 冻结 V122 报告 `72-79` | 一致；保留 Shared 解析超差，没有写成所有精度门禁通过 |
| #592 只修 CPU 投影累加，生产程序与原性能保留历史身份 | 冻结 #592 报告 `5-9,30-36` | 一致；未把单例补测外推全量、任意输入逐位一致或硬件通过 |

表中简写 `05ee10f9` / `882bdf9` 均指本记录前述完整 SHA；`dev_*` 相对目录为 `model_state_dev/glm5next_modules/`。V122 / #592 报告完整路径见上述发现。

## 三个实验室单位与数值复算

### 并发与性能：公式正确，已保留教学模型边界

位置：`web/app.js:91-93`。

- FLOPs 输入为 GFLOPs/token，计算吞吐为 TFLOP/s，`B*f/(p*u)` 的数值直接是毫秒，因为 GFLOP/TFLOP = 10⁻³。
- 权重输入为十进制 MB，带宽为十进制 TB/s，`w/bw/1000` 是毫秒。
- 固定开销 μs 经 `/1000` 转为 ms；`B/total*1000` 转成 token/s。
- 默认参数下 B=1：u=0.34375，compute≈0.072727 ms，memory=0.08 ms，total=0.092 ms；B=64：total=1.612 ms，吞吐≈39,702.23 token/s。与代码一致。
- 使用 `max(compute,memory)` 隐含理想重叠，仅表示该教学模型；没有据此宣称真实 PE 与外存一定完全重叠。文字也明确排除 KV、通信、路由不均衡等，并指出两类硬件都可能获得权重复用和利用率收益。

未发现单位或定量错误。未来可让用户同时调整 PE/VP 两种计算上限，以示不同 operator 混合后简单单一 FLOPs roofline 的局限；这不是当前阻断项。

### KV 容量：公式正确，口径与适用范围明确

位置：`web/app.js:94-96`。

- `2*L*H_kv*D*S*bytes / 2**30` 是标准 K/V 相同 head dimension 时的逻辑总 GiB/request。
- 默认 32 层、8 KV heads、D128、S32768、BF16 得 4 GiB/request；可用 40 GiB 得容量并发 10，完整逻辑扫描 4096 MiB。
- 明确预算已扣权重和运行时、不做 TP 分片，明确不能把这个公式直接套到 MLA latent 或 KDA recurrent state。分页与稀疏读取的叙述也没有声称逻辑存储自动消失。

未发现单位或定量错误。可选改进：把 `D_k=D_v` 的假设也写在公式旁；容量上限大于 64 时让横轴自适应，避免墙落在图外；小缓存采用 MiB 显示，避免四舍五入成 `0.00 GiB`。这些不改变当前数值正确性。

### TP×EP：映射正确，未混淆逻辑拓扑与物理封装

位置：`web/app.js:97-99`。

- `tp=rank%4`、`ep=floor(rank/4)`、专家区间 `ep*72 .. ep*72+71` 与 runner 一致。
- rank13 对应 EP3/TP1、专家 216–287、跨 EP lane `[1,5,9,13]`，本 TP group `[12,13,14,15]`；I_local=2048/4=512。
- Shared 真权重只有 EP0 与非 EP0 可能执行零权重占位已分开；四类本地算子不等于含通信的完整 MoE 延迟。

未发现映射错误。可选改进：增加直接跳到配置/四算子合同章节的链接，让交互选择和原始证据更容易往返。

## 是否能承受资深面试追问

能支持一轮 45–60 分钟的深入讨论，尤其是以下链条：模型形状→分片→字节量→算子合同→调度限制→数值边界→证据可信度。它提供了可演算的 online softmax、LSE 合并和 KDA delta-state 示例，解释了 DSA 选择与存储、MoE owner 与 launch、非本地未定义行与 NaN guard、融合与量化边界等容易被追问的细节。性能部分区分模型、测量、模拟器与 RTL，没有把合成输入或单 case 提升成整模结论。

结合编译器章节，可进一步追问“这个优化对编译器提出了什么可证明的合同”“为什么释放并行度仍不能删除真实 WAR/WAW”“同样的 Tensor shape 怎样因地址复用增加同步”“新编译器下为什么能复用旧性能”。这比仅列算子名称或 PR 数量更能体现资深工程能力。

后续最有价值的深度增量：

1. 选择一个足够小的真实 FFN 片段，保存同一版本下 TTIR→ZeusHigh→ZeusLow→描述符→物理地址→mail/PC 的连续产物；目前各机制均讲到，但完整的一条产物链还可以更直观。
2. 补一张真实 trace 的注释图，展示 PE、VP、DT overlap 与可复用地址生命周期；示意图不能替代周期证据，图片应带版本、输入、计时范围。
3. KDA 增加 warmup/Graph replay 会推进 recurrent state 的排错练习：如何重置或拷贝状态，怎样区分数值漂移与复用错误，怎样验证多步而非只验一步。
4. 增加同 shape、不同量化合同不能替换的代码练习，例如 per-block→BF16→per-tensor 与直接 per-tensor 的差异，要求指出第一处舍入边界。

这些是提升教材可操作性的后续项，不要求新增任何未经核验的性能或个人贡献声明。
