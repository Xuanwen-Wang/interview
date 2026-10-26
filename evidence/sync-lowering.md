# 518 自动同步长文：来源与证据边界

<a id="sync-baseline"></a>
## 本轮核验范围

- 采集日期：2026-10-26。业务仓库 `triton_shared` 只读，HEAD `82613bc2eb30feb9ef7f57aef20584df0ef9e28a`。
- 下表全部引用文件的 `git status --porcelain -- <files>` 输出为空，引用的是该 HEAD 中的内容；仓库整体并非干净（有无关 CI 清单修改和大量未跟踪研究笔记），未将那些改动归给此版本，也未编辑业务文件。
- 本轮核对源文件、原始 LaTeX 设计文档、Git 历史与已有 lit fixture 的意图；没有运行编译器、模型、CycleSim、VCS/RTL、硅上测试或性能 A/B。
- 设计 PDF 共 56 页，文件元数据显示 2026-09-14 生成；LaTeX 标题日期 2026-09-11，开头说明实现与实验状态截至 2026-09-10。页面日期不是当前 HEAD 所有结论的共同测试日期。
- 文中小整数指令序号、[4096,5120) 地址、两轮循环都是原创教学设定，非真实业务结果。图均为关系示意，除明确整数序号外不按时间/容量比例绘制。
- 对 RTL 事实的引用来自本仓库维护的硬件证据合同及该合同列出的 RTL 位置；本轮未重新打开全部 RTL 源码。应称“合同与当前编译器对应实现核对”，不称“本轮完成 RTL 验证”。

<a id="sync-timing"></a>
## 事件边界

- `docs/vcs_debug/rtl-instruction-dependency-model.md:23–202`：单 PC dispatch、snapshot、queue、issue、done、mail visible；§0.3 CT 阻塞前端不阻止已入队后端继续执行。
- 同文 `:616–674`：BR descriptor 与 snapshot。配置顺序证明只解释配置 hazard。
- `docs/vcs_debug/inject-sync-debug-manual.md:65–101`：debug 时间点表及 no-tag mailbox 说明。

<a id="sync-resources"></a>
## 指令效果与 typed resource

- `include/triton-shared/Dialect/ZeusLow/Transforms/InjectSync/Resources.h:114–148`：Value/BRegConfig/VPConfig/VPReg/VPPooling/PEConfig/VPInternal/DmaBaseAddr/DmaWindow/StaticL2Addr/L2Region/L2MayAlias/WeightSlab。
- `include/triton-shared/Dialect/ZeusLow/Transforms/InjectSync/Model.h:149–165`：InstructionEffect 的 unit、profile、mail capability 与读写集合。
- `lib/Dialect/ZeusLow/Transforms/InjectSync/Effects.cpp:129` 起：穷举指令语义 registry。
- `lib/Dialect/ZeusLow/Transforms/InjectSync/EffectBuilder.cpp:578–590`：当前 PE 读 srcA/srcB，dst 不作为 L2 输入；VP 根据 vpComputeReadsDst 判断 RMW。`:1240–1252` 把 BR snapshot 与数据 read 分开。
- **修正旧解释**：硬件合同 `rtl-instruction-dependency-model.md:772–794` 明确 PE 在 OL1 累加、L2 destination 只写，CM 是 rounding 选择。旧“destination accumulator read”的模型曾用来补 DT→PE 顺序；当前该顺序应由跨单元 WAW 保留。不能照旧文档把 PE dst 写成必读。

<a id="sync-address"></a>
## 物理复用与 alias

- `docs/ZeusLow_Inject_Sync_Pass.md:12–30`：AddressAllocation 的异步循环共址属于放置/成本选择，不构成 InjectSync no-mail proof；后端按最终物理区间独立建 RAW/WAR/WAW。
- `lib/Dialect/ZeusLow/Transforms/InjectSync/Resources.cpp`：资源 identity/conflict/coverage 的代数；同目录 EffectBuilder.cpp 将 operand 读写投影到资源。
- `lib/Dialect/ZeusHigh/Transforms/AddressAllocation.cpp`：片上物理放置 owner。文中地址为教学值，不从具体业务地址推导性能收益。

<a id="sync-unit"></a>
## 单元内顺序、lane 与跨核边界

