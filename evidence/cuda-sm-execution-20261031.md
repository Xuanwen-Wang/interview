# SM 执行、Tensor Core 与 NVIDIA 依赖：2026-10-31

本次重写 CUDA Core 的前后端与流水、NVIDIA 的原生依赖管理、Tensor Core 的片段与执行路径。保留全部旧章节、小节和阅读阶段 ID；新增独立的依赖阅读阶段。正文是 `content/24-cuda-hopper.json`，共 51 小节、10 个阅读阶段。

## 证据层级

| 层级 | 本次用途 | 不据此声称 |
| --- | --- | --- |
| 官方编程与 ISA 合同 | warp 参与范围、MMA fragment、WGMMA / proxy fence / group 完成协议 | 未公开的实际门级拓扑或固定流水级数 |
| 官方历史架构材料 | Kepler 的编译器数学依赖调度、动态长延迟跟踪 | 将 Kepler 单元数或排程细节直接移植到 H200 |
| 公开课程、论文与第三方编译器 | 通用 operand collector；Volta 控制字段研究；NAK 依赖分配和字段编码 | 这些实现就是 NVIDIA 闭源 ptxas 或 Hopper RTL |
| 本次本机编译与反汇编 | `sm_90` FFMA 链、交错链、HMMA 及控制字段 | GPU 功能通过、硅上时延、H200 kernel 或端到端性能 |
| 教学模型与 CPU oracle | 明确假设的逐拍流水；矩阵坐标覆盖与整数 GEMM 重建 | CUDA 硬件模拟器或浮点 GPU 数值验收 |

## 主要来源与核对位置

