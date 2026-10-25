# VP 实际算子证据：RMSNorm 与 sigmoid

<a id="os-scope"></a>

核验日期：2026-10-25。证据仓库：`triton_shared`，固定提交 `82613bc2eb30feb9ef7f57aef20584df0ef9e28a`。以下路径均相对于该仓库，除非显式注明 `interview`。本页是源码与数学推演证据，不是新的编译、功能仿真、VCS 或硅上性能结果。未修改业务源码。

## rmsnorm

<a id="os-rms"></a>

### 采用的实际 kernel

主例为生产 kernel 的仓内镜像 `python/zeus_business_kernels/lm_head/test_rmsnorm_kernel_v2.py`：

| 事实 | 源码位置 |
| --- | --- |
| 输入、输出 BF16 `[N,D]`，gamma BF16 `[D]`；`N,D,eps` 为 runtime 参数 | 1–3、127–135 |
| 核间按连续 row blocks 分配 | 50–57 |
| block pointer 为输入/输出 `[BLOCK_T,BLOCK_D]`，gamma `[1,BLOCK_D]` | 59–83 |
| 固定特化为 2 core、`BLOCK_T=4`、`BLOCK_D=128` | 137–142 |
| 第一遍按列块加载 x，转 FP32，累加每行 `sum(x*x)` | 85–100 |
| 完整行归约之后才执行 `rsqrt(row_sum_sq / D + eps)` | 102 |
| 第二遍重新加载 x 和 gamma，均转 FP32；计算并最终 cast 到 BF16 | 104–120 |

这段源码明确是两遍扫描，并未把整个 hidden row 保持在局部 tile 中。不能把“源码里第二次 `tl.load`”直接等同于最终 DDR/NoC 实测字节数；后者仍需核对最终 LD 指令、cache/memory mode 与 trace。也不能把测试的 `SIM_RANGE D=1:512` 当成真实模型 hidden size。

仓内另有整行策略 `python/zeus_examples/VP/test_rmsnorm_kernel_v1.py`：78–95 仅在源码中加载一次整行，83 行做 FP32 平方归约，91 行复用原 block，112–115 的示例常量为 2 core、`BLOCK_TOKENS=64`、`BLOCK_HIDDEN=8192`。它展示“留存 x 与重读 x”的策略选择，不能据此证明这个大 tile 在当前工具链的最终 SRAM 占用、调度与 VCS 性能。

### 数学步骤与模块含义

对每行 r：

```text
sum_sq[r] = Σ_j FP32(x[r,j]) * FP32(x[r,j])
mean_sq[r] = sum_sq[r] / D
rrms[r] = rsqrt(mean_sq[r] + eps)
y[r,j] = BF16((FP32(x[r,j]) * rrms[r]) * FP32(gamma[j]))
```

RMSNorm 不减均值、没有 LayerNorm 的均值计算和 bias 项。第二次乘 gamma 前后的实际 FP32 舍入次序是数值合同的一部分，不能随意把 `x*rrms*gamma` 改为另一乘法结合顺序。

| 数学动作 | 518 现有实现能力 | 不应过度推断 |
| --- | --- | --- |
| BF16→FP32 | kernel 显式 cast；可由编译器 CastFusion 放进合法 VP 前处理 | 不代表每个 cast 都必有独立 VP |
| `x*x` | `Mul` 的 `mul_x_x` 自乘通路，不额外消费 tensor Y FIFO | 不代表整个 norm 都能单条完成 |
| 沿 D 求和 | `Smt` Tree-C 归约；多列块还需跨块累加 | 不能把一个 tile 内归约当完整 D 行归约 |
| `/D + eps` | 标量缩放/加法；融合是否合法取决于真实 IR 与模块次序 | runtime D 的最终指令需看编译产物 |
| `rsqrt` | `Sqr`，位于 scalar 区域，由 `Smt` tree 接入 | 不是每个 vector lane 都有任意 `rsqrt` 指令 |
| 行因子 broadcast、乘 gamma | 后续 elementwise 消费；gamma 在列维共享，rrms 在行内共享 | broadcast 不自动等于零搬运，也不自动等于完整展开复制 |
| FP32→BF16 | kernel 最终可见 cast | 不能通过提前 BF16 降精度“减少 VP” |

