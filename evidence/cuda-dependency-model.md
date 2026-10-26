# CUDA 依赖职责扩展：官方资料核对记录

采集日期：2026-10-26。对应 `sync.html` / chapter `compiler-sync` 的独立扩展阶段 `cuda-dependency-extension`。

## 范围与版本

- 本轮只读核对 NVIDIA 官方在线资料，并复用已经核验的 518 源码证据；没有运行 CUDA 编译、GPU kernel、Nsight Compute、Compute Sanitizer、CycleSim 或 RTL/VCS，也没有 CUDA 与 518 的性能 A/B 结果。
- 指南基线为 `interview@1cb583097c76ad983a5885ce796b6f5aacbf0f26`。开始读取时工作区干净；并行集成期间存在 `docs/authoring.md` 修改和新的审稿记录，后续正文集成属于本次任务。该 SHA 是内容基线，不冒充集成后的提交。
- PTX 页面明确标注 **PTX ISA 9.4**。Turing Tuning Guide、CUDA Binary Utilities 和 Runtime API 页面标注 **13.4**。CUDA 分章 Programming Guide 页面显示更新于 2026-09-10；没有把所有在线页面统称为同一发布版本。
- CUTLASS 链接使用官方 `latest` 文档，未绑定 CUTLASS 源码 commit。Nsight Compute / Compute Sanitizer 使用当日官方在线文档；不声称本机安装或运行了相同版本。
- 518 部分复用 `triton_shared@82613bc2eb30feb9ef7f57aef20584df0ef9e28a` 的已有源码审查。原源码仓库整体有不相关 dirty 文件；原审查引用文件的逐文件状态与 SHA256 已记录在下列证据中。本扩展没有重跑编译器或重新审计所有 RTL。

## 518 证据继承

| 本仓库相对文件 | 本轮读取 SHA256 | 使用范围 |
| --- | --- | --- |
| `evidence/hardware-sync-sources.md` | `90d9462137165ad45dc51cf5627a589bc25301d56c642dcf9d82fbbc352d524b` | 第 5–13 行版本与只读边界；第 33–37 行 snapshot、同单元保证与证明限制；第 143 行起的时序与资源依据 |
| `evidence/sync-chain-model-audit.md` | `666f545c6e697be5b02d5a29d56808cfc39a5c41d535cddcad820eb2c7596f8f` | 第 3–9 行日期、版本与范围；单调链、循环身份和容量证据，不将其推广为 CUDA 实现 |
| `evidence/sync-pass-engineering-audit.md` | `22179ee2d1dda796796aeebf65899d9d92580d2f8bba3c64719bf24e3ba97297` | 第 25–31 行 descriptor/data read 区分；第 35–37 行事件合同；第 84 行起验证边界 |

章节使用 `resource-model`、`events`、`snapshot`、`chain-closure-proof`、`epochs`、`seed-drain`、`nested-credit`、`verification` 等稳定 ID 关联原文。CUDA 与 518 的职责对照属于基于双方合同的架构推导，不代表两种硬件同构，也不作为 NVIDIA 或 518 性能结论。

## 官方资料与直接支持的结论

以下链接全部实际通过 web 工具打开核对；正文的外链使用已核对专页，不猜测旧版锚点。页面会更新，标题与下面的小节名比本次抽取行号更适合后续检索。只保留简短原创归纳，例子和图是教学创作，不转载官方整段代码或图。

