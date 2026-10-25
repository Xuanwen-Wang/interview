# 518 VP：编译器与 kernel 源码证据

<a id="vc-scope"></a>

采集日期：2026-10-25。仓库：`triton_shared`。固定 commit：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`。

采集时仓库整体为 dirty：存在一项已跟踪的 CI case 清单修改及未跟踪文件。下表所有引用文件均逐字节比较工作区内容与 `git show HEAD:<path>`，全部一致。本文未引用未跟踪调研稿、CI 清单的历史通过数字或个人路径。全部源路径均相对 `triton_shared` 仓库。

验证层级：**当前固定版本源码静态核验**。读取了 kernel、pass、后端 lowering 和回归 fixture；本次没有运行 compiler build、功能仿真、CycleSim、VCS/RTL 或真实芯片测试。fixture 中的 `RUN` / `CHECK` 是预期行为证据，不表示本次执行通过。硬件时序部分是编译器维护的 RTL 契约文档，直接 RTL 结构由独立硬件证据记录支撑。

<a id="vc-hints"></a>

## 1. 执行器数量与两种并行

| 事实 | 文件与行号 | 适用范围 |
| --- | --- | --- |
| VP 与 DT 各定义 4 个 executor，CSS 4–7 | `include/triton-shared/Target/ZeusV3/TargetInfo.h:30–32` | 编译器目标参数；不能由此推导每拍吞吐或 kernel 加速比 |
| `vp_hint(value, num_vp)` 接受 `auto` 或精确 1–4，返回 value；请求 producer 的局部 VP policy | `backend/language.py:117–126` | 编译期 marker，使用时保留返回值的数据流 |
| `vp_hint(..., num_vp=4)` 是精确局部拓扑要求；若对应操作无法合法拆为四路，则编译报错，不能静默降级 | `lib/Dialect/ZeusHigh/Transforms/AnalyzeVPSplit.cpp:2052–2058` | 区别于 `auto` 和全 kernel 选项；满足精确拓扑仍不证明运行时重叠或加速 |
| `parallel_executor_hint()` 在 kernel 顶层启用 analysis；候选选择、独立性证明与容量 fallback 保持原规则 | `backend/language.py:205–229` | 不是“强制所有操作并行”，也不携带 width |
| Multi-Executor 拆一个 logical tile；Parallel-Executor 将多个独立 logical op 的完整 tile 放置到不同 executor | `docs/architecture/parallel_executor.md:9–24,47–80` | 两者可在同 kernel 共存；同一个 op 的 split 与 exact placement 冲突时拒绝 |
| VP0–VP3 由 UNIT0–UNIT3 对应到 CSS 4–7 | `lib/Conversion/ZeusHighToZeusLow/ZeusHighToZeusLow.cpp:5726–5729` | 代码生成映射 |

教学案例：四个独立 add 可以分别放在四个 VP；一个大 add 可以切成四份。两者都需要检查真实汇编 CSS、访问范围、scratch 容量和同步。kernel 级 `parallel_executor_hint()` 存在只证明申请了 analysis；局部整数 `vp_hint` 则必须满足相应精确策略。`ZEUS_RESOLVED_NUM_VP` 或指令条数均不能单独证明实际 overlap 或收益。

可定位的完整源码示例是 `python/zeus_examples/VP/parallel/test_add_bf16_parallel_4vp_hint_kernel.py:19–46`：先形成四组独立输入，再执行四次 add，最后写各自输出。这里引用的是源码表达的独立性意图，不是运行结果。

<a id="vc-order"></a>

## 2. 流水线次序是融合的必要条件

`lib/Dialect/ZeusHigh/Transforms/VPChaining/ModuleOrder.cpp:39–64` 给出普通模块合并的物理序模型：

```text
PreCal → Msk → Cmt → Dip → Sum0 → Prg → Mul → Flr → Sum1 → Shf
       → Smt → DipSc → PrgSc → MulSc → Sum1Sc → ShfSc → Sqr → Rlu → PostCal
