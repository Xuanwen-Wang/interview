# CUDA 软硬件映射扩展：来源与验收

采集与整理日期：2026-10-30。正文：`content/24-cuda-hopper.json`，稳定章节 `cuda-hopper-guide`，连续入口 `cuda.html`。本次是在原有 H200、GEMM launch 与 FA3 叙事上扩展，并保留全部原小节 ID。

## 证据层级

- 产品参数来自 NVIDIA H200 产品页与 NVIDIA GTC 2024 课件；全部是标称规格。稠密峰值、单向链路近似由公开口径换算，不能充当实测。
- CUDA / PTX 描述的是软件可见合同和公开机制。Tensor Core 内部图、FMA 数据处理阶段、scoreboard 与 barrier 状态图均为原创教学图，不是电路逆向、RTL 或设备逐拍 trace。
- Triton 部分是固定公开上游源码阅读，不代表定制后端的编译输出。未执行新的 CUDA/Triton kernel 编译、H200/B200 实验、SASS 核验或 Nsight 采样。
- bank、scale、矩阵与 Roofline 的数字是可复算模型；课件的 H100 SXM 实验没有改称 H200 复现结果。

## 产品与执行机制来源

| 来源 | 本次使用范围与边界 |
| --- | --- |
| [NVIDIA H200 产品规格](https://www.nvidia.com/en-us/data-center/h200/) | SXM / NVL、141 GB、4.8 TB/s、PCIe Gen5、NVLink 4、精度峰值及 with-sparsity 脚注。采集日页面保留 preliminary specifications 脚注；取公开舍入值，不推测实际持续频率。 |
| [NVIDIA Hopper 架构说明](https://developer.nvidia.com/blog/nvidia-hopper-architecture-in-depth/) | 完整 GH100 的 8 GPC × 9 TPC × 2 SM 设计；不能据此写成 H200 启用 144 SM。 |
| [Hopper Tuning Guide，CUDA 12.8](https://docs.nvidia.com/cuda/archive/12.8.0/hopper-tuning-guide/index.html) | 寄存器、Shared、warp/CTA 驻留约束；cluster 与异步矩阵/搬运。 |
| [CUDA Programming Guide，12.8](https://docs.nvidia.com/cuda/archive/12.8.0/cuda-c-programming-guide/index.html) | grid/block/warp、独立线程调度、参与掩码、同步与内存语义。 |
| [PTX ISA 8.7，CUDA 12.8](https://docs.nvidia.com/cuda/archive/12.8.0/parallel-thread-execution/index.html) | `mma.sync.m16n8k16` 片段、WGMMA、mbarrier phase / tx-count、acquire/release、proxy。 |
| [Floating Point，CUDA 12.8](https://docs.nvidia.com/cuda/archive/12.8.0/floating-point/index.html) | FMA 一次舍入语义；没有据此推测 H200 流水级数。 |
| [CUDA Best Practices，12.8](https://docs.nvidia.com/cuda/archive/12.8.0/cuda-c-best-practices-guide/index.html) | 有效带宽、合并访问、Shared bank 与优化取舍。 |
| [Nsight Compute Profiling Guide](https://docs.nvidia.com/nsight-compute/ProfilingGuide/index.html#hardware-model) / [Compute Triage](https://docs.nvidia.com/nsight-compute/ComputeTriage/) | scheduler 与 stall 的公开分类；高 scoreboard stall 不等同带宽饱和或唯一根因。 |
| [NVIDIA floorsweeping 专利公开文本 US20230288471A1](https://patents.google.com/patent/US20230288471A1/en) | 缺陷屏蔽及为规格/功耗关闭正常单元的一般机制；没有公开某颗 H200 的测试结果，不能断言每卡损坏 12 SM。 |
| [PCI-SIG：PCIe 5.0 位率](https://pcisig.com/what-bit-rates-does-pcie-50-specification-support-and-how-does-it-compare-prior-pcie-generations) / [PCI-SIG 规范培训](https://pcisig.com/sites/default/files/files/PCIe_Specification_Webinar_Rev%206_FINAL_0.pdf) | 32 GT/s、128b/130b 编码；×16 单向原始口径 64 GB/s，编码后约 63.0 GB/s，尚未扣协议开销。 |
| [AMD HIP 性能说明](https://rocm.docs.amd.com/projects/HIP/en/latest/understand/performance_optimization.html) | 只作活跃线程 EXEC mask 的类比；不将 AMD 的 wavefront 宽度或 SIMD 参数移植为 Hopper 硬件事实。 |

## 用户提供的 NVIDIA GTC 2024 课件

[Introduction to CUDA Performance Optimization，完整 PDF](https://developer-blogs.nvidia.com/wp-content/uploads/2024/08/CUDA-Programming-and-Optimization.pdf)，89 页；本次核验文件 SHA256：

`9a105c88c185b9c31427e6ff948651fa41c6db82c3046b5b1837fa07cb40dc08`

| PDF 页码 | 对应正文 |
| --- | --- |
| 4–6 | H200 SXM 132 SM、50 MB L2、HBM、双向 PCIe/NVLink；单 SM 资源；SIMT 前端 / SIMD 后端。 |
| 7–18 | 分歧、独立线程调度、线程层级、cluster、barrier 与原子作用域。 |
| 20–36 | Little’s Law、ILP/TLP、就绪与发射。24–26 页的延迟/issue 参数是课件显式教学假设；不是 H200 指令延迟表。 |
| 37–42 | occupancy、寄存器分配粒度、Shared 预留、block 大小；41 页实验设备为 H100 SXM。 |
| 44–60 | cache/sector、warp 地址、AoS/SoA；60 页实验仍为 H100 SXM。 |
| 61–68 | 32 bank、4-byte word、向量分 phase、广播、列冲突、padding、XOR swizzle。正文标量公式不能直接套到向量、FP16、TMA 或 ldmatrix。 |
| 69–74 | 向量访存主要减少指令数，不自动减少最少数据字节；73 页性能数未迁移为 H200 结果。 |
| 75–85 | 原子竞争、warp/CTA 归约与内存瓶颈；80 页性能数未迁移为本次实测。 |
| 87–88 | 按瓶颈选择优化与进一步阅读。 |

正文提供各主题的直接页码链接；机制图均为原创重绘，没有整页复制课件。

## Blackwell 与量化

- [PTX ISA 9.0，CUDA 13.0.2 归档](https://docs.nvidia.com/cuda/archive/13.0.2/parallel-thread-execution/index.html)：`tcgen05.mma` 的单线程发起语义，A/B/D 与 scale 的存储、block-scale 合法组合、CTA group 与完成规则。不同 tcgen05 操作各自有参与要求，不能推广成全部单线程。
- [Blackwell Tuning Guide，CUDA 13.0.2](https://docs.nvidia.com/cuda/archive/13.0.2/blackwell-tuning-guide/index.html)：本篇新路径限定 B200/SM100；不把所有 Blackwell 产品视为同一 target。
- [Transformer Engine 2.14 FP8 Primer](https://docs.nvidia.com/deeplearning/transformer-engine-releases/release-2.14/user-guide/examples/fp8_primer.html) / [NVFP4 说明](https://docs.nvidia.com/deeplearning/transformer-engine-releases/release-2.14/user-guide/features/low_precision_training/nvfp4/nvfp4.html)：MXFP8 block32、E8M0 scale；NVFP4 常见 1D block16、E4M3 block scale 加 FP32 全局 scale；转置后分组方向的变化。训练配方的 2D weight scaling 不简化成同一个 1D 合同。

## 固定公开 Triton 源码

仓库 [triton-lang/triton](https://github.com/triton-lang/triton)，tag `v3.5.0` 解析到 commit `c3c476f357f1e9768ea4e45aa5c17528449ab9ef`。采集的是该 immutable commit 的原始文件，没有本地修改；不是从一个不明 dirty 工作区推导。文件散列见 [来源清单](cuda-hardware-depth-triton-files.json)。

| 路径 | 核验点 |
| --- | --- |
| `third_party/nvidia/backend/compiler.py` | coalesce、layout conversion、dot operands；Hopper latency/schedule/pipeline；Blackwell TMEM；后段 shared allocation / proxy fence。 |
| `lib/Dialect/TritonGPU/Transforms/Coalesce.cpp` | 访问连续性与 layout 选择。 |
| `lib/Dialect/TritonGPU/Transforms/RemoveLayoutConversions.cpp` | layout 传播和转换优化。 |
| `lib/Dialect/TritonGPU/Transforms/OptimizeDotOperands.cpp` | `SwizzleShmemConvert` 模式、`SwizzledSharedEncodingAttr`、`LocalAllocOp → MemDescTransOp → LocalLoadOp`。 |
| `lib/Analysis/Allocation.cpp` | Shared 缓冲分配与存活复用。 |
| `lib/Analysis/Membar.cpp` | 读写区间、控制流与 barrier 插入；不等同全部异步 fence 协议。 |
| `python/tutorials/10-block-scaled-matmul.py` | 5D packed scale 到二维 `tl.dot_scaled` 视图；B 的存储轴约定。 |

## 验证记录

技术正确性审查：按上述固定来源核对产品、执行与量化合同；检测了正文 28 个 CUDA 归档文档深链接，修正一个 SIMT 锚点。未公开的流水级数、Tensor Core 电路、H200 实际 warp 编号映射均未补造。

- `node scripts/check_cuda_model.js`：原有 220 组参数及 Ring/softmax/内存反例通过；新增全部 32 个步长、全部 32 列、广播、三种布局双射和错配反例通过。这里验证地址与数学，不验证 GPU 访存周期。
- 独立直接矩阵乘验证 2×4 乘 4×2 的输出 `[[11,23],[8,18]]`。
- 用有理数逐元素反量化再点积，得到 `9.5`；分组缩放求和一致，错误的统一后乘得到 `15`。
- 遍历全部 512 个 packed scale 坐标，从物理维度反解逻辑坐标，确认一一对应；图中四个 byte offset 分别为 `0,16,4,511`。
- 独立重算 BF16 4096³ GEMM：137.438953472 GFLOPs、最低逻辑 96 MiB、算术强度 1365.333 FLOP/B；标称算力对应约 138.897 μs，标称 HBM 对应约 20.972 μs；两者均非设备耗时。

初学者可理解性审查：沿已有 GEMM 的 `C[50,87]` 连接线程与 FMA，另用显式标注的微型矩阵解释 Tensor 数据复用。分清寄存器就绪与跨线程同步、full 与 empty、逻辑 scale 与物理打包；新术语在使用前定义。经典 SIMT 栈为折叠教学补充，独立线程调度的保证另行说明。

视觉与交互审查：Chromium 桌面 1440×1080 与 1280×1080；本次修改/新增的 13 张图逐张查看，检查所有 SVG 文本边界，无文字超出 viewBox 或整页横向溢出。修正一处 Tensor 输入连线穿过说明文字。验证 bank 的五种模式及 lane 地址、图示放大 150%/200%、全文搜索、旧 `warp-subpartition-mapping` 锚点、笔记和已读持久化、原 occupancy 交互。未发现页面 JavaScript 错误。

打印生成完整 68 页 A4 PDF，核对本次图的页码与代表页的图文完整性；bank 模型的条件、计数与 lane 地址保持在同一页。通过页面下载连续 HTML 后，断开浏览器网络，用 HTTP 路由提供该文件作为离线入口；bank、放大、TMEM 搜索可用，入口外无网络请求。下载文件与对应构建的 `cuda.html` SHA256 相同。按项目规则没有执行移动端检查。

构建、内容检查、公开产物检查与 `git diff --check` 在发布前执行；提交、Actions 部署和线上产物一致性另外核验。本记录不把设备外验收称为 H200/B200 数值或性能测试。
