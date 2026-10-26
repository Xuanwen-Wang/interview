# GEMM 中端真实 IR 审计与章节交付

采集/审计日期：2026-10-26。业务库只读；本子任务未构建、未编译、未运行模型或仿真。主任务使用现成工具运行一次 `zeus_compile.py -S -v`；本报告只解释其产物，并独立核验当前源码。

## 1. 最适合贯穿的真实案例与证据边界

主例是 `python/zeus_examples/GEMM/gemm_normal_dense_bf16xbf16_bf16dst_f32acc_128x128x128_1core.py`，函数 `gemm_mkn_loop_f32acc_kernel`。同次编译保留了 Python、TTIR、中端逐 pass、最终 ZeusHigh、后端逐 pass、汇编。原 kernel 未改动，采集副本与当前业务文件逐字节相同。`compile.stdout` 确认三个阶段均完成。

编译签名固定 A/C 为 BF16、W pointer list 为 i64 指针，M/K/N 为 i32 运行时参数；常量为 CORE_NUM=1、BLOCK_M/K/N=128。计算是 C[M,N] = A[M,K] × W[N,K]ᵀ，K 累加 FP32，最终转 BF16。

必须分开三类证据：

1. **真实编译产物**：`gemm-capture/ir/kernel.*` 均由同次编译生成；工具与脚本编译前后 SHA256 相同。
2. **当前源码解释**：固定 `triton_shared` HEAD `82613bc2eb30feb9ef7f57aef20584df0ef9e28a`，下方列出的源码没有 tracked diff。仓库其他 dirty 存在，不能简称整库 clean。
3. **教学代入**：M=130、K=260、N=130 只用于对运行时公式代数求值，**不是本次仿真输入**。没有运行这组数据，也没有数值正确性、CycleSim、VCS、RTL 或性能结论。

现成工具由哪个完整源码树构建尚未证明；不能把工具哈希等同于 `82613bc2` 的 build identity。源码与 dump 的一致之处作为双向解释，不能虚构可复现源码构建链。

## 2. 同一条 IR 链的精确定位

| 文件/阶段 | 行号 | 读者应看到的改变 |
| --- | --- | --- |
| kernel.py | 48–61、64–95 | A/W/C block pointer，M/N/K 循环，boundary_check，dot、累加与最终 cast/store |
| kernel.ttir.mlir | 19–25、30–43 | 完整矩阵 shape 与 stride、请求块、advance；dot 的 C 为零，随后独立 arith.addf |
| kernel.midend_passes.log / Phase A 最终 TritonToLinalgExperimental | 2304–2372 | MemRef alloc/subview/copy/transpose；独立 partial matmul 与循环 accumulator |
| 同日志 / ExpandDim | 3082–3142 | fmap 4D、PE weight 3D，boundary 轴随补维迁移 |
| 同日志 / HWAdapt | 3143–3200 | W copy+transpose 消失，PE RHS 直接连接 weight subview；A load 保留 |
| 同日志 / CreateFmapDesc | 4981–5043 | load/store、SRAM 与 GDG 的显式 source/tile/position 配方 |
| 同日志 / CreateWeightDesc | 5044–5123 | normal BF16/WBS128 的基地址推进，source [1,128,K]，K 有效范围 |
| 同日志 / UnifiedBoundaryGuard | 5204–5326 | M/K 有效域沿 LD/PE/VP 传播，最终 ST 独立裁剪 N |
| 同日志 / GuardEmptyCore | 5327 起 | 空任务责任与至少为 1 的编码保护分离 |
| 同日志 / LegalizeBRAddressing | 5581 起 | 完成语义边界之后把大位置重定位到地址 |
| 同日志 / AddressAllocation | 7045 起 | 分配物理地址；不是当前 pipeline 的最后一个 pass |
| 同日志 / VerifyNoReshape | 7247 起 | AA 后仍有 SisoPairPlanning、VerifyNoReshape；不可沿用旧代理说明的“AA 必须最后” |
| kernel.zeushigh.mlir | 38–75、78–92 | LD → PE partial → VP acc → truncf → ST，最终地址、tile、重定位 offset |
| kernel.backend.log / kernel.S | 全文件 | 同次后端链，后半篇作独立后端审计；不是另一条 fixture 的结果 |