源码锚点：

- `lib/Dialect/ZeusHigh/Transforms/AddModuleListForVP.cpp:518–535`：两个输入为同一 SSA 值时识别 self-square。
- `lib/Dialect/ZeusHigh/IR/VPModuleDefs.cpp:840–865`：`mul_x_x` 与 `mul_x_y` 的配置分支。
- `lib/Dialect/ZeusHigh/IR/VPModuleDefs.cpp:1047–1062`：`rsqrt` 配方落到 `Sqr`。
- `include/triton-shared/Dialect/ZeusHigh/IR/VPModuleDefs.h:100–101`：默认 SCSQ=1。
- `include/triton-shared/Dialect/ZeusHigh/Transforms/Passes.td:73–76`：编码 0/1/2/3 选择 1/2/4/16 次 Newton 迭代，默认编码 1 即两次。不能把 SCSQ 数字当迭代次数或 cycle 数。

<a id="os-layout"></a>

### Sqr 的布局适配：有条件地引入 DT

`lib/Dialect/ZeusHigh/Transforms/ResolveVPDeps.cpp:239–300` 的实际逻辑：只处理含 `Sqr`、尚不含 `Smt` 的 VP；若物理 C=1，则添加 `sum_mat_tree_c`。若 C 不为 1，但另一个维度为静态 1，可交换该维度与 C；无单位维度时拒绝该形态。这里 C 是硬件 descriptor 最内维，不直接等于数学 hidden D。

输入转置 DT 在 405–416；`Smt` 插入在 430–439。输出恢复 DT 是条件性的：373–388 证明原输出已是相同物理 carrier 时可直接写回，否则 443–456 才创建恢复 DT。因此不能写“所有 rsqrt 必须两次 DT”，也不能写“RMSNorm 已经证明没有 DT”。本页没有该 v2 kernel 的最终编译产物。

还有一个更窄的优化事实：`lib/Dialect/ZeusHigh/Transforms/VPFeedback.cpp:130–164` 识别精确四 VP、每 lane 一行标量的 producer 模式，模块为 `mul_x_x → sum_mat_tree_c → mul_sc → sum1_sc → sqr`；更大 T 保留 L2 数据流。它证明编译器具备受约束的标量反馈优化，不代表任意 RMSNorm、任意行数、任意 tile 都会命中。

独立 CT scalar `math.rsqrt` 也不是免费 CPU 式指令：`lib/Conversion/LinalgToZeusHigh/LinalgToZeusHigh.cpp:3333–3380` 用一个元素的 L2 scratch、VP `rsqrt` 和 scalar load 返回 FReg。该转换与 tensor RMSNorm 路径应分开讲。

### 可手算的教学输入

用 `x=[1,2,3,4]`、`gamma=[1,0.5,1,2]`、`eps=0` 说明非零行；eps=0 仅为简化手算，并非生产推荐值。

```text
x²      = [1,4,9,16]
sum_sq  = 30
mean_sq = 7.5
rrms    = 1/√7.5 ≈ 0.36514837
y_fp32  ≈ [0.36514837, 0.36514837, 1.09544512, 2.92118697]
y       = BF16(y_fp32)
```

这些是实数公式的四舍五入展示，不是当前 Sqr 近似或 BF16 输出的逐位仿真。最终输出既包含输入 BF16 表示，也包含归约次序、Sqr 迭代和各 cast 的影响。

### 与 CUDA 比较时应落在哪里

