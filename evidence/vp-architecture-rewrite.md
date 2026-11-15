# VP 七部分重写：来源与模型

采集日期：2026-11-14。本文对应 `content/39-vp-walkthrough.json` 的七部分版本。范围为只读源码核对、教学模型和网页验证；未新增编译产物、CycleSim、VCS、综合或设备测量。

<a id="sources"></a>
## 来源身份与版本边界

| 来源 | 固定身份 | 本轮使用范围 |
| --- | --- | --- |
| `design` | 非 Git 参考副本，revision unknown | VP 外壳、PreCal、CAL、PostCal、控制与写回 |
| `triton_shared` | `a6161ef94b1941f786ce05d4e31104ec91ea22d4` | 模块顺序、融合合法性、PostCal 配方、sigmoid lowering、TopK 展开 |
| `torch_zeus` | `6ae99c68bc08476766b1d00e07b97b8df6a1ceeb` | 公共 RMSNorm、tile helper、GLM53 SwiGLU 与 Router 的调用选择 |

[逐文件 SHA256 与工作区状态](vp-architecture-source-hashes-20261114.json)绑定本轮实际读取的内容。两个 Git 来源的被引用文件均与对应 HEAD 字节一致，采集时无 tracked 修改；有无关 untracked 文件，不把整个工作区称为干净快照。业务库没有被修改。

将 2026-10-30 的 57 个 `design` 来源逐文件重算：56 个一致，变化项为 `README.md`，无缺失。由此可以复用未变化的 RTL 解释；它不能证明该参考副本对应当前生产硬件。原证据的版本和验证范围仍保留。

原文的 CUDA 比较、数值示例、descriptor 与 RTL 连线归入相应章节的展开补充。补充里的 `[4,128]` 是局部算例；本轮贯穿的完整输入为 `[4,4096]`。旧的编译器与业务案例继续绑定原证据，不将它们统称为本轮最新运行结果。

<a id="hardware"></a>
## 硬件依据

下列路径相对 `design`，身份由摘要文件固定。