其中 `StructuredToMemref`、`OneShotBufferize`、最终 Phase A 是同一日志的不同状态。任何阶段 SSA 后缀都可能变，不可跨阶段仅凭 `%alloc_8` 名称认定同一个对象；需按源、用户、循环位置与 type 追踪。

## 3. 最重要的硬件问题：真正改变了哪些程序含义的表达

### 3.1 输入 pointer 不能过早压成一个地址

TTIR 19–25 同时保存 A 的 [M,K]、stride[K,1]，W 的 [N,K]、stride[K,1] 和 C 的 [M,N]、stride[N,1]。末尾 tensor<128x128> 是请求块，不是完整矩阵。A 的全局 pitch 是 K，即教学代入的 260，不是 tile128。

选择保留结构化 pointer→MemRef，使中端还可以区分“逻辑范围”“物理行距”“当前窗口”。前端直接发 DMA/PE 指令的替代方案减少层数，却把描述符字段与目标布局扩散到 kernel/通用前端；过晚恢复这些信息又可能已丢失逻辑边界。这里“为什么这样分层”是依据当前责任划分的架构分析，不是声称亲历当年的全部讨论。

源码：`include/triton-shared/Conversion/TritonArithToLinalg/ConversionPatterns.hpp:1219–1295`；`lib/Conversion/StructuredToMemref/StructuredToMemref.cpp` 中 block pointer 与 masked load 的路径需要分开。

### 3.2 不能把 dot 的结果与 K 循环 acc 合成一块

真实 TTIR 37 是 `tt.dot(A, Wᵀ, zero)`，38 才是 `arith.addf(old_acc, dot_result)`。Phase A 2352–2355 有独立 FP32 partial buffer 与 accumulator。

当前 PE `C=A×B` 覆盖输出。若把 partial 与 accumulator 共址，PE 会先毁掉上一轮的和；后续 VP 再读到的是错值。最终 High 62–75 仍分配 partial，PE 写它，VP add 读它并更新 acc。通用 linalg.matmul 的零初值 copy 可因目标 PE 覆写语义删除，但不能把跨 K 的累计一起删除。

128×128 FP32 acc=64 KiB、partial=64 KiB、A BF16=32 KiB。它们是容量说明，不等于已证明峰值物理占用或最优调度。若要融合累加，需要硬件语义、浮点舍入、空 K、存活期、异步顺序的额外证明。

源码：`TritonToLinalgExperimentalPass.cpp:512–522` 的 copyBeforeWrite 单 writer 策略；`HWAdapt/MatmulFillElimination.cpp:54–57` 的 PE 覆写语义。该策略后有 iter-arg 简化与 InplaceBufferize，不代表永久保留所有临时 copy。

### 3.3 W 的 transpose 为什么能消失，A 的 load 为什么留着

ExpandDim 后 3119–3128 有 A load、W dt(copy)、W transpose、matmul、add；HWAdapt 后 3180–3186，matmul RHS 直接指向原始 weight subview，W copy/transpose 不在了，A load 仍在。两个 128×128 BF16 临时各32 KiB，但本次没有测性能收益。

PE 的 normal weight 路径直接读取专用 Weight DRAM 布局。删除的是运行时 SRAM 物化，不是删除数学上的 Wᵀ；正确的坐标映射由 weight descriptor 与事先打包约定承担。当前 `WeightDirectRead.cpp:33–118` 只对识别到的 weight/kcache/vcache 链及其约束生效。无 transpose 分支另要求独立 alloc、唯一 producer 和受限用户，不能把任意 transpose 都按同样方式删掉。

替代方案保持一般 copy/transpose，表示统一但消耗片上容量与搬运；让 kernel 直接写硬件 PE 接口则加重算子作者的目标负担。中端在 producer–consumer 关系仍清晰时作出目标选择，是本例能直接观察到的分层价值。

### 3.4 BR/descriptor 是地址解释，不是只有 shape

CreateFmapDesc 5001–5002 和 5017–5021 把全局源与 SRAM 目标分开：GDG 用完整 shape/stride 导出的地址几何，L2 用局部 buffer 的地址几何；load 的两个 descriptor 不能共用一个位置。

