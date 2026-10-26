# LLVM / MLIR 基础与后端教程：源码证据

本文件保留最初的共享快照指纹和简单编译实验，供旧链接追溯。正文已改为围绕实际开发与失败案例展开；当前重写的主要证据如下，不能用下方历史 `scaled-add` 实验代替：

- [基础组件工程实验](compiler-foundations-engineering.md)：实际编译两个原创 Pass 插件，分析失效、poison、greedy rewrite 与 Dialect Conversion。
- [SelectionDAG 工程实验](backend-isel-engineering.md)：ctlz 位宽和 feature 对照、matcher、立即数边界、60,314 次独立语义检查以及 GlobalISel 失败范围。
- [机器后端工程实验](backend-machine-engineering.md)：跨调用活跃值、RA / spill / PEI、最小 MIR 正负例和 4,099 组原生执行。
- [driver 配置实验](compiler-driver-engineering.md)：命令行和函数 feature 属性的三组对照。
- [完整复跑入口](../practice/llvm/README.md)：输入、插件、驱动和各验证脚本。

<a id="snapshot"></a>
## 版本和证据边界

- 核验日期：2026-10-26（Asia/Shanghai）。业务源码和共享构建只读。
- 源码：共享 `llvm-project` 快照；`cmake/Modules/LLVMVersion.cmake` 为 22.0.0，工具报告 `22.0.0git`，Optimized build with assertions。
- 共享目录 `.git` 指向已不存在的外部 submodule 元数据；`VCSRevision.h` 未定义 LLVM_REVISION 和 LLVM_REPOSITORY。因此 **无法确认对应 commit**，不把它冒充 release/22.x、上游 main 或某个已知提交。
- 以下 SHA256 固定本次读到的关键文件。公共源码可在 [llvm/llvm-project](https://github.com/llvm/llvm-project) 按相对路径导航，但 main 的内容不能自动视为与共享快照一致。
- 下方历史实验固定 x86_64-unknown-linux-gnu、mcpu=x86-64、O2，仅编译与检查。当轮没有执行函数；当前重写新增的原生语义执行、真实 spill 轨迹和 GlobalISel 负例见上述独立记录。所有图均为结构示意，没有芯片性能或端到端结论。

## 关键源码文件

| 相对路径 | SHA256 |
| --- | --- |
| `cmake/Modules/LLVMVersion.cmake` | `4bfbf0035b772cf590538b515f8753833fde0839a1128b4f6f0503a343fa4fbb` |
| `llvm/tools/llc/llc.cpp` | `474859dfb21a2091480bb54c289bff0a4de0b3ea1f70580401731dcd9d621b7c` |
| `llvm/lib/CodeGen/CodeGenTargetMachineImpl.cpp` | `3e193e165888aede1d6c1639e025e59bfd358103e649f121837e4f712afc4c7c` |
| `llvm/lib/CodeGen/TargetPassConfig.cpp` | `709205a50ca8737db38acdf4554af3e9fcccca9be2f103ca4dab12e96388c95f` |
| `llvm/lib/CodeGen/SelectionDAG/SelectionDAGISel.cpp` | `dda3d47c2dfe69ee50366c0e6d22ad7f49046060ae99efa9e15461bd7615f361` |
| `llvm/lib/CodeGen/SelectionDAG/SelectionDAGBuilder.cpp` | `29967fd734d2c8e26d66b9b12298f29e4a66589be5c1b2f91660633fbd525cfd` |
| `llvm/lib/CodeGen/SelectionDAG/DAGCombiner.cpp` | `3463184c9eee47a4abcbf6ed91d794fae76337e0da6667dbaa53ecd5eb9e8dba` |
| `llvm/lib/CodeGen/SelectionDAG/LegalizeTypes.cpp` | `f9455b1600e598add44c968b4bb1d41d9332d022488344f685d427deee86ccff` |
| `llvm/lib/CodeGen/SelectionDAG/LegalizeDAG.cpp` | `836a5237b9c0d84cca29fcb984198298915cb55c2fa98cbe5a0c3acef218d3ff` |
| `llvm/lib/CodeGen/SelectionDAG/LegalizeVectorTypes.cpp` | `49269f224adad7e3fbd2421fcb4f1c97ccd0d8e3a9d796274c6e80a3ad18fd04` |
| `llvm/lib/CodeGen/GlobalISel/IRTranslator.cpp` | `e0c66a90b0ed8da1e40f38d7657bcc3f25cfdff8fb0311d673628e067167a425` |
| `llvm/lib/CodeGen/GlobalISel/Legalizer.cpp` | `ef2fc8569b7c38a38856e463df27b41fdbd68a2025268f4fab3e4846572dca17` |
| `llvm/lib/CodeGen/GlobalISel/RegBankSelect.cpp` | `aace3f993aaa00bead9f0c12a805bb0244306af571f43ae20178735ebebbd7fb` |
| `llvm/lib/CodeGen/GlobalISel/InstructionSelect.cpp` | `d7fca997476f79d9da271875b09212969331551ca2f84529835ff92603658eea` |
| `llvm/lib/CodeGen/PHIElimination.cpp` | `76736d12c6ce2467b092b4865d9848e7a5705fd8ea4ccee819e1c390c748e656` |
| `llvm/lib/CodeGen/TwoAddressInstructionPass.cpp` | `568f6192c492aabb8e02fb82a3cd884943af74a8f06b4c6ab20deb44e841fb3c` |
| `llvm/lib/CodeGen/RegisterCoalescer.cpp` | `bb8e792a9ef8022aa1daacdf21a57fe44394b89520dca47874b39fbdf5bbad4c` |
| `llvm/lib/CodeGen/MachineScheduler.cpp` | `48d93d340382576d651b28973bf4b598e46ddc90a3b5b31d3eebd30fc8b205fe` |
| `llvm/lib/CodeGen/LiveIntervals.cpp` | `25d2bf60a0ce4c89141fe7cb70022678d2f2584477bc309af67bc5ac626d0dc8` |
| `llvm/lib/CodeGen/LiveRegMatrix.cpp` | `909c341961ab38db80e584bb3fc847533d0008afb5ec81711a69c2fcc6efc1d8` |
| `llvm/lib/CodeGen/RegAllocGreedy.cpp` | `c1905eae0464f4f71f95122d34e2790e8209e5ee15c357548b363a4c3107dcf8` |
| `llvm/lib/CodeGen/InlineSpiller.cpp` | `b5f17b1ee10aab359ff436219630cf1d16ee6c03ee13060fba5bef68201e2033` |
| `llvm/lib/CodeGen/VirtRegMap.cpp` | `8bacf912bc897019b891563f453d2e8e8863840624be2b3e8dc33d605094c20e` |
| `llvm/lib/CodeGen/PrologEpilogInserter.cpp` | `9562edbf17eb3c357ca519b5f085775c5e4d47f947fe0d9151050a18d34e76c7` |
| `llvm/lib/CodeGen/AsmPrinter/AsmPrinter.cpp` | `6262e32ce11509a05559b88f29649f14c1bcb6df819965bf80783702680d4823` |
| `llvm/lib/Target/X86/X86ISelDAGToDAG.cpp` | `5a3aa6501debf00cfa54d6ae546dc15a3ca466f1bc065e44e96ad6dfd9060779` |
| `llvm/lib/Target/X86/X86ISelLowering.cpp` | `a6bed271fd260ea92e2514890c78162415c8cd4d42855058fe23eabb64d29fb6` |
| `llvm/include/llvm/IR/PassManager.h` | `3b2ad99390f8482c35430c08bce822047a2c61f50806d92b18cec7327e7f56f7` |
| `llvm/include/llvm/IR/Analysis.h` | `1684f620a8c098067b78112957a965bc9f9cfb7ed84801bc482338c8cdc71d49` |
| `llvm/include/llvm/IR/Value.h` | `359d1bbf59d747a0e0b2e40a2b94569cd984b5fbcb46e7dd935b67d44a6ba7cc` |
| `llvm/include/llvm/CodeGen/TargetLowering.h` | `a5e8ca68a8b547353596ed0f9f18d229fc9c7f051a1a0e548988d3504da2e3fd` |
| `mlir/include/mlir/IR/Operation.h` | `e6fa8d742b79163d347a5f5c818750ce231c12bbea33f35b70b86d18f5f28162` |
| `mlir/include/mlir/IR/PatternMatch.h` | `fac058a4836ca08f3337e903788168deda544246fe056ed4a6a16c7273185e34` |
| `mlir/include/mlir/Pass/PassManager.h` | `9471ada971a31d53745d8f92ba02a4f548c0907285c3fcefe40f2267ff08e233` |
| `mlir/include/mlir/Pass/AnalysisManager.h` | `f41b1af652b25f0ec6c5688bf8ffcb045ae266d2d48072b1685b351a6458517e` |
| `mlir/include/mlir/Transforms/DialectConversion.h` | `ff69769af208e6d7eac8b05656553142592b2075bb608c4cb2a4d12d99b4c464` |
| `mlir/docs/PassManagement.md` | `a71f2881ac6b08fe0d4d95f78d2c1f6cee0acb2bf11d58f409da6838223b3fa7` |

## 源码定位

- `llvm/lib/CodeGen/TargetPassConfig.cpp:1070`：addISelPasses；`:1111`：addMachinePasses；`:1459`：addOptimizedRegAlloc；`:1425`：分配与 VirtRegRewriter 的连接。
- `llvm/lib/CodeGen/SelectionDAG/SelectionDAGISel.cpp:908`：CodeGenAndEmitDAG；Combine、类型／向量／操作合法化、选择、调度与 EmitSchedule 的顺序。
- `llvm/lib/CodeGen/RegAllocGreedy.cpp`：selectOrSplit、tryAssign、tryEvict、trySplit 和 spiller；源码里的多个处理状态不能简化成一次性的四个动作。
- `mlir/docs/PassManagement.md`：OperationPass 不得查看兄弟可变状态、修改范围、当前 op 属性例外和并行克隆约束。
- LLVM New PM 的 PreservedAnalyses 与 MLIR 的 markAnalysesPreserved 是两套 API，不混写。

<a id="runs"></a>
## 历史简单编译实验（保留原始记录）

原创输入位于 `practice/llvm/`。所有命令返回 0，执行目录为独立临时工作目录；公开材料不记录内部主机、个人目录或浏览器状态。

```bash
opt -S -passes='function(instcombine),verify' -verify-each -debug-pass-manager fold.ll -o folded.ll
mlir-opt fold.mlir --pass-pipeline='builtin.module(func.func(canonicalize,cse))' --verify-each -o folded.mlir
llc -O2 -mtriple=x86_64-unknown-linux-gnu -mcpu=x86-64 -debug-pass=Structure scaled-add.ll -o scaled-add.s
llc -O2 -mtriple=x86_64-unknown-linux-gnu -mcpu=x86-64 -stop-after=finalize-isel scaled-add.ll -o selected.mir
llc -O2 -mtriple=x86_64-unknown-linux-gnu -mcpu=x86-64 -stop-after=virtregrewriter scaled-add.ll -o allocated.mir
llc -O2 -mtriple=x86_64-unknown-linux-gnu -mcpu=x86-64 -verify-machineinstrs -filetype=obj scaled-add.ll -o scaled-add.o
llvm-objdump -d scaled-add.o
llc -O2 -mtriple=x86_64-unknown-linux-gnu -mcpu=x86-64 -debug-only=isel scaled-add.ll -o isel.s
```

观察：

- LLVM 与 MLIR 的 plus_zero 均直接返回输入值。
- 初始 DAG 为 mul/add；AfterLegalizeDAG combine 后出现 X86ISD::MUL_IMM；选择后的 MI 使用 LEA64_32r、ADD32rr。
- finalize-isel 截面有 vreg、COPY、INSERT_SUBREG；virtregrewriter 后为物理寄存器。
- ELF 对象反汇编为 `8d 04 bf`（LEA）、`01 f0`（ADD）、`c3`（RET）。没有 spill。
- 仅执行编译、结构验证与反汇编，没有链接／调用示例函数，也没有性能测量。

| 输入／生成截面 | SHA256 |
| --- | --- |
| `fold.ll` | `a18720e74a8095e9e4f23fc5bb6b1c091814e46eca1a86130367913546cc4a9a` |
| `fold.mlir` | `f13d0f39110a0d914f58841415d4090917fd91c00747243ec6925387f8641181` |
| `scaled-add.ll` | `18ec8adc180e54e31462df8f5ade9a8dab7094e8e933dedc3c7b8350daa5d1c2` |
| `folded.ll` | `238157ed5c5574f406465fd0059a339e097e5ccf1d22cb66488af3d10c5beda7` |
| `folded.mlir` | `b11983df58bbb14f52bad6bdb033358540f4c1e84afaffbf6efad1b2f3ac3424` |
| `selected.mir` | `c3e867c3adbc531449a5957f079b468c52357972d1307accf37db1b821538d08` |
| `allocated.mir` | `c3a1965fea04108413a602678366f8d46a9dbd4658a30d9c443cf7aa2f7b30f6` |
| `scaled-add.s` | `1abbd5c925cefcdf0ecfdd91976f36921aa895ac4310be9bdd850d9b02b185b9` |
| `scaled-add.o` | `f91c9442df8660a2233d105cbec8a3360b8aea970860803e44bcb8069c8f607c` |

## 外部参考

- [LLVM Code Generator](https://llvm.org/docs/CodeGenerator.html)、[New PM](https://llvm.org/docs/NewPassManager.html)、[GlobalISel](https://llvm.org/docs/GlobalISel/index.html)、[MIR](https://llvm.org/docs/MIRLangRef.html) 为官方机制参考；精确顺序依上述共享源码。
- [MLIR Pass Infrastructure](https://mlir.llvm.org/docs/PassManagement/)、[Dialect Conversion](https://mlir.llvm.org/docs/DialectConversion/) 为官方框架合同。
- 用户提供的 [Five100Miles 系列目录](https://www.cnblogs.com/Five100Miles/category/1438128.html) 已读取；正文参考其“概述、lowering、combine、legalize、select”的模块划分。历史博客不作为当前接口、默认 pipeline 或精确实现的唯一依据；正文和图示原创。

## 维护入口

- `content/50-compiler-internals.json`：基础组件完整 HTML 的内容、阶段、问答、来源与旧链接映射。
- `content/51-llvm-backend.json`：后端完整 HTML；RA 位于 `backend-stage-ra`，可以继续新增 sections。
- 导航只保留两篇；所有旧 chapter 和 section 通过 legacyChapters 映射，原笔记保留在旧笔记区域。
- 原有 518 项目篇保留独立证据范围，不用通用 LLVM 示例替代项目事实。