- `docs/vcs_debug/rtl-instruction-dependency-model.md:736–770`：同 core PE L2 WAW 的 segment grant 顺序；不能推广为 RAW/WAR completion。
- 同文 §6、§7：LD/ST/LW/VP/DT 的不同完成与顺序合同。
- `.claude/rules/inject-sync-rules.md` 与主设计文档：managed split group 的 head acquire / tail completion，默认 lane 归一，任意跨 lane 支持边界。规则作为导航，当前实现由 Effects/EffectBuilder/Verification 核对。
- `docs/mailbox-sync-chain-model/mailbox-sync-chain-model.tex:1872–1883`：SI 顺序与数据效果分开；match-fail 也可正常退休，数据有效性由跨核配对合同负责，单核 DAG 不证明 remote 数据正确。

<a id="sync-mailbox"></a>
## 无 tag mailbox

- `docs/vcs_debug/rtl-instruction-dependency-model.md:268–326`：收发 mask、sender counter，无 producer/resource tag。credit FIFO 是编译器证明抽象，不是硬件存储 tag。
- `docs/mailbox-sync-chain-model/mailbox-sync-chain-model.tex:168–298`：硬件抽象、公理与 lane；具体假设不能泛化到所有 NPU。

<a id="sync-pipeline"></a>
## 当前 pass 顺序

- `tools/zeus-compiler/zeus-compiler.cpp:948–1013`：ZeusHighToZeusLow → 参数/init → LICM → 条件 LiftControlFlowToSCF → SCFToControlFlow → LowerArith/LowerStandardCF → critical edge → runtime arg → CSE/Canonicalizer → AssignMultiExecutor → BR清理/优化 → scalar divide scheduling → InjectSync → CodeGen。
- `tools/zeusv3-backend/zeusv3-backend.cpp:303–375` 为独立 backend 入口，需与统一 compiler 一并看。
- 不将受开关控制的 pass 写成所有编译必经。

<a id="sync-architecture"></a>
## 冻结模型、验证与唯一物化

- `lib/Dialect/ZeusLow/Transforms/InjectSyncPass.cpp:80–425`：入口预检、模型构建、verifyDependencyModels、materializePhysicalMailboxSchedule、最终 registry/provenance/mailbox/VP检查。
- `ModelBuilder.cpp` / `Planning.cpp` / `Lowering.cpp` / `Verification.cpp` / `Ledger.cpp` 位于 `lib/Dialect/ZeusLow/Transforms/InjectSync/`，分别承担冻结模型、plan/schedule、机械物化与最终检查。
- `docs/vcs_debug/inject-sync-debug-manual.md:10–62` 明确默认 staircase 与 legacy Phase 词汇区分；report 不得在插 mail 后重建另一份 canonical model 自证。

<a id="sync-staircase"></a>
## 阶梯算法及手算

- `docs/mailbox-sync-chain-model/mailbox-sync-chain-model.tex:406–525`：单 channel 点 (p,c)，后缀最小值、相同站点去重；覆盖条件 sender 不早于 producer、receiver 不晚于 consumer。文中四点 (1,1),(2,3),(3,2),(4,4) 为同构的原创整数算例，输出 (1,1),(3,2),(4,4)。
- `lib/Dialect/ZeusLow/Transforms/InjectSync/Staircase/StaircasePlanning.cpp`：区域规划与阶梯构造，buildStaircasePlan 位于约 900 行；消费者最早 frontier 的结论只在给定顺序和相关假设下成立，不是全局性能最优。
- `test/ZeusV3Backend/Unit/Transforms/inject_sync_staircase_linear.mlir:1–100`：crossing_points_share_one_token / nested_points_keep_two_tokens；本轮只读测试，不报告重跑通过。

<a id="sync-capacity"></a>
## 容量和代价边界

- `lib/Dialect/ZeusLow/Transforms/InjectSync/Staircase/StaircasePlanning.cpp:592–606`：6-bit counter 63 上限，kOutstandingBudget = kMailboxCounterCapacity - 1；说明 multi-source recv 需要保留槽位，以及 VP/DT→CT 粗化受限。
- 同文件 boundOutstanding 与 `docs/mailbox-sync-chain-model/mailbox-sync-chain-model.tex:1839–1870`：当前有容量粗化，无 profile/cost粗化/一般重排。
- 设计文档 `:1532` 明确候选选择启发式、共享MAIL成本不可直接逐点相加，不保证全局成本最优。