`set_pos`/`update_tile` 覆盖相应字段，不是隐式相交。descriptor SSA view、backing allocation、物理 BR 驻留是三类身份。最终 `%49` 与 `%59` 是 A 的 LD 目标与 PE 输入配置，均沿 `%44` 回到 `%alloc_1`，addr65536，size32768；不同配置值没有创建两份数据。后端必须沿 storage/物理区间维护真实依赖，单纯 descriptor SSA def-use 不够。

硬件字段的 decoded extent 限制为 N≤256、H/W≤4096、C/K≤1048576，不能用寄存器模式输入更宽值就认为最终字段变宽。`ValidateDescWidths.cpp:18–33`、`LegalizeBRAddressing.cpp:413–432` 是当前源码证据；有关早期动态快路径的 register/spill 数字只能当源码记录的历史动机，不能充当本例性能实测。

### 3.5 补维迁移的是整套轴语义

ExpandDim 3116–3124：A [M,K]→[1,1,M,K]，boundary[0,1]→[2,3]，position 前补零；W [N,K]→[1,N,K]，只有PE weight走三维，不能推及所有 weight访问。fmap 的 [N_hw,H_hw,W_hw,C_hw] 与算法 M/N/K 不同：A 对应 W_hw=M、C_hw=K；输出 W_hw=M、C_hw=N；weight 的 [N_hw,K_hw,C_hw]=[1,N_algo,K_algo]。

单位维不移动数据，不能趁补维将非单位 stride/offset 改成连续。`ExpandDim.cpp:29–57、90–142、237–249` 与当前 pipeline 151–215 支持上述责任边界。通用 reshape/affine 先处理，再统一目标 rank；这比后端每条指令重复兼容任意 rank 更容易维持一致契约，代价是 pass 必须同步 type、view、boundary、循环和分支携带值。

### 3.6 当前 weight 的 block_offset 不能按普通行主序讲

CreateWeightDesc 5089–5104：padded_K=ceil(K/64)×64；blocked_offset=n_start×padded_K×2 字节；source变[1,128,K]，PIK清零，PIC仍为k_start。本例 BF16/WBS128 路径的 PIK 只寻址当前 block，跨 block 要推进 SAddr。K=260 时 padded_K=320，n_start=128 时偏移81920B。

这只证明 block 起点，不意味着块内逐元素按普通行主序。`sim_check/sim_framework/weight/transform.py:16–51` 的 normal BF16 打包补齐并变换成七维布局，是独立源码的输入契约；这次编译未执行打包或数值运行。

fmap 名为 `dynamic_byte_offset` 的字段在当前 High 实际仍承载元素偏移：A 为m×K+k=33536元素，Phase C 再×2=67072B。weight `blocked_offset` 已是字节。必须给字段逐个标单位，不能凭命名推断。

源码：`CreateWeightDesc.cpp:1063–1225`；`ZeusHighToZeusLow.cpp:2833–2849`；`LegalizeBRAddressing.cpp:326–397`。不能把这条 normal BF16/WBS128 规则泛化到所有WBS/cache/INT4/FP8格式。

### 3.7 尾块在各执行器不一定一样大

教学代入 M130/K260/N130，末 m=n128、k256：

| 对象/动作 | 有效范围 | 注意 |
| --- | --- | --- |
| A 的 LD | 2×4 | source/target各自保留pitch，搬运窗口收窄 |
| weight PE输入 | 128×4 | N物理block仍128，不是所有128都属于逻辑输出 |
| PE部分结果 | 2×128 FP32 | M缩，N未缩 |
| VP累加/最终cast | 2×128 | 不读PE未写的M行 |
| ST | 2×2 BF16 | 最终全局N边界在这里约束 |

最终 High 63–74 与 80–92 是直接证据。不能写成“PE也只计算2×2”或“所有N尾冗余消除”。逻辑W有效是2×4，但physicalblock仍承载128×4，专用打包补齐是输入合同的一部分。

缩小LD后，SRAM未写区域不自动为零，必须同时限制PE K与VP行范围，或选择另一条显式填中性值的实现。当前 main block-pointer 路径并没有证据支持“整个尾块 memset零”；一般masked load的other仍需尊重，`StructuredToMemref.cpp:350–381、1043–1078`有不同路径。