```

这是编译器对特定通路的顺序抽象，不是宣称所有硬件模块只能走这一条串行路线。该函数明确不覆盖 L0/L1 变体；Tree-C 进入 scalar region 后，只有已证明等价的模式可以重映射为 SC 模块（同文件 `122–160`）。

`Mul → Sum0` 不能简单把后一个加法器“挪到前面”。常量/标量模式可以按已证明规则映射到后置 Sum1；普通 external tensor-Y 路径不能只改模块名（同文件 `246–261`）。当前实现另有封闭 AXPY 配方，见 `ModuleMerge.cpp:241–261`，必须分别证明完整 C 行、数据角色、alias 与数值顺序；它不是泛化的 Sum0→Sum1 权限。

<a id="vc-chaining"></a>

## 3. 模块顺序合法，仍可能因资源或数据流被拒绝

`lib/Dialect/ZeusHigh/Transforms/VPChaining/VPChainingLegality.cpp:636–675`：

- 合并后的普通 VP 最多两个 memref tensor operand。
- external tensor-Y 的消费关系必须可唯一绑定，不能让多个 module 自由读取不同的 Y。
- external Y、PRG.b、FLR.s、DIP.s 共享 CAL FIFO 输入资源；当前资源模型最多允许其中一类 source。

面试反例：`x + y` 后接依赖 PRG.b 的拟合链，算式没有环，模块顺序也可能单调，仍可能争用同一个 FIFO 写入口。仅数算术指令数量会漏掉这类约束。

`include/triton-shared/Dialect/ZeusHigh/Transforms/VPChaining/VPChainingLegality.h:60–130` 进一步要求：移动读写不能跨未知 effect；producer/intermediate/consumer 的所有权、执行顺序与 alias 要成立；广播不能悄悄改变中间值迭代域；两个不同 exact `vp_policy` 不能合并。`VPChainingLegality.cpp:680–690` 沿 memref view 回到根来证明输入输出不相交，不能只比较 SSA value 名字。

## 4. 精度、PRG 状态与 PostCal

### 4.1 中间 dtype 是语义

`lib/Dialect/ZeusHigh/Transforms/VPChaining/ModuleMerge.cpp:747–757`：默认拒绝删除非 FP32 的中间 buffer。低精度 materialization 包含真实 PostCal 量化/舍入，消除它会改变数值。`vp-aggressive-module-merge` 是显式放宽该数值边界的开关，不能写成总是安全的普通优化。

<a id="vc-postcal"></a>

### 4.2 双标量乘法保留两次舍入

`lib/Dialect/ZeusHigh/Transforms/VPChaining/PostCalScalarChaining.cpp:12–41,47–99` 对已证明的闭合配方执行：

```text
round_f32(round_f32(X × a) × b)
    → 一条 VP 中的 MUL + PostCal，a / b 依次由 MG0V / QK 消费
