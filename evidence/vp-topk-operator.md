# 518 VP 实际算子：Router TopK 的源码证据

<a id="topk-scope"></a>
## 版本和验证边界

采集日期：2026-10-25（Asia/Shanghai）。本文只读核对生产 Router、编译器和已有 RTL 证据，不修改业务库，不运行新的编译、CycleSim、VCS 或硅上实验。

- 生产算子：`torch_zeus`，固定提交 `3656952bfee88b1d5f7b68d0e724e54a7a5353d7`，文件 `sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_router_linear_biased_topk.py`，下称 **Router**。通过 `git show` 读取该版本，指纹与站内既有部署证据一致。[固定源码](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_router_linear_biased_topk.py)
- 编译器：`triton_shared`，固定提交 `82613bc2eb30feb9ef7f57aef20584df0ef9e28a`；本文引用文件的工作区字节均与该提交一致。该提交与 Router 来源分开固定，不能仅据两份源码宣称已经做过这一组合的编译或性能测试。
- RTL：复用 [VP 硬件证据](vp-hardware-rtl.md#vp-reduction) 所固定的只读副本及逐文件指纹。本文没有重新穷举比较树的 NaN、signed zero、tie 等输入组合。

下文编译器路径相对 `triton_shared/`，Router 行号相对上述固定文件。不发布原始模型数据、内部地址或个人目录。

<a id="router-math"></a>
## 生产 Router 到底计算什么

这个实例的逻辑形状是 H4096、E288、Top8；它是内部业务配置实例，不等同于公开 GLM-5 配置。Router 的 quad 入口为 `:252`；profile 选择见 `:58–73,1247–1286`，G=1、topk_group=1 等 wrapper 条件见 `:1170–1187`。

对每个 token，计算可按以下语义理解：

```text
logits = round_bf16(matmul_fp32_accum(hidden_bf16, weight_bf16))
scores = sigmoid_accurate(widen_fp32(logits))
selection = scores + bias
ids = largest_k_indices(selection)
raw = gather(scores, ids)
sum_raw = reduce_sum_fp32(raw)
reciprocal = rsqrt(sum_raw) * rsqrt(sum_raw)
weights = raw * reciprocal
if apply_scale: weights = weights * routed_scaling_factor
output_weights = round_bf16(weights)
```

证据：Router `:430–471`；`router_reciprocal` 在 `:225–230`，具体代码先计算一次 `inverse_root`，再自乘，以上数学写法不代表调用两次 rsqrt。

有三处不能简化掉：

1. **logits 有 BF16 舍入点**。这里不是一路 FP32 的数学参考；靠近 TopK 截断边界时，舍入可能改变选择结果。
2. **bias 只用于选择，权重从无 bias 的 `scores` 重新 Gather**，见 `:454–466`。硬件输出的 TopK values 是 `selection` 中的值，不能直接拿来归一化。若配置了 expert ID remap，Gather 仍用 logical IDs，映射仅用于对外输出，见 `:245–248,585–588`。
3. **当前固定版本调用 `approx="accurate"`**，见 `:451–453,572–574,581–583,606–608`。旧版本文档里的 fast/64 段描述不能直接套到本版本。函数近似误差必须再绑定对应编译器配方和参数表。

分母为零时，源码刻意保留 `0 * inf -> NaN` 的语义意图，而不是将零倒数改为零（`:225–230`）。本文未复测该特殊值路径。

<a id="router-padding"></a>
## E288、计算宽度 320、weight pack 384 是三个不同数字

| 范围 | 本例宽度 | 固定源码依据 |
| --- | ---: | --- |
| 有效专家数 | 288 | profile `:69–71` |
| PE/TopK 计算前缀，按 64 向上对齐 | 320 | `COMPUTE_BLOCK_E=64` 在 `:22`；wrapper `:1213–1222` |
| LocalMem weight pack，按 128 向上对齐 | 384 | `BLOCK_E=128` 在 `:21`；pack `:1090–1104` |

wrapper 内局部变量和 kernel 参数虽然叫 `physical_e` / `PHYSICAL_E`，传入的实际含义是 **320 的计算宽度**（`:1272`），不能据变量名把 packed weight 的物理 ABI 也写成 320。

pack 为 weight 的额外行填零；计算前缀里 288–319 的 bias 使用 `PADDING_SENTINEL=-1.0e30`（`:24,122–133,1117–1126`）。这样在通常的有限 Router 分数范围内，填充专家不会进入 Top8；它不是对任意 NaN 或极端 bias 输入的形式证明。这里的**业务 padding bias**也不同于编译器每轮对已选位置使用的 **MSKV=-inf**。

<a id="topk-lowering"></a>
## 原生 Top8 不是一条完成八个结果的排序指令

`lib/Dialect/ZeusHigh/Transforms/ExpandTopK.cpp:107–164` 明确限制单个 primitive 的 `K` 为 1–16，并在编译期展开 **K 条 `topk_step`**。每条 step 重新引用同一个完整输入 memref，采用 CWH 读取模式；模块参数见同文件 `:39–83`。

对 Top8，可理解为：

1. 第 0 轮，扫描 `selection`，比较树找最大值和 index，将赢家保存到 Mask 的第 0 槽。
2. 第 1–7 轮继续扫描同一行；已选 index 被 Mask 替成 `-inf`，每轮得到下一个赢家。
3. 普通展开中，第 7 轮同时设置 `TKVO=1` 发布 packet、`MSKRC=1` 清除状态，为下一行准备；前 7 轮不把最终 packet 输出到 L2。

Mask、比较树、最大值模式和 `MSKV=-inf` 的配置见 `lib/Conversion/ZeusHighToZeusLow/VPModuleToConfigMapping.cpp:530–578`；硬件保存 value/index 和按 index 屏蔽的机制见 [RTL Mask 证据](vp-hardware-rtl.md#vp-reduction)。这是一种逐轮 max 选择，不是把输入完整排序。

**教学访存模型**：假设 FP32 输入宽度 N=320、K=8，各轮都扫描完整输入，则输入载荷为 `N × K × 4 = 10240 B`。在每 VP 128 B 读端口的理想条件下，相当于 80 个满载数据拍。这只是 payload 计数；不含指令配置、地址与握手、比较树跨块状态、输出、Gather 和同步，既不是 80-cycle 实测，也不能把它换成 518 对 CUDA 的速度倍数。GPU 若能把行保存在寄存器/shared memory，就可能减少这种跨执行阶段的重复读取，但选择算法本身仍有比较和通信成本。

这里的 16 是 **primitive 容量**，不是所有逻辑 TopK API 的总上限。`include/triton-shared/Dialect/ZeusLinalg/ZeusLinalgOps.td:27–43` 说明逻辑 K 可以再分 primitive chunk；本生产 Router wrapper 则另行限制 `K <= min(E,8)`（Router `:1182–1187`）。不能混淆三层限制。

<a id="topk-packet"></a>
## packet、values 和 Gather 的真实数据路径

`lib/Dialect/ZeusHigh/Transforms/TopKContract.h:22–29` 固定一个原生 packet 为 32 个 4-byte word：前 16 槽是 FP32 values，后 16 槽是 i32 indices，indices 从 byte offset 64 开始，总窗口为 128 B。Top8 只有 `[0,8)` 和 `[16,24)` 两段具有逻辑有效值；其余槽不能当成有效或已初始化的结果读取。对应的 raw i32 packet 运输约束见 `ExpandTopK.cpp:127–138`。

生产三批路径调用的 Python API 名称是 **`tl.zeus.topk_packet`**，不是 `native_topk`。后者是 native packet 机制的泛称；源码里的编译器属性是 `zeus.topk_native_packet`。

Router `:525–566` 从 `topk_packet_layout()` 获取槽数和 index offset，分配每组四行的 packet SRAM；`:575–577,590,604,615,628` 产生并写入 packet 行；`:644–664` 只取有效 indices 切片，合并相邻行后输出。编译器 `BindTopKPacketDestinations.cpp:35–78,152` 起证明完整静态窗口和观察者后，才允许绑定 packet 目的地，避免多余 copy；不满足条件保留 copy。不能把存在这个 Pass 写成所有场景都必然消除了搬运。

**Gather 不是 VP 算术链里的任意地址读**。在本文固定编译器中，`ZeusHighToZeusLow.cpp:9464–9647` 的 `expandSingleGather` 生成 CT 路径：

- 条件满足时，用 128 B `LoadVRegOp` 读 indices 快照，再逐 lane 提取 ID（`:9472–9482,9525–9535,9558–9577`）。
- 用 `source_base + id × element_bytes` 计算地址，逐个 `LoadRegOp` 取原始 score（`:9583–9608`）。
- FP32/i32 按原始 32-bit word 搬运；可将输出组到 VReg 后一次写回，私有完整输出允许免去旧内容回读；不符合窗口/所有权条件时回退（`:9537–9555,9600–9647`）。

所以即使 indices 的读取和结果写回已向量化，**源 score 仍是逐个 indexed load**。不能将“vector Gather 优化”写成 VP 一次完成任意 32 路 gather。该文件旧注释中的历史延迟不是本文重新测得的数据，本文不引用它做速度表。

<a id="topk-parallel"></a>
## 多 VP 加速的是独立行，不能拆散同一行的 Mask 状态

`ZeusHighToZeusLow.cpp:399–420,5783–5805` 将 Mask 识别为 physical-VP-local 状态；同一结果窗口的 step 若落在不同 executor lane 会报错。未指定合法精确 placement 的 TopK 默认落在 UNIT0，见 `:7850–7863`。

生产 Router 四行组的每次 row iteration 是完整的 `sigmoid → TopK → Gather → normalize` 流水，独立行可以由 Parallel-Executor 放到四个 VP；源码意图见 Router `:435–448,692–701`。这是 **四行各算自己的 Top8**，不是把一个 Top8 的八轮均匀分配给四 VP。实际是否并行以及重叠多少，仍须查看编译产物和时间线。

三批路径先准备 a/b/c 三组 PE 输出，再在独立行流水中交错下一组分数准备和本组 Gather，见 Router `:535–635`。该结构为隐藏 CT indexed load 等待提供机会，同时延长 scores/packet 的存活期，增加 SRAM 和调度成本。

固定编译器还有 **有条件的前缀发布**：`StreamTopKGather.cpp:318–395` 在第 `K/2` 轮将当前赢家写到独立 packet，设置 `TKVO=1`，保持 `MSKRC=false`，让前半 Gather 提前开始；最后一轮仍清状态，后半 Gather 用最终 packet。Top8 因此可成为第 4 轮先发布 4 个赢家、第 8 轮最终发布，而不是所有编译结果一律只在最后输出。这个优化需满足原生 step、独立行、精确 placement、完整对象生命周期等证明（`:139–207`），并在 allocator 试运行通过后才真正改写（`:461–489`）。

这能改变等待和重叠，**不会把八轮扫描变成一轮**，也不能据 Pass 名称承诺四 VP 线性加速。

<a id="topk-contracts"></a>
## tie、NaN 和跨平台比较的合同

- `sim_check/sim_framework/golden/topk.py:13–35` 对 FP32 输入保留完整精度，并用 stable descending argsort，使相等值选择较低 index。这是当前 golden 的显式验收约定；不能仅凭注释声称已穷举真实 RTL 的全部 tie 位置和特殊值。
- 本次未对 NaN、Inf、`+0/-0` 的完整比较与屏蔽行为重新验证。CUDA 对照也必须明确 comparator 和 NaN 规则，不能只比较正常随机输入的数值误差就声称语义一致。
- 对 Router，更直接的业务验收包括：K 边界附近的 selected IDs、无 bias score 的 Gather、权重 FP32 归约顺序、BF16 舍入点、零分母、填充专家排除、ID remap、batch tail。
- 解释差距时，应同时核对算法、寄存器/本地存储复用、indexed load 与跨单元等待、batch 并行度；本文不提供未经同形状、同 dtype、同语义、同计时边界测量的 CUDA/518 倍数。

## 文件指纹

| 仓库与相对路径 | SHA256 |
| --- | --- |
| `torch_zeus/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_router_linear_biased_topk.py` | `5c8a1db2845b1be63222f0fe9523abefebaa233b5347f44e744c8774a0464f8f` |
| `triton_shared/lib/Dialect/ZeusHigh/Transforms/ExpandTopK.cpp` | `238b7f90b2d6ca85d8621c7e696d379e0ede9ec092e6b33c5ee3dcc701177605` |
| `triton_shared/lib/Dialect/ZeusHigh/Transforms/TopKContract.h` | `ab45e3e6e3cb6eccbf035dc19b71ad8b8cdd82fb75330bdc10b1af231c7a2f48` |
| `triton_shared/lib/Dialect/ZeusHigh/Transforms/BindTopKPacketDestinations.cpp` | `d61f5c3359a8ce41b82f29a7d1700c733dae7de9be732b9ffa7c8cc593087c39` |
| `triton_shared/lib/Dialect/ZeusHigh/Transforms/StreamTopKGather.cpp` | `856851581f8b6b7904cf1041a121ade02f19aaf6b4f1930981d335939fd03fce` |
| `triton_shared/lib/Conversion/ZeusHighToZeusLow/ZeusHighToZeusLow.cpp` | `00d23c78e9434c76f55fc140e63d9043362f550a8bd1608367d2af287ef4d91f` |
| `triton_shared/lib/Conversion/ZeusHighToZeusLow/VPModuleToConfigMapping.cpp` | `1a763fc4bb3aeac1a4b173716ada506dc3e8eb57e522801b51963cef587947d5` |
| `triton_shared/include/triton-shared/Dialect/ZeusLinalg/ZeusLinalgOps.td` | `dd224fdb5ee1ad8b74fe1b4951cde49ed1f9099e30f57d8b316b2ca680c9e2f4` |
| `triton_shared/sim_check/sim_framework/golden/topk.py` | `87807c397942efa6664f0b3e1651b347f47c77d53cf9639adcd66a8e30bfe295` |