<a id="sync-loop"></a>
## Epoch、周期阶梯与 seed/drain

- `docs/mailbox-sync-chain-model/mailbox-sync-chain-model.tex:598–687`：n/k 周期配对、seed、周期展开。
- `test/ZeusV3Backend/Unit/Transforms/inject_sync_staircase_loop.mlir:1–95`：PE→VP 本轮 RAW、VP→PE 跨轮 WAR、retirement self-edge；展示入口 seed、出口 drain。
- `StaircasePlanning.cpp`：两周期展开、wrap、loop equalization。每条退出边按剩余势能处理；教学2轮例只表达所有权，不宣称所有循环均1seed/1drain。

<a id="sync-region"></a>
## 分支、区域树、嵌套吸收与支持范围

- `include/triton-shared/Dialect/ZeusLow/Transforms/InjectSync/RegionTree.h`：RegionKind=Seq/If/Loop；`Staircase/RegionTree.cpp:440` buildRegionTree。
- `docs/mailbox-sync-chain-model/mailbox-sync-chain-model.tex:897–1541`：势能、区域树、穿越与吸收、均衡、统一算法。
- `StaircasePlanning.cpp:900–921`：buildRegionTree → collectPoints → planRegion → equalizeLoops。
- `include/triton-shared/Dialect/ZeusLow/Transforms/Passes.td:131–132` 默认 staircase；`InjectSync/Planning.cpp:28` parser 与 `InjectSyncPass.cpp:214–223` 只接受 staircase/legacy。两个 driver 的 CLI 帮助文字仍残留 auto/fallback，不能以此认定存在自动回退。
- `test/ZeusV3Backend/Unit/Transforms/inject_sync_staircase_unsupported.mlir`：canonical exit 外的手写 early return fixture 明确失败，并可显式选择 legacy。不能把设计提出的任意CFG目标写成当前全部支持。

<a id="sync-verification"></a>
## 证明边界与反例

- `Staircase/StaircaseVerification.cpp:18–72` obligation coverage；`:180–231` 站点语义检查；`:236–394` frozen sites/lifecycle/schedule及重建检查。
- `Staircase/StaircaseCreditPolicy.cpp:110–146` 有 OPEN 注释：仅“未越过owner回边”不足以独立证明首epoch空依赖；零轮吸收仍依赖注册transfer。
- `test/ZeusV3Backend/Unit/Transforms/inject_sync_staircase_placement_negatives.mlir:1–22` **主动记录未闭合缺口**：loop-carried placement mutation可能仅由rebuild漂移拒绝，非完整的epoch时序语义检查。
- `docs/mailbox-sync-chain-model/mailbox-sync-chain-model.tex:1680–1758,1839–1870`：C1/C2/C3、identity verifier与边界；生产C3依构造与容量，未独立实现一般事件图；toy枚举checker不等于生产完整形式化验证。
- 源码测试中的“应拒绝”是已存在断言，不是本轮执行结果。

<a id="sync-ra"></a>
## InjectSync 与 RA 的合同

- `InjectSyncPass.cpp:108–158`：分配mode预测、initial unit计数和属性合同。
- `lib/Target/ZeusV3/CodeGen/CodeGenPass.cpp:99–190`：readInjectSyncBRegAllocationContract、verifyInjectSyncBRegAllocationContractAfterRA，核对requested mode、predictedInitialUnits不小于actual、lifetime reuse已经被建模。
- 该合同解释为何同步虽晚但仍在RA前；不表示该模式替所有寄存器和所有物理别名提供通用保证。

<a id="sync-history"></a>
## Git 可核实的演进

以下均从当前仓库 `git log` 核对到存在的提交（日期是提交显示日期，不是会议日期或个人贡献证明）：

