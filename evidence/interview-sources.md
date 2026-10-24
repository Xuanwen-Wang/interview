# 面经与 Coding 来源索引

整理日期：2026-10-24（Asia/Shanghai）。承接同名调研会话的27条记录，续查新增S22。问题按题意概括；本站解释、变体和参考实现为原创教学内容。

## 事实边界

- 原帖是候选人或招聘者自述，不是官方出题频率。招聘类型与经验未明确时不补猜。
- S13是同一作者的多公司实习记录；S04的问题没有逐一公司归属。
- G01/G02只保留任务概述和链接，不复制题库或提供正式提交答案。G02明确为历史作业。
- S05/S06/S07/S15/S16部分页面在网页抽取工具中仅显示壳。承接同日调研结果，本轮另外读回S05/S06/S15原始HTML，核对CPU分块转置、GPU均值滤波/TopK与图算法题意；S07/S16保留调研核验范围，不声称本轮重新完整解析。
- S05明确是C++ CPU tiled transpose以降低cache miss；本站CUDA转置为教学扩展，不是原帖题目。
- 参考Python实现有明确的简化合同；CUDA示例需目标GPU单独编译验证，未宣称硬件测试。

## 来源记录

<a id="S01"></a>
### S01 · 字节
- [机器学习编译优化工程师 - Seed Model](https://jobs.bytedance.com/experienced/position/7503827063050635538/detail)
- 时间：2025-05-13；身份：官方社招JD；经验：未规定年限。
- 题意范围：全系统图优化；XLA/MLIR/TVM 实际开发；CPU/GPU kernel；C/C++。
- 限制：2026-10-24 官方API channel_online_status=1；职位A122003。发布时间不是聚合站收录日期。

<a id="S02"></a>
### S02 · 字节
- [硬件加速模型编译优化工程师](https://jobs.bytedance.com/experienced/position/7404679843633334579/detail)
- 时间：2024-08-19；身份：官方历史JD；经验：未规定年限。
- 题意范围：模型解析、图融合、硬件适配、量化编译与模型部署。
- 限制：官方API channel_online_status=0，已下线；不能称当前在招。

<a id="S03"></a>
### S03 · 字节
- [字节大模型算法一面 难死了…](https://www.nowcoder.com/feed/main/detail/25ade7e61f7246438854a5f7ed5cc475)
- 时间：2026-03-23；身份：本人面经；编译/算子相邻岗位；经验：年限及招聘类型不明，正文追问实习。
- 题意范围：fusion反降；Hopper warp specialization；CuTe/CUDA；Agent生成kernel；MoE路由。
- 限制：原网页createdAt=1774278600000，对应北京时间2026-03-23 23:10；不能称3—5年社招。

<a id="S04"></a>
### S04 · 字节/阿里云
- [暑期实习编译相关总结+timeline](https://www.nowcoder.com/feed/main/detail/3ad1a6d1d4eb4ac7b609c8beb7f4dd96)
- 时间：2025-04-03；身份：本人实习面经；经验：实习。
- 题意范围：项目深挖；DCE/DSE、GVN、TBAA。
- 限制：作者同时面多家公司，问题未逐一归属公司；不能全算字节题。

<a id="S05"></a>
### S05 · 寒武纪
- [0920 寒武纪一面（高性能计算库开发）](https://www.nowcoder.com/feed/main/detail/14270e0a7d4e48f29af370ece4b97ef9?sourceSSR=dynamic)
- 时间：2026-09-20；身份：本人秋招面经；高性能计算库相邻岗位；经验：年限未披露；秋招标签。
- 题意范围：寄存器用量；DGEMM；HIP重构；CPU分块；OpenMP；含边界的tiling transpose。
- 限制：原网页createdAt=1789902117000，对应北京时间2026-09-20 19:01:57。

<a id="S06"></a>
### S06 · 摩尔线程
- [1015 摩尔线程一面（AI 算子库及高性能计算工程师）](https://www.nowcoder.com/feed/main/detail/8f03623a522e4c75a6391f9d3f721c7f?sourceSSR=dynamic)
- 时间：2026-10-15；身份：本人秋招面经；算子库相邻岗位；经验：年限未披露；秋招标签。
- 题意范围：dtype与分块；GEMM寄存器；CUTLASS；反汇编确认向量访存；ncu/occupancy；GPU均值滤波/TopK。
- 限制：原网页createdAt=1792059351000，对应北京时间2026-10-15 18:15:51。

<a id="S07"></a>
### S07 · 燧原
- [2年编译器社招经验—燧原一面](https://www.nowcoder.com/feed/main/detail/3adbddae78794a9b860f924a77b66b24?sourceSSR=dynamic)
- 时间：2023-06-26；身份：本人社招面经；历史；经验：明确2年。
- 题意范围：MLIR表示与优化；XLA动态性；TVM自动生成与NPU手写算子的取舍。
- 限制：2026题库收录版本与此旧帖题干高度一致；不能当2026面试。作者对技术现状的评论只代表当时个人叙述。

<a id="S08"></a>
### S08 · 沐曦
- [2年编译器社招面经—沐曦二面](https://www.nowcoder.com/feed/main/detail/c69c9d6a4ec54c2e997369b2de37e049)
- 时间：2023-06-29；身份：本人社招面经；历史；经验：明确2年。
- 题意范围：LLVM Pass；寄存器分配；jump越界；调试；K组反转链表。
- 限制：原帖候选人答案存在技术错误；只提取问题，不把回答当标准答案。

<a id="S09"></a>
### S09 · 寒武纪
- [寒武纪编译器研发工程师一面](https://www.nowcoder.com/discuss/353156672430481408?sourceSSR=dynamic)
- 时间：2020-07-31；身份：本人面经；社招标签；历史；经验：年限未披露。
- 题意范围：矩阵乘法实现与优化；内存和错误处理；源文件到可执行程序；编译流程。
- 限制：仅作历史社招基础，不能推断2026固定考法。

<a id="S10"></a>
### S10 · NVIDIA
- [Deep Learning Performance Software Engineer — JR2013068](https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Deep-Learning-Performance-Software-Engineer_JR2013068)
- 时间：2026-10-24核验；身份：官方JD；上海；经验：3+年相关经验。
- 题意范围：深度学习编译器和DSL；kernel优化；架构适配；AI workload分析；XLA/TVM/MLIR/LLVM。
- 限制：不是面经；未可靠取得首发日期。

<a id="S11"></a>
### S11 · NVIDIA
- [Deep Learning Compiler Engineer - CUDA — JR2010731](https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/China-Shanghai/Deep-Learning-Compiler-Engineer---CUDA_JR2010731)
- 时间：2026-10-24核验；身份：官方JD；上海；经验：2+年相关经验。
- 题意范围：tile-aware编程模型；DSL与核心编译器；下一代GPU适配；Triton/MLIR/LLVM。
- 限制：不是面经；GPU kernel、LLM、多GPU通信为加分方向。

<a id="S12"></a>
### S12 · NVIDIA
- [Senior AI Compiler Engineer, MLIR — JR2016844](https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Senior-AI-Compiler-Engineer--MLIR_JR2016844)
- 时间：2026官方招聘快照；身份：官方JD；美国；经验：3+年工作或研究经验。
- 题意范围：图表示；Dialect/API；代码生成；性能、编译时间和内存权衡；AOT/JIT；测试。
- 限制：页面曾注明至少接受申请至2026-04-26；不据此保证2026-10仍在招。不是中国面试题。

<a id="S13"></a>
### S13 · 阿里/百度/快手/美团等
- [2025春招实习面经汇总（已接阿里offer）](https://www.nowcoder.com/discuss/736868736837173248)
- 时间：2025春招；页面显示2025-04-17编辑；身份：本人实习面经；单作者多公司；经验：明确实习。
- 题意范围：SSA、WMMA/MMA、量化、CUDA稳定Softmax、访存、Attention、All-Reduce、算子收益验证。
- 限制：记录2025春招实习；各公司记录来自同一作者，不能视为相互独立的候选人样本。

<a id="S14"></a>
### S14 · 理想
- [2025年终总结：图编译器开发实习面经](https://www.rrricardo.top/blog/essays/2025-final)
- 时间：面试约2025-05；文章2026-05-08；身份：本人实习面经；经验：实习。
- 题意范围：SSA；MLIR Dialect；Op parser/printer；Pass分类与运行；CRTP；堆排序。
- 限制：文章发表日不等于面试日；明确是回忆约一年前经历。

<a id="S15"></a>
### S15 · 三星西安
- [8.29 西安三星 一面 AI编译器开发](https://www.nowcoder.com/feed/main/detail/f8b2f253307f4118b2a0be93bdcb0d91)
- 时间：2024-08-29；身份：本人面经；经验：招聘类型/年限不明。
- 题意范围：IR转换；算子融合；Attention、Softmax、卷积优化；BFS/DFS、拓扑排序。
- 限制：不能判定为社招。

<a id="S16"></a>
### S16 · 智源
- [智源 AI编译器一面面经](https://www.nowcoder.com/discuss/648859257261019136?sourceSSR=dynamic)
- 时间：2024-08-02；身份：本人面经；经验：招聘类型/年限不明。
- 题意范围：DFS；C++ Conv2D（stride、padding、K×K）。
- 限制：原文评论也在询问秋招或实习，没有明确答复。

<a id="S17"></a>
### S17 · 未具名芯片公司
- [招聘 llvm / mlir / ai 编译器相关岗位（不限年龄）](https://global.v2ex.co/t/1250894)
- 时间：2026-10-22；身份：招聘方自述面试任务；身份未独立核实；经验：不限年龄；无经验年限门槛。
- 题意范围：为自定义RISC-V扩展指令设计LLVM builtin，编译成功并交patch；自定义Pass/DSL/算子。
- 限制：可证明一类实际任务题形式；不能归属字节/寒武纪，也不是大厂统计。

<a id="S18"></a>
### S18 · 海外公司未具名
- [I can't pass an interview for a compilers role despite being a compiler engineer](https://www.reddit.com/r/Compilers/comments/1ichxvu/)
- 时间：2025-01-29；身份：候选人本人求职回顾；经验：明确3.5年编译器经验。
- 题意范围：优化；底层指令；并行性；设计ML编译器；代码生成和数据流等准备缺口。
- 限制：年限最贴近用户；公司及原题细节匿名，不代表中国公司流程。

<a id="S19"></a>
### S19 · 海外多家公司匿名
- [Compiler (related) interview questions and nowhere to find them in 2025](https://badumbatish.github.io/posts/compiler_questions_where_to_find_them)
- 时间：2025-05-07；涵盖2024—2025；身份：本人面经长文；经验：应届/初级。
- 题意范围：parser；表达式求值；编译器项目深挖；GCC/LLVM IR；JIT调试；图算法。
- 限制：公司使用菜名匿名；不能擅自对应公司。

<a id="S20"></a>
### S20 · 海外多家公司
- [becoming a compiler engineer — Rona Wang](https://rona.substack.com/p/becoming-a-compiler-engineer)
- 时间：2025-11-07；身份：本人面经回顾；经验：初级；2024有短期编译器工作经历。
- 题意范围：MLIR代数化简作业；常量传播、DCE；CFG、寄存器分配；C++算法；汇编。
- 限制：不是3—5年样本，适合检验编译器实际动手题。

<a id="S21"></a>
### S21 · 海外；最终入职Efficient
- [How I Got a Job in Compilers](https://abm-77.dev/how-i-got-a-job-in-compilers/)
- 时间：文章2026-06-15；面试2025-01至06；身份：本人转岗回顾；经验：此前约1年系统/HPC工作；初级编译器。
- 题意范围：Pass实现；插桩；C++内部机制；kernel优化；源码与测试追问。
- 限制：又一例文章更新与面试时间不同。

<a id="G01"></a>
### G01 · Luminal
- [luminal-ai/interview](https://github.com/luminal-ai/interview/blob/main/README.md)
- 时间：HEAD 2026-09-10；身份：公司官方编译器take-home；经验：未标年限。
- 题意范围：直线SSA→VLIW；调度；scratch分配；延迟、资源和内存顺序；正确性与性能。
- 限制：HEAD 573b8a85f4bdb8c3d8ba9f180d5f98dac875c902；时间为仓库提交时间，不是某人的面试日。

<a id="G02"></a>
### G02 · Anthropic
- [anthropics/original_performance_takehome](https://github.com/anthropics/original_performance_takehome/blob/main/Readme.md)
- 时间：HEAD 2026-01-22；身份：公司官方历史性能take-home；经验：未标年限。
- 题意范围：模拟机器kernel优化；SIMD/VLIW；调度；访存；性能trace；冻结测试。
- 限制：HEAD 5452f74bd977807ac2e74f3d29432b9df6f25197；README明确已更换限时测试基础，非现行流程承诺；cycle是模拟值。

<a id="G03"></a>
### G03 · 第三方
- [fiigii/ai-comp](https://github.com/fiigii/ai-comp/blob/main/Readme.md)
- 时间：HEAD 2026-07-12；身份：第三方解题实现；经验：不适用。
- 题意范围：HIR/LIR/MIR/VLIW；CSE/DCE/SLP；调度；寄存器压力。
- 限制：HEAD cdc89e79a7d1c946ff8d20dfaf80e33d1cbce9ee；围绕G02，不构成独立面经。

<a id="G04"></a>
### G04 · 第三方
- [caomaolufei/AIInfraGuide](https://github.com/caomaolufei/AIInfraGuide)
- 时间：HEAD 2026-10-20；身份：面经汇编及教程；经验：实习/校招/未知混合。
- 题意范围：GPU/CUDA、FA、量化、MoE、推理系统与编译器题线索。
- 限制：HEAD 6af26bab8bf072853b9ca292858ecc05152f81f4；网站自称181场65公司，不等于181个核验过的社招样本；pubDate不能直接当面试日。

<a id="G05"></a>
### G05 · 第三方
- [awesome-mlir-compiler-runtime-prep](https://github.com/copparihollmann/awesome-mlir-compiler-runtime-prep/blob/main/README.md)
- 时间：HEAD 2026-04-09；身份：面试准备阅读清单；经验：不适用。
- 题意范围：Dialect、rewrite、lowering、bufferization、runtime、Triton layout、SSA。
- 限制：HEAD efa5351452c2ab25bcc6d2307ce5d77bc902b1b3；不是公司真题。

<a id="G06"></a>
### G06 · 第三方
- [write-your-own-ai-compiler](https://github.com/alexshuang/write-your-own-ai-compiler/blob/main/README.md)
- 时间：HEAD 2024-10-19；身份：中文AI编译器实践教程；经验：不适用。
- 题意范围：Python/NumPy AST→IR；shape inference；canonicalize；lowering；后端与VM。
- 限制：HEAD 1e97f44412f14c72016d1d3dcf45f3024c9c073a；不是面经。

<a id="S22"></a>
### S22 · 寒武纪
- [寒武纪 AI infra 日常实习面经分享](https://www.nowcoder.com/feed/main/detail/7dfe46da13ad4ae8a3dd94c3ca7f5d05)
- 时间：2026-05-02；身份：本人实习面经；AI Infra相邻岗位；经验：日常实习，非社招。
- 题意范围：GEMM线程tile；CUDA前缀和；bank conflict；Little’s Law；开源项目。
- 限制：本轮续查新增。原页首条面经 createdAt=1777659900000，对应北京时间2026-05-02 02:25。提问中的8×8不是所有GEMM的最优配置。