`min(block,max(remaining,1))` 是编码保护，不是空任务合法性证明。GuardEmptyCore/控制流负责空任务；当前阅读的正末块不会出现该分歧。

最后，先处理逻辑boundary/empty task，再把坐标折进地址：`LegalizeBRAddressing.cpp:310–315` 明确这个前置契约，重定位后局部source window不能代替原始逻辑边界。

## 4. 真实反例、测试夹具与主链严格分开

- `test/ZeusV3Midend/Unit/Transforms/create_fmap_desc_runtime_gdg_pitch.mlir:32–54`：独立手写夹具，逻辑宽16、pitch32、从列8请求16，正确有效宽8；按pitch裁边会误成16。它支持“物理pitch不是逻辑范围”的反例，但不是这条GEMM中间dump。
- `test/ZeusV3Midend/Unit/Transforms/hw_adapt_weight_direct_read_cast.mlir:1–36`：独立weight cast/copy/transpose变换夹具。不能把RUN通过或CHECK内容当此次编译结果；本任务未执行它。
- `test/ZeusV3Midend/Unit/Transforms/expand_dim.mlir`：其RUN里执行单元映射/ExpandDim顺序是测试设置，不代表当前主pipeline顺序。
- `test/ZeusV3Backend/Integration/EndToEnd/matmul_mkn_aligned128_1core.mlir`：kernel文件注释明确称对应“手写MLIR测试用例”，不能接到本次TTIR后声称同一次编译的Low。
- 历史两核N130 store overlap：按归档与修复提交独立核验。旧global-bound缺少per-core ownership，不是简单“compiler裁错”。旧core0写[0,128)、core1写[65,130)，重叠63列；修复显式core轴。历史Python数值maxdiff0但rc1/dirty mailbox，不可写PASS；历史compiler revision未证明，和新采集singlecore链分开呈现。

## 5. 面试官值得追问的五个责任边界

1. **为何不能用一个BR shape同时代表原矩阵、tile和尾块？** 要能给K260的全局pitch、128分配、Kvalid4及重定位后的source window。
2. **为什么W transpose可删，普通transpose不能照删？** 要给producer/consumer约束、weight布局合同、数学转置仍存在的解释。
3. **为什么PE partial和acc必须分开？** 要从真实dot-zero/addIR开始，说明PE覆写、跨K值存活与异步依赖，而不只是“硬件限制”。
4. **所有尾块都clamp到最终输出有效shape是否更优？** 本例实际PE N128，不能编造全裁；必须解释physicalweightblock和最终ST责任，并说明进一步优化需要验证什么。
5. **补维/重定位能否随便改pass顺序？** 要指出boundary轴迁移、原始逻辑坐标丢失、字段上限与empty-task保护，而不是背pass名称。

可在总文CUDA/GPU对照中比较责任归属：通用pointer/tensor语义、目标布局与描述符、异步访问的配置/数据依赖；不要声称GPU不存在descriptor、mask、同步或TMA等机制。具体GPU代际/指令事实需另用官方来源。

## 6. 交付与验证

`drafts/gemm-midend-sections.json` 提供八个可直接集成的section对象；HTML中的原始IR逐块从同次日志提取并转义，没有手写/重命名IR伪装dump。各节分别给实际变换、硬件约束、替代方案成本和来源。根任务统一绘图，因此本子任务不输出SVG。

已验证：JSON能解析；8个ID唯一；全部pre/code片段逐字匹配至少一个原始dump；采集kernel与当前源文件逐字节相同；前后工具manifest相同；以下引用源码无tracked diff。没有对业务仓库执行构建/测试/仿真，也没有改业务文件。未执行HTML实际浏览器验收，交由根任务集成后进行。

## 7. 哈希清单

### 7.1 工具与采集产物

以下文件SHA256在报告生成时读取。工具前后manifest逐字节相同，完整工具身份见其内容。

```text
9d99759e9f835c4b114f12443e9c4bd00b1756d04dd11c19c7f85f3eda2ebb9f  build/bin/triton-shared-opt
a54b9b1cd15025563015ccab906c76b52f921e033756456464550d38f54bc546  build/bin/zeusv3-backend
c5df3d83c7b114052c5f0c4680f0ee9770e800999af899b3fc7c29a177f1ae3a  build/bin/zeus-compiler
7bae9277f26a2586b945ff3d7d9c12cec6340762ab591ebf63bca6058264252e  zeus_compile.py
6cb349d6d67abbe7fa23c02987c579bea6226099e633bcabf94dff9697c6db9b  capture/kernel.py
```

