# 518 硬件与编译器：源码证据索引

采集日期：2026-10-23。对应正文 `content/30-compiler.json` 的 6 章，以及第二轮补强的 `content/36-real-compiler-case.json`。

## 快照与边界

- 仓库：`triton_shared`；本地 HEAD：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`。
- 本地 checkout 并非干净：已跟踪文件 `ci/test_job_vcs_case.txt` 有修改，并存在多份未跟踪研究材料。首批引用的 30 处源码/文档定位均逐项核对为已跟踪、相对 HEAD 无改动；第二轮新增定位的核对另列于文末。未将未跟踪报告当成该 commit 的内容。
- 本任务仅只读检查业务源码、项目规范、既有项目文档与公开官方文档，没有编译业务代码、执行模拟器或提交 VCS 作业。教材中的数值例子若未注明出处均是教学示例。
- `docs/vcs_debug/rtl-instruction-dependency-model.md` 是当前仓库中的 RTL 合同文档。本次核对其描述与编译器调用点，没有重新逐条读取所指 RTL，也没有重测其时序。
- 数量、参数和 pass 顺序是该 SHA 的事实；不自动代表部署端当前安装版本。MR !1190 等只用于历史机制背景，不声明当前 merge/CI 状态或重现历史收益。
- 用户关于本人经历和“25% 以上 MR”是用户自述，本任务没有做贡献比例审计；正文不将其写成已核验统计。
- 按用户公开发布授权，正文保留技术机制与仓库相对路径；索引不包含内部主机地址、个人目录、凭据或原始模型数据。

## 导航与验证方法

浏览本索引时，可在有权限的原仓库执行 `git show <SHA>:<relative-path>` 对照定位。行号以该 commit 文本为准；本次已验证所有引用文件存在、已跟踪、行范围有效。网页中源材料链接指向本索引，而非暴露内部网络链接。

## 源码索引

<a id="c-target"></a>

### 518 编译器硬件规格与 ABI

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`include/triton-shared/Target/ZeusV3/TargetInfo.h:11-117`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-spill"></a>

### 标量 spill 的物理格式约束

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`include/triton-shared/Target/ZeusV3/TargetInfo.h:122-200`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-banks"></a>

### L2 bank 几何

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`include/triton-shared/Target/ZeusV3/L2BankGeometry.h:7-12`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-pe"></a>

### PE 配置跨 IR 契约

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`include/triton-shared/Utils/PEConfig.h:9-49`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-model"></a>

### PE minitile 模型与搜索域

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`lib/Dialect/ZeusHigh/Transforms/PeMinitileModel.h:3-90`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-model-impl"></a>

### PE minitile 打分与枚举实现

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`lib/Dialect/ZeusHigh/Transforms/PeMinitileModel.cpp:137-240`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-pespec"></a>

### PE 物理限制与校准系数

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`include/triton-shared/Dialect/ZeusHigh/Transforms/PeHWSpec.h:43-147`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-driver"></a>

### Python 到 TTIR 的真实入口

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`zeus_compile.py:193-215`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-driver2"></a>

### TTIR 到 ZeusHigh 的驱动

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`zeus_compile.py:311-430`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-cpu"></a>

### 共享前端的 CPUBackend 路径

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`backend/compiler.py:284-312`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-pipe"></a>

### ZeusHigh pass 顺序

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`lib/Dialect/ZeusHigh/Transforms/ZeusHighPipeline.cpp:124-499`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-pipe-last"></a>

### 并行探测、地址分配与 SISO 顺序

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`lib/Dialect/ZeusHigh/Transforms/ZeusHighPipeline.cpp:500-545`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-backend"></a>

### ZeusLow 到代码生成的顺序

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`tools/zeus-compiler/zeus-compiler.cpp:948-1013`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-desc"></a>

### 描述符保留逻辑 dtype

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`lib/Dialect/ZeusHigh/Transforms/CreateFmapDesc.cpp:1625-1793`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-alloc"></a>

### 在途地址复用的性能代价

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`lib/Dialect/ZeusHigh/Transforms/AddressAllocation.cpp:2225-2284`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-alloc-desc"></a>

### 最终物理地址与 displacement 验证

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`lib/Dialect/ZeusHigh/Transforms/AddressAllocation.cpp:3773-3868`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-parallel"></a>

### ParallelExecutor 的准入与调度合同

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`docs/architecture/parallel_executor.md:1-160`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-window"></a>

### DMA 实际窗口不交证明

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`lib/Dialect/ZeusHigh/Transforms/ParallelVPAddressProof.cpp:249-300`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-lanes"></a>

### VP/DT physical lane 分配

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`lib/Dialect/ZeusLow/Transforms/AssignMultiExecutorPass.cpp:119-264`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-sync"></a>

### 依赖建模、验证与一次性物化

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`lib/Dialect/ZeusLow/Transforms/InjectSyncPass.cpp:244-390`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-timing"></a>

### RTL 时间点模型的项目文档

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`docs/vcs_debug/rtl-instruction-dependency-model.md:34-138`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-br-timing"></a>

### BR snapshot 与数据完成的区别

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`docs/vcs_debug/rtl-instruction-dependency-model.md:616-720`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-vp-retire"></a>

### VP retirement 与 RA 模式合同

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`docs/vcs_debug/rtl-instruction-dependency-model.md:984-1037`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-br-mode"></a>

### BReg append-only 的容量回退决策

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`include/triton-shared/Target/ZeusV3/BRegAllocationMode.h:12-79`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-ra"></a>

### 联合寄存器压力与分配诊断

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`lib/Target/ZeusV3/CodeGen/RegisterAllocationDriver.cpp:180-211`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-final-vp"></a>

### 最终 VP 物理 in-place 验证

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`lib/Target/ZeusV3/CodeGen/VPOutOfPlaceVerifier.cpp:1-80`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-codegen"></a>

### 最终机器指令验证及发射

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`lib/Target/ZeusV3/CodeGen/CodeGenPass.cpp:943-1088`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-balance-test"></a>

### mailbox balance 的回归样例

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`test/ZeusV3Backend/Unit/Transforms/inject_sync_mailbox_balance_static.mlir:1-12`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-driver3"></a>

### Python 驱动调用独立 Zeus 后端

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`zeus_compile.py:433-485`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

<a id="c-backend-direct"></a>

### 独立 zeusv3-backend 的 pass 顺序

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`tools/zeusv3-backend/zeusv3-backend.cpp:303-375`
- 检查范围：读取对应实现或项目文档；文件已跟踪且相对 HEAD 无改动。
- 权限：原仓库源码需原有访问权限；本页只提供可核查定位，不提供内部地址。

## 公开官方资料

- [MLIR Language Reference](https://mlir.llvm.org/docs/LangRef/)：SSA、Operation、Block、Region 的定义；2026-10-23 查阅。
- [MLIR Linalg Dialect](https://mlir.llvm.org/docs/Dialects/Linalg/)：结构化计算、索引映射与迭代空间。
- [Triton blocked programming model](https://triton-lang.org/main/programming-guide/chapter-1/introduction.html)：块级程序模型，避免把它等同于单线程 CUDA。
- [CUDA Programming Guide](https://docs.nvidia.com/cuda/cuda-programming-guide/)：CUDA 当前编程指南入口，2026-10-23 查阅。
- [LLVM Target-Independent Code Generator](https://llvm.org/docs/CodeGenerator.html)：通用后端结构、指令选择与寄存器分配。
- [Apache TVM Design and Architecture](https://tvm.apache.org/docs/arch/index.html)：图层、算子层、目标与 runtime 分层对照。

## 历史背景使用边界

历史工作记录用于提示优先检查在途地址复用、并行输出行与验证分层。正文核心机制已重新核对本次源码快照；未将历史收益、CI 状态或合并状态当作当前事实。

## 待补强证据

1. 流片前 ISA 协同设计的原始文档、会议决策和个人责任边界。
2. 本人 MR 贡献的统一统计口径与可审核清单。
3. 精确匹配最终源码 SHA 的代表性 RTL/VCS 记录与实芯片数据。
4. 518 与 GPU 同输入、同数值合同、同 batch/context/topology 的性能对照。
5. 当前各部署环境实际 compiler/runtime 版本与本教学快照的差异。


## 第二轮补强：真实 PE 地址复用案例

正文：`content/36-real-compiler-case.json`。只读核对日期同上。本轮新增九处定位均已通过 `git ls-files` / `git show` 与工作区差异核对：文件已跟踪、内容与冻结 HEAD 一致。原 checkout 仍有无关的 `ci/test_job_vcs_case.txt` 修改；没有改动业务仓库，没有执行测试、编译、模拟器或 RTL。

本章以真实中端测试为主线，用真实 lowering 源码和独立后端夹具连接机制。后端 8192/8256 地址案例不是中端 1024/3072 案例的本轮生成物。短摘录来自源码；地址时间图、简化占用和叙述中的区间运算属于独立教学推导，不是 trace。测试 CHECK 是仓库预期，不是本轮 PASS。

<a id="c-case-pe-test"></a>

### 三个实际地址分配回归

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`test/ZeusV3Midend/Unit/Transforms/address_allocation_pe_inflight_reuse.mlir:1–101`
- 核对：只读现有源码及测试合同；未执行 RUN。原仓库访问需原有权限。

<a id="c-case-policy"></a>

### PE 付费复用判定与容量回退

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`lib/Dialect/ZeusHigh/Transforms/AddressAllocation.cpp:2245–2284,2922–2965,3456–3486`
- 核对：只读现有源码及测试合同；未执行 RUN。原仓库访问需原有权限。

<a id="c-case-region-lowering"></a>

### 物理 L2 区间贯通 lowering

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`lib/Conversion/ZeusHighToZeusLow/ZeusHighToZeusLow.cpp:2966–2994`
- 核对：只读现有源码及测试合同；未执行 RUN。原仓库访问需原有权限。

<a id="c-case-overlap"></a>

### 按字节区间判定资源冲突

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`lib/Dialect/ZeusLow/Transforms/InjectSync/Resources.cpp:70–85,1414–1425`
- 核对：只读现有源码及测试合同；未执行 RUN。原仓库访问需原有权限。

<a id="c-case-pe-war"></a>

### 真实 PE 同单元 WAR 回归

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`test/ZeusV3Backend/Unit/Transforms/inject_sync_same_unit_linear_war.mlir:1–2,75–97`
- 核对：只读现有源码及测试合同；未执行 RUN。原仓库访问需原有权限。

<a id="c-case-waw"></a>

### 跨单元 WAW 与 no-mail 反例

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`test/ZeusV3Backend/Unit/Transforms/inject_sync_static_l2_order_proofs.mlir:1–6,96–136`
- 核对：只读现有源码及测试合同；未执行 RUN。原仓库访问需原有权限。

<a id="c-case-driver"></a>

### 实际入口必须转发选项

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`test/BusinessKernels/driver_pe_inflight_reuse.mlir:1–17`
- 核对：只读现有源码及测试合同；未执行 RUN。原仓库访问需原有权限。

<a id="c-case-option"></a>

### PE 偏好默认关闭

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`include/triton-shared/Dialect/ZeusHigh/Transforms/Passes.td:768–775`
- 核对：只读现有源码及测试合同；未执行 RUN。原仓库访问需原有权限。

<a id="c-case-pe-timing"></a>

### PE 读写时序的项目合同

- 仓库：`triton_shared`
- 版本：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`
- 文件：`docs/vcs_debug/rtl-instruction-dependency-model.md:727–767`
- 核对：只读现有源码及测试合同；未执行 RUN。原仓库访问需原有权限。

<a id="c-case-history"></a>

### PE 复用偏好的实际引入提交

- 仓库：`triton_shared`
- 提交：`5dd4ddbe47d91ca5a081fd466df2a9d0e389dbe4`
- 标题：`feat(AddressAllocation): support independent PE reuse placement [CONTRACT]`
- 核验方法：`git log -- test/ZeusV3Midend/Unit/Transforms/address_allocation_pe_inflight_reuse.mlir` 定位，再 `git show --no-patch` 读回完整提交说明；没有查询或修改 MR。
- 提交说明确认：选项 opt-in，保留 RAW reuse、capacity fallback 与 dependency checks；策略需贯通最终 allocator、ParallelReductionLookahead、StreamTopKGather 的容量探测。
- 当前快照的转发位置：`lib/Dialect/ZeusHigh/Transforms/ZeusHighPipeline.cpp:500–537`，版本为正文冻结 HEAD；已有 `c-pipe-last` 提供定位。
- 不核验、不陈述：个人独立作者身份、MR 当前状态、当前 CI 状态、历史性能收益是否可复现。