| 路径 / 定位 | 支持的解释 |
| --- | --- |
| `rtl/zeus518/vp_v3/top_wrapper/vp_518_zeus_top_wrapper.v` | 四 VP 外壳，各自的 1024-bit 数据接口；不能由数量推导线性加速 |
| `rtl/zeus518/vp_v3/top_wrapper/vp_518_top.v` | Command / RD / PreCal / CAL / PostCal / WR 的连接关系 |
| `rtl/zeus518/vp_v3/sub_module/pre_cal/vp_518_pre_cal_fi2fp_group.v`，有效输出逻辑 | BF16 展宽、FP32 或 pipe 条件下仅低 32 路有效 |
| `rtl/zeus518/vp_v3/sub_module/pre_cal/vp_518_pre_cal_split_send.v` | 主流、辅助流、参数载荷的分流 |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_cal_group_top.v`，Mask、Compare、A/B、SMT、scalar 实例与 mux | 比较与向量链、wide / pipe、tree 结果选择、输出选择 |
| `rtl/zeus518/vp_v3/sub_module/cal/vp_518_cal_group_para_engine.v` | DIP → SUM0 → PRG → MUL → FLR → SUM1 → SHF 固定连接 |
| `rtl/zeus518/vp_v3/sub_module/cal/prl/vp_518_cal_fifo.v` | Y / PRG.b / FLR.s / DIP.s 的单写入口选择、16×1028 FIFO、目的标签 |
| 摘要中 `post_cal/` 与 `control/` 对应文件 | PostCal 算术、格式转换与 P2S；写请求、响应排空及完成条件 |

新总图是功能结构示意，省略了各模式 mux、延迟寄存器与部分握手线。比较与求和结果经选择进入 scalar，不能解释成同时驱动同一入口。专用反馈和 S2P 是不同机制。详细图与原 RTL 说明放在对应展开栏中。

外部字节、内部 lane、有效范围和物理周期分开：128 B 满载荷容纳 64 个 BF16 或 32 个 FP32；BF16 展宽不增加读取字节。普通输入定位交互不模拟 BF16 pipe 的包拆分，不据此推断每个周期的接收量。

<a id="compiler"></a>
## 编译器依据与本轮更新

以下相对 `triton_shared`：

- `lib/Dialect/ZeusHigh/Transforms/VPChaining/ModuleOrder.cpp`：模块物理顺序与通用 chaining 的位置关系。
- `lib/Dialect/ZeusHigh/Transforms/VPChaining/VPChainingLegality.cpp`，`checkMergedVPResources`：最多两个 tensor operand；外部 tensor Y 的单消费者绑定；共享 FIFO 来源类别检查。硬件优先级 mux 本身不能证明任意并发组合合法。
- `lib/Dialect/ZeusHigh/Transforms/VPChaining/PostCalScalarChaining.cpp`，`isOperandScalarMul`、`isTensorMul`、`PostCalScalarMulRecipe`：当前特定配方允许 BF16 源输入或满足合同的 tensor-Y producer，中间结果仍 FP32；保留两段有序舍入，不预乘系数。**旧版本“仅 FP32 输入”的描述不再代表当前配方的全部能力。**
- `lib/Conversion/ZeusLinalgToZeusHigh/ZeusLinalgToZeusHigh.cpp`，sigmoid 的 `accurate`、`balanced`、`fast` 分支：accurate 的指数分解、修正与尾部；fast 的参数装载、钳位、PRG / MUL / SUM1。存在实现分支或历史注释，不单独证明精度与性能。
- `lib/Dialect/ZeusHigh/Transforms/ExpandTopK.cpp`，TopK primitive 展开：K∈[1,16] 的检查、带步号的 `topk_step`、native packet 合同。这个 K 范围不扩展为所有逻辑 TopK API 的上限。

这些是实现与合法性证据。本轮未编译主文的算例，不声称有新 kernel 的 VP 指令条数、布局或融合成功记录。多 VP 接口细节继续使用原固定版本证据，主文仅据此区分独立任务放置与 tile 拆分。

<a id="kernels"></a>
## 算子依据

以下相对 `torch_zeus`：

- `sgl-kernel-zeus-triton/python/common/rmsnorm.py`：先统计、再重新读取并输出；`sum_sq` 为 `[BLOCK_T,1]`，`tl.sum(..., keep_dims=True)` 保留行结构。入口调用 `reduction_row_tile`。正文的基本公式取 `WEIGHT_OFFSET=0`，未包含 fused residual 等其他入口的额外语义。
- `sgl-kernel-zeus-triton/python/common/_tile_selection.py`：纯 host 函数 `reduction_row_tile(4,4096,core_num=2)` 返回 `(2,1024)`。本轮读取并执行这一纯 Python helper，未导入或运行设备 kernel。每行分成四个实际 feature tile，和动画的 32 个教学窗口区分。
- `sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_silu_and_mul.py`：输入最后一维的两半为 gate / up；FP32 中计算 `x * tl.zeus.sigmoid(x, approx="fast", seg_num=64) * y`，最终 BF16。
- `sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_router_linear_biased_topk.py`：默认 sigmoid 路径与可选 calibrated 路径并存；后者受参数和 shape 限制，不能把一个默认路径推广为全部调用。

<a id="models"></a>
## 教学模型的定义与反例

所有新交互均为逻辑位置或因果示意，不是 RTL 时钟回放。

1. **输入位置**：连续 `[4,4096]`，行号、列号从零开始。BF16 的 `offset=(r×4096+c)×2`；FP32 改为乘 4。满组 128 B。BF16 普通 wide 的前 32 元素属于 A，后 32 属于 B；普通 FP32 每组只有 32 个有效元素。`X[1,37]` 的偏移分别是 8266 B、16532 B。
2. **跨窗口归约**：为了可手算，每行元素取 `r+1`，γ=1、ε=10⁻⁶。128 元素仅作为观察窗口；整行含 32 窗口。第 1 行首窗口贡献 512，整行平方和 16384。最终系数只在整行统计结束后形成。部分和的显示不指定其物理寄存器或设备指令。
3. **输入配对与写回**：放大二元乘法最后一组 64 个 BF16；前 255 组及其响应已结束。单元素取 X=1.5、Y=−2，结果−3。第二输入晚到时保留主值；写口阻塞时保留结果；最后请求接受后 pending=1，响应排空后才满足普通完成条件。等待步骤数量没有时间含义。
4. **字节账**：X/Y 各 32768 B，读共 65536 B，BF16 输出32768 B。按满载荷折算读512份、写256份。仅在明确假设每拍成功接收128 B且相关资源可重叠时，512个接口周期才构成读侧下界。没有把它报告为设备操作耗时。

`node scripts/check_vp_model.js` 用元素遍历验证位置映射的覆盖和唯一性，用直接求和验证归约范围及尾窗口，并检查输入配对、等待保持和完成前的未排空响应。覆盖 BF16 / FP32、31/32/63/64 边界、非整窗口长度131、四行隔离和非法输入。

图源为 `scripts/vp_architecture_figures.py`；三组交互与纯模型为 `web/vp-architecture.js`。所有图与交互资源内嵌到独立 `vp.html`。
