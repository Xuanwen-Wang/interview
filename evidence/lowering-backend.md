# Zeus 后端 lowering：源码审计与证据范围

<a id="backend-evidence"></a>
## 固定版本与边界

- 采集日期：2026-10-26。
- 仓库：`triton_shared`；HEAD：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`。
- 工作区并非整体 clean：tracked diff 是 `ci/test_job_vcs_case.txt`，另有既存 untracked 文档和实验材料。本记录使用的文件均由 Git 跟踪，逐文件 `git status --porcelain -- <files>` 为空；本记录不把 untracked 实验结果归到 HEAD。
- 证据级别：源码/既存测试设计只读审计；没有构建编译器、运行 FileCheck、模型、CycleSim、functional sim 或 VCS。正文中的教学 CFG、寄存器交换和图为解释性构造，不是新编译日志。
- 用户关于“早期讨论 SelectionDAG”的陈述保留为本人回忆；公开文本不虚构动机、贡献归属和未找到的历史证据。

<a id="control-flow-evidence"></a>
## 控制流：当前顺序与历史文档的区别

- `tools/zeus-compiler/zeus-compiler.cpp:946–1005` 和 `tools/zeusv3-backend/zeusv3-backend.cpp:314–365`：桥接、args/init、LICM、可选 LiftControlFlowToSCF、SCFToCF、LowerArith、LowerStandardCF、cast reconcile、edge splitting、runtime AReg、清理/executor/config优化、InjectSync、CodeGen。
- `StandardCFLowering.cpp`：`cf.br` 到 `JumpOp`；条件比较类型门禁；signed/unsigned 属性保留。
- `SplitCriticalEdgesPass.cpp::splitIfNeeded`：条件后继携带 block operands 即插 trampoline，并将参数传给无条件 jump；并非只拆经典拓扑意义上的 critical edge。
- `InstructionSelector.cpp:884–1035`：lowerBranchDataFlow 按寄存器类别发出复制，GPR 环用 scratch 解环，AReg/VReg 和非 GPR 环有拒绝路径。
- `InstructionSelector.cpp:1474–1615`：unsigned SUBU/carry；signed 显式 overflow 修正；机器 flag 依赖不能仅靠结果寄存器 use-count 处理。
- `test/ZeusV3Backend/Unit/CodeGen/phi_parallel_copy.mlir` 引用独立 simultaneous-copy oracle；本轮只读其测试意图，没有执行。
- `docs/Zeus_Backend_Control_Flow_Lowering.md` 自报 2026-03-11 v2.1，仍列“InjectSync→LICM→SCFToCF”；这是历史描述，不是当前工具实际 pipeline。文档内还保留更早 LowerZeusFor 的段落，不能混拼成一个现行架构。

<a id="vp-evidence"></a>
## VP：模块、资源与配方

- `include/triton-shared/Dialect/ZeusHigh/IR/VPModuleDefs.h:145–191`：有序 modules、64 通道、L0/L1 32 通道、tree 之后的 scalar 模块。不能把这里的模式数当作实测每周期吞吐。
- `VPModuleToConfigMapping.cpp:48–110,138–218`：读模式选择、闭合 PostCal 校验、lane模式、sticky PRG/pooling 字段重设。
- `ZeusHighToZeusLow.cpp::lowerVP`：shape/layout 对读模式的影响、配置与执行分离、managed lane 和 PRG 本地状态加载/广播。
- `InstructionSelector.cpp:2398–2470`：vp_config 可生成多类 SETM；vp_compute 选择 STSR/DTSR；缺省/AUTO 编码 VP0、显式 lane 保留。
- `VPChainingLegality.cpp`：fresh ownership、alias roots、读移动、operand role、broadcast domain 与资源门禁。
- `PostCalScalarChaining.cpp` 及 `VPModuleDefs.cpp::isExactPostCalScalarMulRecipe`：有序两次 FP32 scalar multiply；不能替换成 X*(a*b)。
- `docs/architecture/vp_chaining_legality.md`：共享 CAL FIFO 输入契约；本轮验证当前编译器资源门禁，没有重新读取 RTL 来宣称新的硬件测量。
- `docs/architecture/vp_closed_recipes_and_certificates.md`：特殊 recipe、数值边界、certificate 的前后检查及支持范围；参数开关在正文不泛化为所有编译都会启用。
- 主线教学 `Y=max(X+2,0)`，BF16 [6,32]、tile [4,32]、第二块有效 [2,32]。未编译这个例子，不承诺当前 matcher 选择具体融合配方；另用源码可证实的 FP32双scalar配方说明真实机制。

<a id="register-evidence"></a>
## RA 与同步之间的契约

- `CodeGenPass.cpp:650–685`：auto Greedy(primary PressureFirst) + LinearScan fallback；实验算法单独门禁。
- `CodeGenPass.cpp:780–855`：RA 前保存/验证证书与 BReg contract；prepare recipe；runAllocatorWithPolicy；RA 后决策/IR/mailbox/VP真实寄存器验证。
- `RegisterAllocatorBase.cpp::computeLiveIntervals`：loop修正、fixed source、别名等活跃期责任。
- `RegisterAllocationDriver.cpp`：分配事务、spill和重试策略；本篇不声称所有分配策略都用于每个 kernel。
- 后端 RA 发生在 InjectSync 之后。中端地址分配发生在 InjectSync 之前。正文图将两者明确分开。

<a id="selectiondag-evidence"></a>
## SelectionDAG 事实与未知历史

- 当前 NPU pipeline：`zeus-compiler`/`zeusv3-backend` → `CodeGenPass` → 自有 RA + `InstructionSelector` → encoder/Builder。此链没有 LLVM IR→SelectionDAG 调用；大量复用 MLIR/LLVM 基础设施。
- `CMakeLists.txt` 还保留独立 CPU backend 选项。因此不能把 NPU 路线概括为“整个仓库没有 LLVM 后端”。
- 按路径查询可见，`InstructionSelector.cpp` 最初入库提交是 `d2a23642aa4b24cbe9a6afe32c91c7d88311815d`，2026-03-03，标题 `[feature] Add ZeusLow Dialect, ZeusV3 hardware backend and toolchains`；`git show <sha>:...InstructionSelector.cpp` 可见直接操作 MLIR、构造自有指令对象的实现。
- 有界历史检索：当前 docs 中 SelectionDAG/Selection DAG/GlobalISel 关键词与提交说明检索未定位到当年选型记录。未找到不等于没有；也不证明该提交是整个项目第一次讨论后端方案。
- 对照源 `llvm-project: llvm/lib/CodeGen/SelectionDAG/SelectionDAGISel.cpp`：`CodeGenAndEmitDAG` 中 LegalizeTypes/LegalizeVectors/Legalize/DoInstructionSelection 等职责。本机该目录没有可靠 Git revision，不能确定它与项目依赖的精确关系，只作通用机制对照。

<a id="binary-evidence"></a>
## 最终指令、布局与 ABI

- `CodeGenPass.cpp:941–1085`：selection → machine gates → peephole → codeOffset → final contract → CT fetch legalize/verify → asm或binary发射。
- `PeepholeOptimizer.cpp::optimizePhysicalBRegState`：物理BReg字段差分；不等同中端的CFG must-analysis。
- `Binary/Builder.cpp::setInstructions`：最终label布局、8B little-endian编码；记录CT_ST入口、AR30参数基址、AR31 kernel基址 patch位置。
- `CodeEmitter.cpp::deriveArgDescriptors/run`：参数layout与实际值分离、常量先于最终机器layout。
- `Binary/Format.h` 与 `docs/architecture/zbin_format.md`：固定header160B，ArgDescriptor每项16B，tail2B，64B alignment。2参数描述示例header256B可独立算出。
- zbin保存runtime patch位置，不应暗示使用ELF relocation section。descriptor重基、label分支解析、runtime load-address patch是三个不同问题。

## 面试追问

1. 为什么控制流在这层展开？零次循环和带入值怎么保存？
2. φ copy 中 R1/R2 交换怎样发指令？为什么 AReg 不能套同一逻辑？
3. 为什么一次VP操作不是一条ISA？模块顺序和FIFO约束分别是什么？
4. 两个单独合法的VP为什么融合后不合法？给别名和精度反例。
5. 自动同步之后还有RA，如何确保descriptor复用/spill不破坏已生成同步？
6. 不使用SelectionDAG仍然有哪些legalization？哪些能交给MLIR，哪些必须自己维护？
7. codeOffset怎样影响机器码合法性？参数ABI和runtime patch怎样与编译器对齐？

## CUDA 对照来源

- NVIDIA CUDA Programming Guide 4.12 Asynchronous Data Copies，2026-10-26 读取：https://docs.nvidia.com/cuda/cuda-programming-guide/04-special-topics/async-copies.html 。
- 官方说明异步 copy 使用 shared memory barrier / pipeline 表达完成；线程参与同步与 copy completion 有各自条件。正文只据此比较职责，不宣称所有 GPU 指令都需要软件 barrier，也不把 TMA descriptor 等同 Zeus BReg。

## 本轮引用文件 SHA256

| 仓库内路径 | SHA256 |
|---|---|
| `tools/zeus-compiler/zeus-compiler.cpp` | `91fc3b1bbff0c02c97bea622ab2c0c104ed9cccb21a6e88e0513fc745ed55020` |
| `tools/zeusv3-backend/zeusv3-backend.cpp` | `5da639aa4ed4af24979d27bb74a6464359fd1b8142d4dd1f6037bcf11827f75a` |
| `lib/Dialect/ZeusLow/Transforms/StandardCFLowering.cpp` | `1e6610f4bf20e9cf97867aa6a7290d88914acea227be345e53a7b396dcc89cbd` |
| `lib/Dialect/ZeusLow/Transforms/LowerStandardCFPass.cpp` | `a46ed1604e183a335d57b33a70c2b9252e61b3057dd59ce9e29f1f170018fe21` |
| `lib/Dialect/ZeusLow/Transforms/SplitCriticalEdgesPass.cpp` | `c3e88fb07c4960130e5173292e4bc36fc7e575072d8309e70f47b42b5a18e362` |
| `lib/Target/ZeusV3/CodeGen/InstructionSelector.cpp` | `c42d552e7f4f84af90925a356927cc9717114dce003f5f636beb7ce42f464ac1` |
| `include/triton-shared/Dialect/ZeusHigh/IR/VPModuleDefs.h` | `4a8edd301509dea1d8244133219b4292ad5f1b80e910e89b9b3e5bc399c4930d` |
| `lib/Dialect/ZeusHigh/IR/VPModuleDefs.cpp` | `4f6b1301953b4a7c2cdb422580517a1cc4caca9a7d25d17675adc3e04acf1d2c` |
| `lib/Conversion/ZeusHighToZeusLow/VPModuleToConfigMapping.cpp` | `1a763fc4bb3aeac1a4b173716ada506dc3e8eb57e522801b51963cef587947d5` |
| `lib/Conversion/ZeusHighToZeusLow/ZeusHighToZeusLow.cpp` | `00d23c78e9434c76f55fc140e63d9043362f550a8bd1608367d2af287ef4d91f` |
| `lib/Dialect/ZeusHigh/Transforms/VPChaining/VPChainingLegality.cpp` | `00ab0e6d58e4400178a50781b0302afef4c4f5550982c3d77896093a4a8158df` |
| `lib/Dialect/ZeusHigh/Transforms/VPChaining/PostCalScalarChaining.cpp` | `538722bcc8d64b5dfc49a0c3a68d811d75c5c86e6ac7c8947e2fc7e087f1633a` |
| `lib/Target/ZeusV3/CodeGen/CodeGenPass.cpp` | `5349d05c30e995814fb9de17e9764cfd0ddf06a6a43718b97a0cf83c73ba1817` |
| `lib/Target/ZeusV3/CodeGen/RegisterAllocatorBase.cpp` | `127d3f9b038ccb9b70b0e1f9cb1abe9726d4076a9398c930ddc2f9f6b15e5d58` |
| `lib/Target/ZeusV3/CodeGen/RegisterAllocationDriver.cpp` | `67489c5141307611151ad2bb7ff9428e764adedee483fafcb8b38b6cfdaf7a64` |
| `lib/Target/ZeusV3/CodeGen/AllocatorFactory.cpp` | `589e3244f4df691308c993cb2d31f229532f69088eb53f0348437f0a74f5d9c4` |
| `lib/Target/ZeusV3/CodeGen/PeepholeOptimizer.cpp` | `aa2c7d220f10e252a998aa72c52077b9c03c34b798d6e04bbec4bb102fc285ee` |
| `lib/Target/ZeusV3/CodeEmitter.cpp` | `3a90c95c952633c7b0abb5d2caec3f6fa9ce0b65f0ac3592c4c5a3e458e9318a` |
| `lib/Target/ZeusV3/Binary/Builder.cpp` | `cb65ee9efb4a94eb10deabe4b8a0f2b58e44cbfd0d789952bc0f300cb23709c2` |
| `lib/Target/ZeusV3/Binary/CTFetchErratum.cpp` | `be5dd4ac505687a0d497b9f2d3e02c7dfd43f70f59a1da63abf3f0c434a4e5a6` |
| `include/triton-shared/Target/ZeusV3/Binary/Format.h` | `b3159d2f089feece1f94459f3eac55fa1aa9a317fd0ef275a3b5341f23fc07bf` |
| `docs/Zeus_Backend_Control_Flow_Lowering.md` | `7ee50a5de9a589bb73da206b7912d82df91a7ae6abb1a6a2086eca62a52292b7` |
| `docs/architecture/vp_chaining_legality.md` | `c1df5969f4b9532bb7cb61ec6b606021985dd8223e92a87598bbe8e04d934d79` |
| `docs/architecture/vp_closed_recipes_and_certificates.md` | `9ba2c54bf94f46b73ee550ce3478079d3f7045060f28c7477c2efc2753438109` |
| `docs/architecture/zbin_format.md` | `fa912899b37bf411dea38bffba6bf661e38f18765855ef7a143ae0505c6fd3f2` |
| `test/ZeusV3Backend/Unit/CodeGen/phi_parallel_copy.mlir` | `a1f6f0afd871137890e95614257033b9dae8a9e29e49fbe660d11659ef263d15` |
| `test/ZeusV3Backend/Unit/Transforms/split_critical_edges_unsigned_compare.mlir` | `017b30d683eaeac0078eca539a36c49ceed6e7380995e16ed0d84c80f3bd76d1` |
| `test/ZeusV3Backend/Unit/Conversion/vp_postcal_scalar.mlir` | `c55fe419da3c10d39f2fe7f5f3a04071afec63ddd0c0dfca67096f7efbacfae3` |

LLVM comparison SHA256 (`revision unknown`): `dda3d47c2dfe69ee50366c0e6d22ad7f49046060ae99efa9e15461bd7615f361`.