两遍扫描本身不构成 518 对 CUDA 的充分差距证据；CUDA 的实际实现也可能再次读 x。更有用的比较是：CUDA block/warp 如何保存 partial sum、如何归约和广播 rrms、如何把输出 elementwise 链保留在同一 kernel；518 怎样把这些依赖映射到 SRAM、固定模块顺序、scalar 区域、DT 和多 VP 调度。实际读流量、寄存器压力、SRAM 峰值与延迟都要分别核对，不能把教学数据流图变成带宽或速度倍数。

## sigmoid

### 外部 dtype 与调用

`python/zeus_examples/VP/test_sigmoid_bf16_kernel.py:81–90` 调用 `tl.zeus.sigmoid(x, approx=APPROX)`；107–112 的示例默认 `APPROX=fast`、2 core、64×128 tile。`include/triton-shared/Conversion/TritonArithToLinalg/ConversionPatterns.hpp:2401–2454` 明确先把非 FP32 输入提升到 FP32，在 FP32 域执行 PWL，最后按用户输出 dtype cast 回去。

不能将这一 BF16 例子的输出边界直接套在 Router 上：调用者也可以显式输入 FP32、保留 FP32 scores，再在后续权重输出处转 BF16。

<a id="os-fast"></a>

### fast64：直接拟合 sigmoid

`include/triton-shared/Conversion/TritonArithToLinalg/ConversionPatterns.hpp:1982–2018` 保存直接拟合 sigmoid 的 64 段 `bp/k/b`；2085–2095 选择 fast 表，2372–2391 将 64 段拆成两个 32 项 operand banks。

数学教学式：先找 x 所处区间 i，再算 `k_i*x+b_i`。不要说成查表直接返回一个 y；斜率乘法和截距加法仍会执行。

当前 Phase B 还有特殊值保护，位置为 `lib/Conversion/ZeusLinalgToZeusHigh/ZeusLinalgToZeusHigh.cpp:1959–2056`：

1. 先 `max(x,-104)`，保证负无穷不会在零斜率尾段中形成 `0*Inf`。
2. `prg_load` 编程 LUT。
3. compute 内先 `min(x,10)`，再 `prg_x → mul_x_k → sum_1_x_add_y_or_b`；表的有限负尾已饱和为 0、正尾为 1。

上述是转换源码配方，不是最终 kernel 的 VP 数量。PRG 表搬运、重编程、hoist/dedup、CastFusion 和后续调度都可能改变最终指令结构。

一个由真实表系数给出的教学点：`x=1` 位于 `(0.97582436,1.2474272)`，该段 `k=0.18615258`、`b=0.54522103`，实数计算为 `0.73137361`；解析 sigmoid(1)≈`0.73105858`。这说明 fast 是近似函数。这里未模拟 FP32 每步舍入、PRG 边界比较和 BF16 cast，因此不把 `0.73137361` 标成硬件逐位输出。选用非断点输入也避开了 tie 语义。

<a id="os-accurate"></a>

### accurate：exp2 分解、倒数种子与 Newton

以实际执行转换代码为准：`lib/Conversion/ZeusLinalgToZeusHigh/ZeusLinalgToZeusHigh.cpp:1407–1715`。

对于主路：

```text
z = clamp(x,-80,80)
u = -z * log2(e)
n = floor(u)
f = u - n
e ≈ PWL_exp2(f) * 2^n
d = 1 + e
d = m * 2^q
r0 ≈ PWL_reciprocal(m) * 2^(-q)
r1 = r0 * (2 - d*r0)
```

| 阶段 | 源码模块/锚点 |
| --- | --- |
| exponent 的整数与小数分解 | 1539–1558：`mul_l0`、`flr_l0`、`sum1_l0` |
| `2^f` 拟合、恢复 `2^n` | 1549–1558：`prg_l1`、`mul_l1`、`sum1_l1`、`shf_l1` |
| 形成 `d=1+exp(-z)` | 1561–1581：PreCal negate、CMT clamp、PostCal `qk=1,qb=1` |
| 编程 32 段 reciprocal seed 表 | 210–250、1621–1640 |
| 拆解 d 的 exponent/mantissa 并估计倒数 | 1643–1657：`dip_l0_e_m`、PRG、MUL、SUM、SHF |
| 一次 Newton 精化 | 1660–1683：先 `d*r0`，PostCal `−product+2`，再乘 r0 |