| 来源 | 本次核对位置 | 直接使用的事实 |
| --- | --- | --- |
| [NVCC](https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/nvcc.html) | PTX / Cubin 编译链，抽取第 82 行起 | PTX 经目标编译形成 Cubin；虚拟寄存器不能直接等同最终物理寄存器 |
| [Binary Utilities](https://docs.nvidia.com/cuda/cuda-binary-utilities/index.html) | Introduction，抽取第 13–19 行 | cuobjdump / nvdisasm 的反汇编用途 |
| [Nsight Compute](https://docs.nvidia.com/nsight-compute/NsightCompute/index.html) | Instructions & Dependencies Table，抽取第 1353–1381 行 | scoreboard RAW/WAR、consumer / producer 关联；没有将其描述为全局地址冲突检测器 |
| [Turing Tuning](https://docs.nvidia.com/cuda/turing-tuning-guide/index.html) | Instruction Scheduling / Independent Thread Scheduling，抽取第 37–48 行 | Turing core FMA 四周期依赖延迟例子；warp 同步的参与条件 |
| [Writing SIMT Kernels](https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/writing-cuda-kernels.html) | Shared Memory，抽取第 132–155 行 | 跨线程 shared 数据交接中的 block 同步 |
| [CUDA C++ Memory Model](https://docs.nvidia.com/cuda/cuda-programming-guide/05-appendices/cuda-cpp-memory-model.html) | Scope Relationships、Data Races、Message Passing，抽取第 79–89、120–145、145–183 行 | scope 覆盖通信双方，release/acquire 与 data race 条件 |
| [C/C++ Language Extensions](https://docs.nvidia.com/cuda/cuda-programming-guide/05-appendices/cpp-language-extensions.html) | Memory Fence Functions，抽取第 810–930 行 | fence 约束顺序，不能直接替代线程会合和数据发布 |
| [Advanced Kernel Programming](https://docs.nvidia.com/cuda/cuda-programming-guide/03-advanced/advanced-kernel-programming.html) | Async Thread and Async Proxy；Scoped Atomics，抽取第 124–130、152–211 行 | generic/async proxy 与 scoped atomic 的分工 |
| [Async Barriers](https://docs.nvidia.com/cuda/cuda-programming-guide/04-special-topics/async-barriers.html) | Initialization、Phase、Transaction Count，抽取第 118–144、400–402 行 | arrival、phase/token、异步 transaction 的生命周期 |
| [Async Copies](https://docs.nvidia.com/cuda/cuda-programming-guide/04-special-topics/async-copies.html) | LDGSTS 与 TMA；方向表及 bulk 示例，抽取第 64–68、520–639 行 | 发起线程完成与跨线程交接；搬运方向影响完成机制；wait.read 保护源复用 |
| [PTX ISA 9.4](https://docs.nvidia.com/cuda/parallel-thread-execution/index.html) | cp.async 9.7.10.28.3；bulk copy 9.7.10.28.4；wgmma family | 基础 cp.async 为 PTX 7.0/sm_80；bulk 为 PTX 8.0/sm_90；Hopper dense wgmma 为 PTX 8.0/sm_90a；wgmma.fence 与完成等待不同 |
| [CUDA Pipelines](https://docs.nvidia.com/cuda/cuda-programming-guide/04-special-topics/pipelines.html) | Initialization、Submitting / Consuming Work、Warp Entanglement，抽取第 61–140 行 | stage 的有限资源、参与者与 acquire/wait/release 生命周期 |
| [CUTLASS Synchronization](https://docs.nvidia.com/cutlass/latest/media/docs/cpp/pipeline.html) | Pipeline methods，抽取第 178–197 行 | empty/full 双方向；TMA producer commit 可能为空操作 |
| [CUTLASS WGMMA](https://docs.nvidia.com/cutlass/latest/media/docs/pythonDSL/guides/mma/wgmma_programming.html) | 架构特点及 mainloop，抽取第 144–157、753–842 行 | 128 线程 warpgroup、shared 操作数与寄存器 accumulator；相关 MMA 等待后再释放 stage |
| [CUTLASS Efficient GEMM](https://docs.nvidia.com/cutlass/latest/media/docs/cpp/efficient_gemm.html) | Pipelining / Hopper Warp Specialization，抽取第 216–252 行 | 双 buffer 和 producer/consumer 的 filled/empty 协作 |
| [CUDA Asynchronous Execution](https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/asynchronous-execution.html) | Streams / Explicit Synchronization，抽取第 420–467 行 | 普通命令的 stream 顺序、默认流模式与同步范围 |
| [Runtime Event Management](https://docs.nvidia.com/cuda/cuda-runtime-api/cuda_runtime_api/group__CUDART__EVENT.html) | cudaEventRecord，抽取第 231–236 行 | event 捕获记录时的工作，后续 stream 工作不加入该捕获 |
| [Runtime Stream Management](https://docs.nvidia.com/cuda/cuda-runtime-api/cuda_runtime_api/group__CUDART__STREAM.html) | cudaStreamWaitEvent，抽取第 945–949 行 | 在设备上给后续提交工作建立等待边 |
| [Nsight Profiling Guide](https://docs.nvidia.com/nsight-compute/ProfilingGuide/index.html) | Warp Stall Reasons，抽取第 1038、1049、1072–1074 行 | long/short scoreboard 的管线路径及解释边界 |
| [Nsight Compute Triage](https://docs.nvidia.com/nsight-compute/ComputeTriage/index.html) | Stall 原因分析，抽取第 1027–1045 行 | 原始采样落在 consumer，fixed-latency wait 与 barrier 到达不齐等原因分开 |
| [Compute Sanitizer](https://docs.nvidia.com/compute-sanitizer/ComputeSanitizer/index.html) | 工具种类、Asynchronous Copy，抽取第 55–56、532–535 行 | memcheck/racecheck/synccheck 的职责；受支持 async-copy 检查不等于所有通信正确性证明 |

## 本轮强调的技术边界

1. 普通线程内寄存器依赖不要求用户为每个 use-def 插 CTA barrier；这不推导出跨线程或异步引擎会自动同步。
2. RAW/WAR 是访问关系；scoreboard 的存在不能推导出任意线程、任意指针 alias 都被动态发现。
3. 固定延迟的四周期例子只限定 Turing core FMA；没有虚构所有架构统一的 stall 编码、scoreboard 槽数或编译策略。
4. barrier 会合、memory fence 排序、atomic 发布、proxy 交接、异步完成各有对象。`wgmma.fence`、commit 和 wait 不互相替代。
5. basic instruction family 的引入版本不覆盖全部后加 qualifier；没有把 `sm_90a` 写成全部 `sm_90+`。
6. ready 证明本轮输入可读；free 证明同槽位旧读者不再访问。异步 compute 发起不是 free 事件。
7. 双缓冲伪码令 s=k%2、g=floor(k/2)，初始两个槽位各有 free(s,0)。producer(k) 等 free(s,g) 后写入，consumer(k) 等 ready(s,g) 并在读完后发 free(s,g+1)，供 tile k+2 复用；图中的 ready/free 数字按 tile 编号表示。实际 API 的 phase 初值与计数需按具体库实现。
8. `wait_group.read` 证明相应源读取完成，不等于目标 global 数据已对任意观察者可见。
9. 普通 stream/event 的命令级边不能替代 kernel 内协议；示例明确排除另有合同的 programmatic dependent launch。
10. 性能采样、动态错误检查与静态协议证明分层报告，未以 stall 数或同步指令数声称性能改进。

## 检查与剩余工作

子任务已完成 JSON 解析、7 个稳定 section ID 唯一性、21 个来源 ID 唯一性、内部 section 引用存在性、SVG XML 解析，以及正文私人路径/IP 模式扫描。图为原创双槽位生命周期示意，包含输入输出、行含义、箭头语义及非按周期比例声明。

技术审稿已核对 ready/free 的槽位和世代配对、初始空槽权限，以及异步计算完成后才能 release 的条件。教学层面逐节保留具体例子与 518 内部链接。最终构建、公开产物检查、桌面/移动、放大、打印与离线浏览器验收见 [集成审查](review-sync-qa-cuda.md)；SVG XML 合法性不单独作为视觉验收结论。