1. [NVIDIA Kepler GTX 680 白皮书](https://www.nvidia.com/content/pdf/product-specifications/geforce_gtx_680_whitepaper_final.pdf#page=10)，PDF 第 10 页 “Next Generation SMX”：编译器为可预测数学延迟编码调度信息，动态长延迟操作仍需跟踪。官方历史说明。
2. [Wisconsin ECE/CS 757](https://ece757.ece.wisc.edu/lect13-gpgpu.pdf#page=17)，Spring 2015，第 17 页 “SM Operand Collector”。用于解释分 bank 寄存器和操作数收集；图中的容量/端口是旧课程例子，本文未当作 H200 规格。
3. [GPA，CGO 2021](https://mxz297.github.io/files/CGO21.pdf)，§2、Fig.2–3：固定/可变延迟、控制字段、等待位置。下载 PDF SHA256：`81526595034ee09c00bf29413d60c87482654c13798e761a8cdfcf91ff46ec49`。
4. [Dissecting Volta，1804.06826v1](https://arxiv.org/abs/1804.06826v1)：独立研究，控制位和寄存器行为的历史依据；不作为 H200 实测。
5. [NVIDIA software scoreboarding 专利 US9612836B2](https://patents.google.com/patent/US9612836B2/en)：计数增加/完成递减、DEPBAR 阈值、编译器确定依赖距离的设计实施例。专利是机制来源，不证明具体产品使用了全部实施例。关联申请 PDF `US20150220341A1` SHA256：`11aab30c68945f6a6c03ea01146f96b649fb56c08a91a6ee751ff687b4616577`。
6. [Mesa NAK 固定源码](https://chromium.googlesource.com/external/gitlab.freedesktop.org/mesa/mesa/+/61a2e907f1d6e4a8432d91d0fde5d439a875fbbe/src/nouveau/compiler/nak/)，commit `61a2e907f1d6e4a8432d91d0fde5d439a875fbbe`。只读远程固定 blob，无工作区改动。`calc_instr_deps.rs::assign_barriers`、`BlockDelayScheduler`、`reg_tracker.rs`、`sm70_encode.rs::set_instr_deps` 分别支撑依赖分析、动态槽分配、静态 delay 与编码。源码不代表 ptxas；没有引用其旧目标时延表作为 Hopper 参数。
7. [PTX ISA 8.7 / CUDA 12.8.1](https://docs.nvidia.com/cuda/archive/12.8.1/parallel-thread-execution/index.html)，§9.7.14.5.8 m16n8k16 floating point fragments，以及异步 warpgroup 矩阵指令、wgmma.fence / commit_group / wait_group、proxy fence。
8. [MIT 6.S894 Lab 6](https://accelerated-computing.academy/fall25/labs/lab6/)，2025，warp 矩阵参与合同与 fragment；课程设备为 Ada，未作为 H200 微架构依据。
9. [Tensor Core 微基准论文 2206.02874v3](https://arxiv.org/abs/2206.02874v3)：延迟、吞吐与数值口径；PDF SHA256 `77c798313c3c884111f0bd0661cafc084ae607c8f80b78b9806e320d7b294710`。
10. [Hopper 微基准 2501.12084v2](https://arxiv.org/html/2501.12084v2)，§6.2、Tables 7–9，作者 H800 的实验。PDF SHA256 `eb7d66d97d42f749f5a219b2a6fb652a17f000904802c1c01bb546b5796b67ea`。Table 7 的 dense FP16/FP32 m16n8k16 LAT 为 24.1 cycles；Table 9 的 m64n64k16 为 32.0 cycles；Table 8 的 m64n256k16 为 128.0 cycles。正文描述与表格对 N 有不一致，本站按表中完整 shape 引用，不总结成所有 WGMMA 固定 128 cycles。没有将本研究旧预印本当作另一个独立实验重复佐证。

NAK 下载文件的 SHA256：

| 文件 | SHA256 |
| --- | --- |
| `calc_instr_deps.rs` | `d4dbdbf8e4d6837559ff46454af3f7c2cc22461489c8d0270dad99b18fbc2e22` |
| `sm70_encode.rs` | `730600b4cc5a9792bc16e068f5700d25bbfe6c3e39315c063e09d8587aa0c9d8` |
| `reg_tracker.rs` | `1fbc8f5f3a7aa1472d3c723a447e93e30b262643ff6e50592d89cf8a3c629ee7` |

## 本次编译：三段原创 PTX

[输入与复现说明](../practice/cuda-sm90/README.md)、[原生指令](cuda-sm90-20261031/execution.sass)、[逐条解码](cuda-sm90-20261031/controls.json)、[源与产物 SHA256](cuda-sm90-20261031/provenance.json)。

- 编译器：ptxas 12.8.93；反汇编器：nvdisasm 12.8.90。
- 目标 `sm_90`，优化 `-O3`；文件保存全部反汇编文本，不只摘录有利片段。
- `fma_chain`：八条 FFMA，前七条 stall=4；首个消费者 wait 0x04 对应 LDG 的 write B2。
- `fma_ilp`：八条 FFMA，前七条 stall=1；四条独立链交错。最后 FFMA 到 store 的间隔不同，不能只用生产者类别推断所有依赖。
- `tensor_m16n8k16`：两条输入 LDG 都使用 B3，一条 HMMA 等待 0x08；其后 stall=15、NOP stall=8、再 store。没有据此推断实际逐拍内部过程。
- ptxas 资源输出分别为 12、18、16 registers，0 spill loads/stores；这是该编译的静态资源报告，不是 occupancy 或性能结果。
- 未在 H200 或其他 GPU 上执行，没有实际 kernel 时间、数值误差、Nsight 报告或硬件波形。

## 教学模型合同与自动检查

`web/cuda-execution.js`：单算术入口；round-robin 仅为教学选择策略；每 warp 16 条 FMA，按 1/2/4 个独立累加器交错；warp=32 lanes；宽度 8/32；每批固定执行深度。指令接纳前操作数已就绪，结果在 `issue + depth + batches - 1` 边界供后继使用。真实取指、寄存器端口、访存、分支、分区仲裁均不模拟。

`node scripts/check_cuda_execution.js` 检查 192 组参数：发射端口不重叠、同链消费不早于结果就绪、warp 顺序及指令数、有限进展、单链闭式时间、饱和配置。fragment 检查用按矩阵坐标构造的独立逆映射，验证 A/B/D 的 512 个坐标覆盖且无重复；128 个小整数 GEMM 输出与直接三重循环一致，并验证错误使用本 lane 的 B 列会得到反例。三个独立整数事件例子分别演示缺少 RAW、WAR、WAW 约束如何产生错误值；它们是机制反例，不执行或修改 GPU 指令。

`python3 scripts/check_sm90_evidence.py` 将 PTX、解码脚本、SASS、逐条记录绑定到 SHA256，检查 88 条原生指令（含填充/结尾序列）的解码与真实依赖关系，拒绝不完整的反汇编输入。CI 无需 CUDA 工具或 GPU 即可核验保存证据；本机实际编译另行记录。

## 审查与交付记录

本次新增 11 张原创 SVG，替换原执行/依赖/Tensor 示意；全部旧 section 和 stage ID 保留。新增依赖阶段把过去混在执行阶段的内容独立展开。全部旧 42 个小节和 9 个阶段 ID 均保留；本次新增 9 个小节和 1 个阅读阶段。自动测试不代替内容和逐张视觉审查。


### 三项审查结论

- 技术正确性：逐项对照官方接口、固定版本源码、实际编译产物；确认寄存器 RAW/WAR/WAW 与跨线程内存顺序的边界，检查 512 个 fragment 坐标与 128 个输出。编译产物不作为设备延迟观测。
- 初学者可理解性：从既有 GEMM 的 thread(7,2) / warp 1 lane 7 继续，先定义宽度、接纳间隔和延迟，再逐拍推导；Tensor 部分重新声明 FP16 输入合同，追到 D[1,6] 的来源 lane；依赖部分分别给出生产、等待、返回与复用事件。
- 视觉可用性：1440×1080 桌面逐张查看 11 张图，检查文字边界、连线和阅读顺序；修复 FMA 两条输入线共线、Tensor 归约线穿说明文字；矩阵图补全行列刻度。浏览器图示放大与 Escape 关闭通过。按用户要求未进行移动端验收。

### 实际检查范围

构建、内容/链接检查、原 CUDA 220 组模型与 Shared bank 检查、新流水 192 组与 fragment/GEMM oracle、sm_90 证据 SHA256/字段检查均通过。真实浏览器验证默认链、ILP、TLP、8-wide、前后步进、重置、最终全完成、键盘操作、旧/新锚点、全文搜索和笔记刷新持久化；无页面异常或横向溢出。

打印保留当前参数与末态说明；完整 A4 导出检查了新图和图注，短公式块避免跨页。实际点击独立 HTML 下载，并以保存的文件重新载入、阻断网络后验证章节和交互。截图/PDF/浏览器状态仅留在任务临时目录，不进入公开仓库。公开产物检查和该提交 CI / Pages 状态以发布记录为准，不把等待中的部署写成完成。

最终本地验收：公开产物检查通过（28 个允许文件）；7 个 CUDA 12.8.1 文档入口/深链接存在。A4 输出 85 页，11 张新图的标题、末行和完整图注均在各自同一页；fragment 三组坐标公式同页。浏览器实际下载的 HTML 与 `dist/cuda.html` 逐字节相同，SHA256 为 `590e389a498a958bb38b4132a894e287131537e2e0814430d8c0ce2faf8f5079`。