| commit | 日期 | 主题 |
| --- | --- | --- |
| `b7e0b7052de7149a29cf69c8ce426e071186e964` | 2026-03-13 | 4-phase sync analysis with cross-iter WAR and conditional branch deadlock fix |
| `577c228fccc2672612b668c2f78a37ecda31591e` | 2026-07-08 | introduce dependency graph ledger |
| `42323bd9b5978e3758540694b95765f0b9b71584` | 2026-07-30 | enforce canonical mailbox dependency model |
| `5a4a253fc67bd39cc11aeb2d96809defadb58b38` | 2026-09-10 | add staircase physical mailbox planner |
| `4b01627fb62f8c8b6ca35b20e51b3637309247cb` | 2026-10-12 | index immutable topology queries per analysis scope |
| `b34bea0972ab9f1b0c24d6d710f821635a44c0e7` | 2026-10-13 | parallelize collectors and verifiers with indexed CFG facts |

不引用旧文档中的具体性能和“全部通过”作为当前版本结果；本页只展示问题/职责如何重划分。

<a id="sync-debug"></a>
## 分层排障入口

`docs/vcs_debug/inject-sync-debug-manual.md`：先辨认planner，staircase看staircase-plan；effect、candidate/admission、physical-mailbox-schedule、final-token-provenance、token balance依次定位。旧Phase 1/2/3/4段说明legacy，不替代当前默认staircase的结构解释。

<a id="sync-isa"></a>
## ISA 取舍与 GPU 对照

