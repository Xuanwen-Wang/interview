# FlashAttention-3 图文扩展：来源与审查

采集与审查日期：2026-10-28。正文位置：`content/13-attention-guide.json`，`attention-inference-guide / flash-attention-3`。

## 范围与来源

本轮解释 2024 年 FA3 原论文的 Hopper 前向主线，未声称当前主分支的每条 kernel 都采用同一调度，也没有执行 H100/H200 性能实验。教学块、容量数字、数据流图与时间线为原创整理；不复刻来源图片，不把结构图称为实测波形。

| 来源 | 固定范围 | 支持的结论 |
| --- | --- | --- |
| [FA3 原论文](https://arxiv.org/html/2407.08608v1) | arXiv 2407.08608 v1，2024-07-11，§3.1 / §3.2 / §3.3，Algorithms 1 / 2 | TMA producer/consumer、环形 shared 缓冲、ping-pong、组内异步流水、寄存器代价、FP8 量化与物理布局 |
| [作者说明](https://tridao.me/blog/2024/flash3/) | 2024 年 FA3 发布说明，采集于上述日期 | 区分硬件矩阵吞吐与指数吞吐；区分组间和组内重叠。未将其特定 H100 吞吐或加速比直接移植到教程 |
| [NVIDIA Hopper Tuning Guide](https://docs.nvidia.com/cuda/archive/12.4.1/hopper-tuning-guide/index.html#tensor-memory-accelerator) | CUDA 12.4.1 归档，§1.4.1.2 | TMA 异步搬运、global/shared 关系、减少寄存器中转与 warp specialization |
| [NVIDIA PTX](https://docs.nvidia.com/cuda/archive/12.4.1/parallel-thread-execution/index.html#asynchronous-warpgroup-level-matrix-instructions) | CUDA 12.4.1 归档，§9.7.14 | 四个连续且按组对齐 warp 构成 warpgroup；矩阵片段布局、WGMMA 指令及分组等待 |
| [WGMMA wait_group](https://docs.nvidia.com/cuda/archive/12.4.1/parallel-thread-execution/index.html#asynchronous-warpgroup-level-matrix-instructions-wgmma-wait-group) | 同一 PTX 归档，§9.7.14.7.3 | 累加寄存器和输入寄存器不能在相关异步组完成前随意访问；`N=0` 等待所有既有组完成 |

下载核对的 NVIDIA 归档 HTML SHA256：

- Hopper guide：`689e286b32ca3b4ea47c01563e265176f809bb67df7e1c2b58cca3ddae13e9fc`
- PTX：`f578ccda4171c1d870fdaf2e200fa85df40fb1184138ddce9148ba46d4d347a2`

这些 hash 标识采集页面，不是任何本地编译器二进制或运行结果的来源 pin。

## 技术核对

1. `Br=Bc=64,d=128` 是教学选择：Q/K/V tile 各 `64×128×2=16 KiB`；FP32 score tile `64×64×4=16 KiB`；FP32 output accumulator `64×128×4=32 KiB`。逻辑容量不等于真实分配量或 HBM 物理流量。
2. 两槽 K/V 逻辑量共 `2×(16+16)=64 KiB`，另存一个 Q tile 后合计 `80 KiB`，尚未计 padding、barrier 等开销。
3. 环形缓冲图先使用 K/V 整体释放的保守模型；正文与图注明确优化流水可分开释放 K 与 V。TMA full 和消费者 release/empty 分别对应“可以读”与“可以覆盖”，还需区分环形代次。
4. 组内时间线采用原论文 Algorithm 2 的主依赖：已有 P_j，提交 QK_(j+1) 与 PV_j，等前者后算 softmax_(j+1)，等后者后才能改写 u 的尺度。没有把同块 softmax 放在 QK 完成前，也没有让重缩放与 WGMMA 同时写 u。
5. 组间图显式改为 128 行 query 的 CTA，两个 consumer warpgroup 各拥有 64 行，m/l/u 互不归并；图没有暗示每个组独占一套 Tensor Cores。
6. FP16/BF16 主路径与可选 FP8 分开；FP32 P_j 转低精度矩阵输入的边界明确。FP8 P/V 的尺度及排列也需正确处理，不能只改变输入 dtype。
7. Q/K 同乘正交矩阵保持的是量化前的实数点积。归一化 Hadamard/随机符号不是 RoPE，也没有授权交换 RoPE 和量化处理顺序；FP8 仍有误差，V 还需适配第二次矩阵乘的布局。
8. FA3 不自动压缩长期 KVCache，不减少可见历史位置数。Nq=1 时的并行来源、split-KV 归并与潜在带宽限制仍需单独讨论。

## 读者与视觉审查

- 正文按“FA2 后还在等什么 → 每块数据归属 → copy/compute → 同组不同历史块 → 不同组的资源重叠 → FP8 → decode”展开。每个新名词在首次使用时定义，tile 与 FP32 临时量有明确轴和字节口径。
- 五张 SVG 分别显示数据路径、缓冲生命周期、组内依赖、组间工作所有权和 FP8 数学/数值边界；均有标题、图注、语义标签，不能仅凭颜色辨认。
- SVG 已逐张做 XML 解析，并用 Chromium 在 1100px 桌面视口实际截图观察。检查文字、线条、阅读顺序、数据依赖和对比条件；修正环形缓冲“就绪”措辞与 release 箭头指向。
- 集成后的手机布局、图示放大、搜索、打印、离线、旧链接，以及最终发布验证由整篇验收完成；本文件不把独立图预览等同于这些检查。