`1663–1665` 明确保留 FP32 `MUL → MUL(-1) → ADD(2)` 舍入点；PostCal 只是消除 private product 的一次中间写读，不意味着可改成任意 FMA 舍入语义。

`x=1` 的解析教学过程为 `u≈−1.44269504`，`n=−2`，`f≈0.55730496`，`2^f≈1.47151776`，恢复指数后≈`0.36787944`，`d≈1.36787944`，最终≈`0.73105858`。这些值帮助理解算法分解，当前 LUT 的实际结果应通过仿真确认。

若在实数域 `r0=(1/d)(1+δ)`，则 `r1=(1/d)(1−δ²)`；这只解释 Newton 如何压低种子误差，不是浮点 bit-exact 证明。

例如人为指定 `d=4,r0=0.24`，一步后 `r1=0.24*(2−4*0.24)=0.2496`，比种子更接近 `1/4=0.25`。此处 r0 是为便于手算选择的模型参数，不是当前 reciprocal LUT 在 d=4 的真实种子；也不是 RTL 输出。

### accurate 的负尾不是简单 clamp 到零

源码 1434–1449、1498–1526、1584–1619、1686–1709 另外实现：

- 对 `x<−80` 选择 `exp(clamp(x,−104,−80))` 尾部近似。
- 内部指数偏移 `+23`，即 exp 输入增加 `23/log2(e)`，随后乘精确 `2^-23`；用来保留可表示的 FP32 subnormal 负尾，避免内部 shift exponent 饱和。
- 用两路 mask 加总选择 tail 与主路；NaN/Inf 与普通有限值应单独验证。

当前 accurate 使用向量倒数 seed 加 Newton，明确避开旧 scalar Sqr 序列。Phase A 的 `ConversionPatterns.hpp:2065–2067`、2378–2379 仍有“rsqrt 后平方”的陈旧注释，不能据此描述当前执行路径；实际 Phase B 源码及 `test/ZeusV3Midend/Unit/Transforms/sigmoid_accurate_rsqrt.mlir:1` 的 `implicit-check-not sqr` 约束优先。

### 性能讨论边界

fast 的优势来自直接 PWL，accurate 为了更稳的数值合同付出额外 exp2、倒数、Newton、tail 和选择等数据流。它们不是“同样算 sigmoid 但名字不同”，也不能在 Router 和 SwiGLU 间随意替换。比较 CUDA 时应固定解析/近似目标、输入分布、dtype/cast、NaN/Inf/负尾策略，再讨论 CUDA intrinsic/编译选项与 518 PRG 配方；这里没有同 shape 同精度的速度倍数。

## existing-guide-check

已核对 `interview/content/25-moe-kernel-anatomy.json` 的 `accurate-sigmoid` 小节：exp2 分解、reciprocal seed、一次 Newton、`x<−80` 负尾、`+23`/`2^-23`/`−104` 与固定提交一致，无必须纠正的旧 Sqr 说法。该文件还正确区分 Router 权重归一化的 `rsqrt(sum)²` 与 accurate sigmoid 内部的向量 Newton 倒数。可补主路 `clamp[-80,80]` 和 fast64 特殊值 clamp 的细节。

## 本轮验证范围

- 已核对上述文件属于固定源码提交，并逐项阅读执行分支；业务仓现有未提交文件未修改。
- 用标准 Python 对真实 fast64 系数做实数算例核算，对 RMSNorm 手算和 exp2 分解做算术核对。
- 未运行 kernel JIT、MLIR tests、功能仿真、CycleSim、VCS 或 CUDA benchmark；本页不声称这些测试已通过。