```

不得预先合并为 `X × (a × b)`。固定版本要求 FP32 输入、中间值和两个 f32 scalar；仅 consumer 可保留已证明的最终 BF16 narrowing。中间结果有其他读者、移动区间含源写、输入输出 alias、policy 不兼容时保留原操作。

这里不能引用后续分支中的 BF16 输入融合能力作为该 commit 的事实。闭合配方在通用 greedy fusion 后单独运行：`lib/Dialect/ZeusHigh/Transforms/VPChaining/VPChainingPass.cpp:42–71`。

回归意图可检查 `test/ZeusV3Midend/Unit/Transforms/vp_chaining_postcal_scalar.mlir:1–66`：允许两个 runtime scalar；`escaping_intermediate`、`output_alias`、`intervening_write` 保留两条 VP。本次未运行该 fixture。

<a id="vc-prg"></a>

### 4.3 PRG 不是无状态数学函数

`lib/Conversion/ZeusHighToZeusLow/ZeusHighToZeusLow.cpp:5731–5755`：PRG 参数表属于各 CSS，参数 load 与普通按 tensor 维度切分不同；后端要向实际 consumer 使用的 CSS 编程。`AUTO/CSS=0` 不能当作参数表广播。

`VPChainingLegality.cpp:234–251,315–319` 也将 PRG state 纳入 motion 检查：把 producer 的拟合计算移动到 consumer 位置时，中途另一条 table load 会改变所见函数，必须拒绝不安全融合。

教学提问：“输入输出 buffer 不相交，为何仍不能并行？”答题应包含 PRG table、反馈寄存器、配置状态等非普通 SRAM 资源，并区分 lane-local state 与共享依赖。

## 5. ResolveVPDeps：rsqrt 可能带来 DT

`lib/Dialect/ZeusHigh/Transforms/ResolveVPDeps.cpp:29–38` 记录 Sqr 位于 scalar 区，入口必须经过 Smt tree。当前适配规则：C=1 可补 Tree-C；C 不为 1 但存在可利用的单例维时可能前后加 DT transpose；没有受支持几何则拒绝。

同文件 `125–132,161–172` 特别处理 tensor-binary prefix：转置后 X 的 C=1 不意味着任意 Y broadcast 都合法。若 Y 不是 scalar-like，会先把不合法前缀拆到独立 VP；当前 suffix 还要求只有 Sqr，不能丢弃额外 operands 来凑通路。

适合面试的判断：`tl.rsqrt` 的代价不是只数一条数学操作，应检查 reduction 输出布局、是否进入 scalar 通路、额外 transpose、临时 SRAM 与同步。该判断是由源码形成的优化方法，不是本次实测性能结论。

<a id="vc-sync"></a>

## 6. 编译 pipeline 与同步边界

`lib/Dialect/ZeusHigh/Transforms/ZeusHighPipeline.cpp:214–245` 的顺序为：

```text
AssignExecuteUnit → ResolveVPHints → scalar folding / tensor div lowering
→ AddModuleListForVP → VPChaining → ResolveVPDeps
```

上述融合在 descriptor 建立前基于 memref 数据流进行。Parallel-Executor 则在 descriptor/boundary guard 后、Multi-Executor split 与地址分配前规划（`docs/architecture/parallel_executor.md:40–45`）。因此数据流融合、执行器放置、物理地址复用和最终同步是不同层面的证明。

编译器的 RTL 契约文档 `docs/vcs_debug/rtl-instruction-dependency-model.md:950–996` 区分：

- issue/accept/config-ready 与写回完成不同；VP write completion 等 L2 write response drain。
- 同 lane FIFO 顺序不能自动解除重叠 L2 RAW/WAR。
- normal VP command 按顺序进入 outbox，完成时还要满足对应 lane done；group head acquire、tail release 是有前提的 group completion 契约。
- 不同 lane 的 issue 顺序不能替代数据范围不相交证明；普通 SSA `dealloc` 也不表示硬件已完成。

这里引用的是固定 compiler 文档维护的契约，未重跑 RTL。不要把“少一条 mailbox”本身写成优化成功；应先证明数据、配置/PRG 状态和 storage reuse 的生命周期，再验证最终调度。

## 7. 与真实源码连起来的三类题

| 源码案例 | 可核验源码范围 | 可讲的映射问题 | 本次证据不支持的说法 |
| --- | --- | --- | --- |
| RMSNorm | `python/zeus_examples/VP/test_rmsnorm_kernel_v1.py:76–95` | FP32 square/reduce、rsqrt、row broadcast、最终 BF16；检查 SMT/SC 入口与数据搬运 | 不保证这段源码最终成为一条 VP，不给加速倍数 |
| MoE sum-reduce | `python/zeus_business_kernels/moe/test_sgl_moe_sum_reduce_kernel_bf16.py:25–30,73–105` | BF16 转 FP32，沿 top-k 累加，scale 仅作用 routed 项，之后才加 shared；算法顺序约束融合 | 不是整 MoE 推理吞吐证据，也不能任意重排 shared/scale |
| MHC Sinkhorn | `python/zeus_business_kernels/mhc/test_mhc_sinkhorn_tree_square_t4_kernel.py:21,47–78` | 显式 parallel hint；max/exp/sum/rsqrt 与 transpose/broadcast 交替；迭代之间有真依赖 | hint 不是每层 iteration 可并行的证明，未验证当前性能 |

可以把这些题统一成追问：“先画值依赖和硬件状态依赖，再说哪些阶段能 chaining，哪些 logical tile 能放多个 VP，最后说明布局、SRAM 和 mailbox 为什么限制收益。”

<a id="vc-silu"></a>

## 8. SiLU / SwiGLU 的源码逻辑与 fast sigmoid 路径

BF16 wrapper `python/zeus_business_kernels/moe/test_silu_and_mul_bf16_kernel.py:5–18` 复用 `_silu_and_mul_common.py`。后者 `99–118` 明确：

```text
gate_bf16 → gate_fp32
up_bf16   → up_fp32
sigmoid_value = tl.zeus.sigmoid(gate_fp32, approx="fast")
silu_value = gate_fp32 × sigmoid_value
result_fp32 = silu_value × up_fp32
result_bf16 = result_fp32.to(tl.bfloat16)
```

这是 SiLU-and-Mul（SwiGLU 的激活乘法部分）的数学/类型数据流，不包括前面的 gate/up GEMM；原代码给两次乘法分别命名，中间为 FP32，最后才显式 narrowing。它不证明整段被融合成一条 VP。

`lib/Conversion/ZeusLinalgToZeusHigh/ZeusLinalgToZeusHigh.cpp:909–920` 明确分段线性拟合公式 `k[seg(x)] * x + b[seg(x)]`；`1308–1309` 编码 64 段为 `segn=1`。在当前 fast sigmoid 分支（同文件 `1955–2056`），具体步骤是：

1. CMT lower clamp：`pwlInput = max(x, -104)`。
2. PRG table load：将两组参数表写入对应 PRG 状态。
3. compute VP 的模块串为 `CMT min(x,10) → PRG(prg_x, segn=1, cgfs=0) → MUL(mul_x_k) → SUM1(sum_1_x_add_y_or_b)`。

PRG 只负责依据分段查出参数，后续 MUL / SUM1 才计算仿射值；不能把 PRG 画成无条件精确的 sigmoid 单元。64 段是当前 fast sigmoid 的配方参数，不是宣称所有 activation 必须 64 段。

特殊值边界来自相同源码：负向饱和段斜率为零，lower clamp 防止 `0 * (-Inf)`；upper clamp 将 `+Inf` 映到输出为 1 的末段。它们是此编译配方显式建立的保护，不应省略成“直接查 LUT 自然处理所有输入”。NaN payload、±0、subnormal 的位级行为需结合 CMT、MUL、SUM、输出转换的 RTL primitive 及具体 golden 验证；本次未据此宣称完整 IEEE 一致性或全特殊值逐位通过。

回归 fixture `test/ZeusV3Midend/Unit/Transforms/sigmoid_fast_special_values.mlir:47–60` 检查上述 clamp、PRG load 与模块顺序，覆盖 `1×1×1×72` 和 `1×1×65×1` 两种形状；本次只读未运行。`approx="accurate"` 走另一路 exp、倒数初值与修正流程，不可把其精度或特殊值保证贴到 fast 路径。

## 9. 源文件摘要

SHA256 对应上述固定 commit 的完整文件内容，用于重核来源，未附带业务原始数据。

| 相对路径 | SHA256 | 工作区与固定版本 |
| --- | --- | --- |
| `include/triton-shared/Target/ZeusV3/TargetInfo.h` | `c987d2ed6357164768faf250994db99847be49d326250974f427eed5718b79bc` | HEAD 一致 |
| `backend/language.py` | `fda75925a0f10afb878e496f8140c117fa61d60be1d75f80d07cb06ffec0b2bd` | HEAD 一致 |
| `lib/Dialect/ZeusHigh/Transforms/VPChaining/ModuleOrder.cpp` | `650bdd497ad7880a8a5fe99245bd30081ed5285bd286527470c4e65024f2eb01` | HEAD 一致 |
| `lib/Dialect/ZeusHigh/Transforms/VPChaining/ModuleMerge.cpp` | `391ce4d68797253da43214d611214c445670ffa77babac3a3c608953a67302b7` | HEAD 一致 |
| `lib/Dialect/ZeusHigh/Transforms/VPChaining/VPChainingPass.cpp` | `c6ee9404e8afb3912bee1a091fba24621362baba5a751d5b572a79032c435695` | HEAD 一致 |
| `lib/Dialect/ZeusHigh/Transforms/VPChaining/VPChainingLegality.cpp` | `00ab0e6d58e4400178a50781b0302afef4c4f5550982c3d77896093a4a8158df` | HEAD 一致 |
| `include/triton-shared/Dialect/ZeusHigh/Transforms/VPChaining/VPChainingLegality.h` | `5a12518b1306c5e11c3024bf77cc10a5eca2ac0fef8b2cb1ab341b929b24a91e` | HEAD 一致 |
| `lib/Dialect/ZeusHigh/Transforms/VPChaining/PostCalScalarChaining.cpp` | `538722bcc8d64b5dfc49a0c3a68d811d75c5c86e6ac7c8947e2fc7e087f1633a` | HEAD 一致 |
| `lib/Dialect/ZeusHigh/Transforms/ResolveVPDeps.cpp` | `a5a49f9f6ea1ce6571cc1762a495f721308ca57f3243cf77f85987fb1c184286` | HEAD 一致 |
| `lib/Dialect/ZeusHigh/Transforms/ZeusHighPipeline.cpp` | `118d7b62b796f52cefaac8e022ea7ea785ad5b0ee96ee0ab2a8f7e50f4736de1` | HEAD 一致 |
| `lib/Conversion/ZeusHighToZeusLow/ZeusHighToZeusLow.cpp` | `00d23c78e9434c76f55fc140e63d9043362f550a8bd1608367d2af287ef4d91f` | HEAD 一致 |
| `docs/architecture/parallel_executor.md` | `b3541e2c900fddda87cf41fa086121caf8dba27cf8855942b0fedd7a322bac34` | HEAD 一致 |
| `docs/vcs_debug/rtl-instruction-dependency-model.md` | `1658b2cc611ec12fc93131ce0cc269fb7312e404bed48855a046189a3e2e7517` | HEAD 一致 |
| `python/zeus_examples/VP/parallel/test_add_bf16_parallel_4vp_hint_kernel.py` | `0662f02bdc5c3773db9545bb3519f0f3971c39c3744c2c37b2043ef6420975a8` | HEAD 一致 |
| `python/zeus_examples/VP/test_rmsnorm_kernel_v1.py` | `cb6e06d13f24200014548dba99e1f07acf4489ff07a313f3be68a7af22cd3a47` | HEAD 一致 |
| `python/zeus_business_kernels/moe/test_sgl_moe_sum_reduce_kernel_bf16.py` | `822dd37d957656b685d2dc9e94fd330c82593caef93f742a75e3ee8b8eb49c51` | HEAD 一致 |
| `python/zeus_business_kernels/mhc/test_mhc_sinkhorn_tree_square_t4_kernel.py` | `676e5fda20d3b292252c9da4e10379cc71308c1333005a9fdcc3518489c820f6` | HEAD 一致 |
| `test/ZeusV3Midend/Unit/Transforms/vp_chaining_postcal_scalar.mlir` | `ddd87ff825a575873ecc8fc3b387430e65eb195af7d9aa8b697c01ded9cc0f36` | HEAD 一致 |
| `lib/Conversion/ZeusLinalgToZeusHigh/ZeusLinalgToZeusHigh.cpp` | `d8fe5282ee294b3d160bb5fb42212c833793973c9e2caa1bf4f63708c9a85fd8` | HEAD 一致 |
| `python/zeus_business_kernels/moe/_silu_and_mul_common.py` | `1014fc519642eb4990af9b668b2d076b385354fb186216403551e2f99e535180` | HEAD 一致 |
| `python/zeus_business_kernels/moe/test_silu_and_mul_bf16_kernel.py` | `3f9aa9537b48a19fd7c9780f615fd100ef41d54b513589674b1f9e0168a8a9c6` | HEAD 一致 |
| `test/ZeusV3Midend/Unit/Transforms/sigmoid_fast_special_values.mlir` | `fddc57f7d68497b7be9bb8de2dd443c84206957561c9b4a55fa03e159828b21e` | HEAD 一致 |
| `lib/Dialect/ZeusHigh/Transforms/AnalyzeVPSplit.cpp` | `9b5c4ff80155bc2114d56fdccd63106f2567b5de873484416ce94859c544d5f3` | HEAD 一致 |