- `docs/mailbox-sync-chain-model/mailbox-sync-chain-model.tex:1907–2031` 讨论多channel与单元拥有的统一channel。本文的“增加独立channel”“带身份/世代completion object”“更强硬件跟踪”均为架构分析假设，不声称已实现或已有测量收益。
- NVIDIA 官方 [Nsight Compute Profiling Guide](https://docs.nvidia.com/nsight-compute/ProfilingGuide/index.html) 的 long/short scoreboard stall，以及 [Nsight Compute Dependencies](https://docs.nvidia.com/nsight-compute/NsightCompute/) 支持“GPU也有指令依赖跟踪”的职责对照。
- NVIDIA 官方 [Asynchronous Barriers](https://docs.nvidia.com/cuda/cuda-programming-guide/04-special-topics/async-barriers.html) 与 [PTX ISA](https://docs.nvidia.com/cuda/parallel-thread-execution/index.html)，2026-10-26查阅。只据此说明CUDA仍有显式异步同步与phase合同，不以CUDA API直接等同Zeus mailbox，也不推断所有GPU细节。

## 文件 SHA256

以下 hash 固定本轮读取的文件内容。源码与设计文档不打包进公开 HTML；精确 LaTeX/PDF 路径仅在此证据页列出，正文只引用设计名称与证据锚点。

| 相对路径 | SHA256 |
| --- | --- |
| `docs/mailbox-sync-chain-model/mailbox-sync-chain-model.tex` | `36b447ca0aa5d1b709bd044a0e7da0f00ea894ece536db9fc181d0b87966b462` |
| `docs/mailbox-sync-chain-model/mailbox-sync-chain-model.pdf` | `06394d9f0f09c133784942cf22d36e2ee4241182d9cf59d4bad21f72bc5a4247` |
| `docs/ZeusLow_Inject_Sync_Pass.md` | `f8c98c909ffbe51c44a8e2cc885f28817171581a4b9566fc8f360721263bed05` |
| `docs/vcs_debug/rtl-instruction-dependency-model.md` | `1658b2cc611ec12fc93131ce0cc269fb7312e404bed48855a046189a3e2e7517` |
| `docs/vcs_debug/inject-sync-debug-manual.md` | `227c13de48376211ec437dc86b6ff6b06daf6b17711e644a062cd744af59bf6d` |
| `lib/Dialect/ZeusLow/Transforms/InjectSyncPass.cpp` | `81d5c8f142030a530cb98591182249106731a3741c56dc67823bd100e2112854` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Effects.cpp` | `c882f0e93cb14a6bede02973ee47da4db7c42f72681059e5820146e1acc2ff33` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/EffectBuilder.cpp` | `87e4626d8ee172e73ee228b0656866a4fb2810b2474f2714ced315f09d31ce95` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Resources.cpp` | `89c158d972eb5e5bf471c61ea967ea3c2bd559d4134da78411b9d4c6c31bda1d` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Planning.cpp` | `ad344ca15e5926c77b049fde6a9b2e91720ad492b52163b25609072af174f249` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/ModelBuilder.cpp` | `894230cb2c2fdba49e68879670ad87d6dad57a17ea1c268174541ec40b086836` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Lowering.cpp` | `e615a53df822ae62e5c0c4637102c419bb7f068e7bd7519d858bf1fa8b6208e8` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Verification.cpp` | `99589384aa1ce9912299bb046f403131b791737ad9edf7a3d5aa1e7ac0869936` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Ledger.cpp` | `19e67429db53786c062b76f329e787c8e15994dca913970171c2c96b34f5768d` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Staircase/RegionTree.cpp` | `9038b8939d1d47b70e0abc77f050e9d1812878a2be77f2c066b2cb40954bd8eb` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Staircase/StaircasePlanning.cpp` | `054ff07f8a2c408c1c25f9fcac99ba7488bf6d9496fe6cbd952068fe04a57400` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Staircase/StaircaseVerification.cpp` | `d4b72550f05326dfbb4a21b5b53bc152ac1692f0c66effaf3ce9c3cf3a643bd0` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Staircase/StaircaseCreditPolicy.cpp` | `16501d11ef98d5c56c09b9e58709ee2787dc19ddbb1c47638c1457afa1118c55` |
| `include/triton-shared/Dialect/ZeusLow/Transforms/InjectSync/Resources.h` | `344b250b50a9ee5fe06d0269630d2d803d0ef282b218ab3a4043912d7019c1a0` |
| `include/triton-shared/Dialect/ZeusLow/Transforms/InjectSync/Model.h` | `fdbb28015b88f0d1d8b91d78aa4cfaefc251b284a21319d13e6ed418ea7e92f7` |
| `include/triton-shared/Dialect/ZeusLow/Transforms/InjectSync/Planning.h` | `15e9fe5ba7a6dcbace52b735af66cb0e2f398f580162ec4b3f0690eb9acc3224` |
| `include/triton-shared/Dialect/ZeusLow/Transforms/Passes.td` | `f2b9002b89fb432d43ddbafe6e47ef4738bd077cfc45717758b3205d0a9fbbb5` |
| `tools/zeus-compiler/zeus-compiler.cpp` | `91fc3b1bbff0c02c97bea622ab2c0c104ed9cccb21a6e88e0513fc745ed55020` |
| `tools/zeusv3-backend/zeusv3-backend.cpp` | `5da639aa4ed4af24979d27bb74a6464359fd1b8142d4dd1f6037bcf11827f75a` |
| `lib/Target/ZeusV3/CodeGen/CodeGenPass.cpp` | `5349d05c30e995814fb9de17e9764cfd0ddf06a6a43718b97a0cf83c73ba1817` |
| `lib/Dialect/ZeusHigh/Transforms/AddressAllocation.cpp` | `4c6485f82b7420062ba389f056c3389a46eb66d625aa7ab3176a104e109cf05f` |
| `test/ZeusV3Backend/Unit/Transforms/inject_sync_staircase_linear.mlir` | `dc3ef7cc59dd7fe498d0d21d688cdcfb25d0abfbacce63e3b186a71688beaa20` |
| `test/ZeusV3Backend/Unit/Transforms/inject_sync_staircase_loop.mlir` | `c84b14916ebeb588c3701f9467799363c71d8b11b7adc3ada0670284297f681c` |
| `test/ZeusV3Backend/Unit/Transforms/inject_sync_staircase_placement_negatives.mlir` | `3c7d6ec7e10779d588359596921a0b585620014217a98674a92047d5ed71b25b` |
| `test/ZeusV3Backend/Unit/Transforms/inject_sync_staircase_unsupported.mlir` | `546d0048a32778061c98650b337115684deccdf925fb5389424ea5ec8fbdec32` |
| `test/ZeusV3Backend/Unit/Transforms/inject_sync_instruction_semantics_registry.mlir` | `fd966e66e4fd3097d6ff7f3aeaffdb1cc5d57c081a60a6cc690c0b96778b183e` |

复审补充：历史清单日期统一按 AuthorDate；b7e0b7052 的 CommitDate 为 2026-03-14，4b01627fb 为 2026-10-13。crossing 回归在 admission 已合并依赖，仅证明最终 token 结果；四点 suffix-min 为独立教学推导。