| 采集文件 | SHA256 |
| --- | --- |
| `compile.stderr` | `7369a73c70f7a97c4461b60180f8dc561c8707cf5c49f5fcaf8f43acd5a16b46` |
| `compile.stdout` | `e7f091ad55425be2c375664a62ac71d59b396de66db242837a57e9125d8e440d` |
| `env.log` | `324526eeaa33cadd721b60e3b72a8c1cb968c3d73fd04eb6ecfb7f5f5173128c` |
| `hashes-after.txt` | `b9aa2525a576ea51f37002e1ca6149768f88b493ea28d9308d3ed0d59465525f` |
| `hashes-before.txt` | `b9aa2525a576ea51f37002e1ca6149768f88b493ea28d9308d3ed0d59465525f` |
| `ir/kernel.S` | `d083dd637b7e766ca117e324ec851f91d99d754f3a011cf20134152944f80b9e` |
| `ir/kernel.backend.log` | `e1957c09332b6e75c9f2878098cb2b5009f5210e5d966da801026d047bc3610d` |
| `ir/kernel.midend_passes.log` | `7b3224d5720b20bcd6be63761ff6eb5395317ea481a5db379a8a01592cabef7c` |
| `ir/kernel.ttir.mlir` | `d64a2cf660f50340c41848eb69a93a729655e46efbd1f73550df7ec4d93d61af` |
| `ir/kernel.zeushigh.mlir` | `4f31aca78fd9ea0b5bb5b177d772c3a60f8532cfd160ff8bc351e340af697012` |
| `kernel.py` | `6cb349d6d67abbe7fa23c02987c579bea6226099e633bcabf94dff9697c6db9b` |

### 7.2 当前源码与独立夹具

当前HEAD：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`。以下文件在审计时均与HEAD一致（仅对本表文件检查diff，不代表整个业务库clean）。

| 相对路径 | SHA256 |
| --- | --- |
| `python/zeus_examples/GEMM/gemm_normal_dense_bf16xbf16_bf16dst_f32acc_128x128x128_1core.py` | `6cb349d6d67abbe7fa23c02987c579bea6226099e633bcabf94dff9697c6db9b` |
| `include/triton-shared/Conversion/TritonArithToLinalg/ConversionPatterns.hpp` | `bd211e1af89f3f4d717d29cf99c5981dae38442b4d8e4dd5a5cf2c8aa71442e3` |
| `lib/Conversion/TritonToLinalgExperimental/TritonToLinalgExperimentalPass.cpp` | `2895e2379ff8603206bbe94ec95c1e84d7014a76f323b8c0ea7f2c4d9723668b` |
| `lib/Conversion/LinalgToZeusHigh/LinalgToZeusHigh.cpp` | `dc5d76838cc3c1de3d1eb5ae4a56a11cda49b4df829c550018d0461a05709e8a` |
| `lib/Conversion/StructuredToMemref/StructuredToMemref.cpp` | `ad5117f19f3fbf5b546f4e5c658248d5162c9d6f7e5ac0011c1c19337c2c5d41` |
| `lib/Dialect/ZeusHigh/Transforms/HWAdapt/WeightDirectRead.cpp` | `0f85f9d6efc2ac574786067fa4342d3f411cd0f060410bbdf04bc0538e4cd696` |
| `lib/Dialect/ZeusHigh/Transforms/HWAdapt/MatmulFillElimination.cpp` | `9d90e0d18794f4b15e91f2beebff80622471c1491fafe6a2a018ab9b0b0916f8` |
| `lib/Dialect/ZeusHigh/Transforms/ExpandDim.cpp` | `2fe449af6427e511612ab5b6732b09b51a88e9af4074949e10cf6b599b1a6045` |
| `lib/Dialect/ZeusHigh/Transforms/ZeusHighPipeline.cpp` | `118d7b62b796f52cefaac8e022ea7ea785ad5b0ee96ee0ab2a8f7e50f4736de1` |
| `include/triton-shared/Dialect/ZeusHigh/IR/Ops/ZeusHighDescOps.td` | `2dec95feb71bc6619a1329dd22c43e99484052b8ef6e642e62aadf1af621e8c6` |
| `include/triton-shared/Dialect/ZeusHigh/IR/Ops/ZeusHighWeightDescOps.td` | `9f064a0d6b6c65b61517c44e69f1ab107d62e730281c1ce0e181e18a76e41806` |
| `lib/Dialect/ZeusHigh/Transforms/CreateWeightDesc.cpp` | `a3e1726b9ecc73f81d2b8b5cdc161683c7b5adce1fe136bc1796efea3879b1a1` |
| `lib/Dialect/ZeusHigh/Transforms/CreateFmapDesc.cpp` | `dee20557db686be0e01f0fa03b76fa2011c3111714a7c278d94c10af9b573651` |
| `lib/Dialect/ZeusHigh/Transforms/UnifiedBoundaryGuard.cpp` | `e8fde3354d054ba13d658ac509d79dffe9b166d6d5e36f4812b8fb93f9cf1d51` |
| `lib/Dialect/ZeusHigh/Transforms/BoundaryGuardUtils.cpp` | `3d371286bcefb6e4822e7600d9dcc596a939a55f72d88d507a5f227723f4ca4b` |
| `lib/Dialect/ZeusHigh/Transforms/LegalizeBRAddressing.cpp` | `65f571cf6e1ebd60b11ed3af1860c0a738105ff6650a732b91c4d58840fbe780` |
| `lib/Dialect/ZeusHigh/Transforms/ValidateDescWidths.cpp` | `2b9968005d11ac999b1505f317ded73550f15f74a047cf18d6c06f5ef3f1b671` |
| `lib/Conversion/ZeusHighToZeusLow/ZeusHighToZeusLow.cpp` | `00d23c78e9434c76f55fc140e63d9043362f550a8bd1608367d2af287ef4d91f` |
| `include/triton-shared/Dialect/ZeusLow/IR/Ops/ZeusLowAllocOps.td` | `5e0ec18e62594482a402e60ae6689f637bad406010cf64a38742fb649bb2dc82` |
| `sim_check/sim_framework/weight/transform.py` | `adbd7a07fffe73c36055db43c4183f5e3e603ba21e00d1258c7672a2002c71ae` |
| `lib/Dialect/ZeusHigh/Transforms/GuardEmptyCore.cpp` | `619251bc11b4ecc0a5e5358cd4516e0333de1974a13e3cebcf98dd3d0419295a` |
| `lib/Dialect/ZeusHigh/Transforms/BufferDealloc.cpp` | `535606a3269579cfb295943cbe2569b18b2b220c7dfb2a5fc546b9552a51a4f6` |
| `lib/Dialect/ZeusHigh/Transforms/AddressAllocation.cpp` | `4c6485f82b7420062ba389f056c3389a46eb66d625aa7ab3176a104e109cf05f` |
| `lib/Dialect/ZeusHigh/Transforms/BankConflictPadding.cpp` | `03b3ea21c4694c11dfe664b509027cc9ce6b4aac67e510b331542198ae74a0fa` |
| `test/ZeusV3Midend/Unit/Transforms/create_fmap_desc_runtime_gdg_pitch.mlir` | `1f67121a26c472b0340000d08a8f26e55c24da068650adc1bf56d8c29aa61c49` |
| `test/ZeusV3Midend/Unit/Transforms/hw_adapt_weight_direct_read_cast.mlir` | `de15b1356300f34bdf0e46341b07e91990309b1d4095fb85d46aee181480c76e` |
| `test/ZeusV3Midend/Unit/Transforms/expand_dim.mlir` | `482895526b648044ade284564cf8d38b179aff55970ff292d31601dda433ba2c` |
| `test/ZeusV3Backend/Integration/EndToEnd/matmul_mkn_aligned128_1core.mlir` | `26b27d8b0058f9e5b24d8da2ac3c950036b1da7d256486ee157142e71b3f54f1` |

自动核对记录：8个section，12个真实IR代码块均匹配原始文件；28个源码/夹具文件完成SHA256和tracked-diff检查。
