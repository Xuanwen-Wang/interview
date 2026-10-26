# InjectSync 工程源码复核：硬件合同、准入、计划与验证

采集日期：2026-10-26。仓库：`triton_shared`。HEAD：`82613bc2eb30feb9ef7f57aef20584df0ef9e28a`。

本记录补充 [同步长文来源记录](sync-lowering.md)，只记本轮实际核对的工程路径。业务仓库只读，未构建工具链，未运行 compiler/lit、模型、功能仿真、CycleSim、VCS/RTL、实板或性能 A/B。本文所称测试均为“存在的 fixture 与断言意图”，不是本轮运行通过。硬件事实依据仓库维护的 RTL 依赖模型及其源码引用，本轮没有逐个重新打开被引用的 RTL 文件。

业务仓库整体有无关已修改文件和未跟踪研究材料；本记录末尾列出的被引用文件单独检查为无相关未提交改动。不能把整体工作区称为 clean，也不把无关改动归给此 HEAD。下面的文件 hash 固定具体阅读内容。

## 1. 当前入口与阶段职责

| 结论 | 当前源码位置 | 教学边界 |
| --- | --- | --- |
| 独立 backend 在 descriptor/lane/CFG 确定后调用 InjectSync，随后进入 CodeGen | `tools/zeusv3-backend/zeusv3-backend.cpp:315–374` | BR 优化和 scalar divide scheduling 受开关控制，不能说所有编译必经 |
| 统一 compiler 有相同职责顺序 | `tools/zeus-compiler/zeus-compiler.cpp:948–1013` | 两个入口要一起核对，不能只读旧 pipeline 文档 |
| 完整 backend 默认 strict no-fallback；exhaustive reference oracle 是单独显式开关 | `tools/zeusv3-backend/zeusv3-backend.cpp:110–121` | 裸 pass 的单测默认值不等于生产 driver |
| parser 只接受 staircase/legacy；默认 staircase | `InjectSyncPass.cpp:214–223`；`Passes.td:131–132`；`InjectSync/Planning.cpp:28` 起 | 无自动 fallback。个别注释、旧 CLI 文案仍含历史 auto，不能据此解释现行行为 |
| 先建 canonical model，再校验、唯一物化、检查 final provenance 与 balance | `lib/Dialect/ZeusLow/Transforms/InjectSyncPass.cpp:238–425` | pre-analysis 的 CFG normalization 是显式步骤；“冻结后才变异”指物理同步规划/物化边界，不是说 pass 入口起绝不改 CFG |
| 全 module 验证 multi-latch normalization recipe 后才修改 CFG | `InjectSync/ModelBuilder.cpp:97–217` | staircase 归一化所有多 latch；legacy 按实际 lifecycle 需求，不能混成一个策略 |
| staircase 复用 logic hazard/admission，但独立构造 physical plan | `InjectSync/ModelBuilder.cpp:248–356` | Phase 1–4 作为范围/历史术语仍存在；默认路径并非依次运行四套 legacy placement |

表内简写 `InjectSync/` 指 `lib/Dialect/ZeusLow/Transforms/InjectSync/`；`Passes.td` 指 `include/triton-shared/Dialect/ZeusLow/Transforms/Passes.td`。正文保留完整模块入口，避免要求读者记路径缩写。

## 2. effect/resource：先把硬件事实说对

- `include/triton-shared/Dialect/ZeusLow/Transforms/InjectSync/Model.h:133–165`：访问记录保留 resource、物理 L2 provenance/role/footprint；InstructionEffect 保留 unit、profile、mail capability、read/write 集合及访问来源。
- `InjectSync/Effects.cpp` 的 InstructionSemantics registry 为统一指令语义入口；未知或不一致的 op 必须显式诊断，不能由某个 planner 私有推断。
- `InjectSync/EffectBuilder.cpp:578–590`：PE 的数据输入只取 srcA/srcB；VP 由 `vpComputeReadsDst` 判断 destination RMW read。`:1240–1249` 则让 PE/VP 都 snapshot dst BR。二者合读证明“dst descriptor read”与“dst data read”不同。
- `docs/vcs_debug/rtl-instruction-dependency-model.md:772–792`：PE 在 OL1 累加，L2 destination 只写。DT/VP/LD 初始化 writer 与 PE writer 的顺序由 WAW 处理，不能继承旧“PE 读 dst accumulator”的解释。
- 同文 §6.2 与 effect 规则：DMAStore 读源 L2、写目标 GDG；目标 BR snapshot 不是 GDG 数据 read，不应凭空建 ST→ST RAW。
- `InjectSync/Resources.cpp:76–85`：正长度 L2Region 采用半开区间相交；`:70–74` 饱和计算末端。动态地址通过保守资源建模，不由零长度区间伪造无冲突。
- `InjectSync/Resources.cpp:96–113,205–218`：DMA 窗口与基址 alias 分类分开；不完整或不可比较的窗口继续保守。`:1465–1500` 区分 may-conflict 与 coverage，`L2MayAlias` 相等不能证明写覆盖，区间包含也不等于该指令完整定义了所有字节。

正文中的 `[4096,5120)` 与 `[4608,5632)` 是明确的教学区间，不来自业务分配或性能数据。

## 3. RTL 依赖模型的关键时刻

`docs/vcs_debug/rtl-instruction-dependency-model.md:184–204` 区分 dispatch、snapshot、queue resident、issue/checkout、internal start、done/response、mail visible。依赖保护 ConfigBeforeSnapshot、SnapshotBeforeRewrite、ReleaseBeforeIssue、ReadBeforeOverwrite、ReleaseOrder 中的哪一个关系，决定可用证明。

| 合同 | 依据 | 不应泛化的结论 |
| --- | --- | --- |
| inbox 对每个 sender 维护 6-bit counter，不带 producer/resource identity | RTL 模型 `:294–325` | 编译器的 credit FIFO/provenance 不是硬件存储 tag |
| recv 在 queue issue checkout，普通 op 的 send 经 done/outbox 才可见 | RTL 模型 `:327–350` | 入队或 accept 不等于完成 |
| 已证明单元的 standalone MAIL 不能越过此前 normal outbox entry | RTL 模型 `:335–350,950–968` | 不能证明 MAIL 之后的 command 或尚未进入此前序列的 group tail |
| SI match-fail/info-only 路径可能有 done 而无 modeled local L2 write | RTL 模型 `:352–359` | 当前 helper 不把 SI 用作通用 ordered normal+MAIL completion fence |
| PE 同 core L2 WAW 可用 segment 写顺序证明 | RTL 模型 `:736–770` | 不能扩大为 PE RAW/WAR 或“response 先于后条 issue” |
| CT blocking L2 指令可阻止后续 dispatch | `InjectSync/Resources.cpp:1365–1380`；RTL 模型 §0.3 | 仅适用 registry 的 BlocksGlobalDispatch 与对应 L2 资源，方向不能反过来用于 backend→CT |
| VP lane 内写回退休资源与后续 BR reuse 有关 | RTL 模型 `:999–1030` | 不按 basic block 清空；不因为逻辑 out-of-place 就忽略实际复用 |

## 4. typed admission 与循环归属

- `Planning.h:32–49`：disposition 为 Lower、CoveredBy、NoMailProof、OutOfScope、Unsupported；proof kind 区分 CompletionTiming、ReadBeforeOverwrite、ReleaseOrder、IssueOrdering、SnapshotOrdering、ResourceDisjoint、ControlFlowExclusion。
- `InjectSync/Admission.cpp:397–427`：BR/front-end config 用 SnapshotOrdering；VP 参数装载的特定同 lane RAW 用 IssueOrdering；已确认 barrier 用 CompletionTiming。这些不能压成一个 generic “safe” 布尔值。
- `InjectSync/Admission.cpp:439–447`：CT L2 completion 与 FReg snapshot 分别返回不同证明类型。配置顺序不能覆盖同 operation pair 上另一条 data completion obligation。
- `InjectSync/ModelBuilder.cpp:295–356`：Phase 4 admission 保留 owner-loop 逻辑义务后加入共享 graph；staircase 再按 region tree 构造自己的 schedule。
- `test/ZeusV3Backend/Unit/Transforms/inject_sync_staircase_branch_header_waw.mlir:1–18`：staircase 保留无单一 body successor 的 WAW obligation；legacy 仍明确拒绝 `no-single-body-entry`。不能用旧 placement 要求提前删除新 planner 能表示的逻辑边。

`Planning.h` 指 `include/triton-shared/Dialect/ZeusLow/Transforms/InjectSync/Planning.h`。

## 5. PhysicalMailboxSchedule 与唯一 materializer

`Planning.h:565–727` 提供 token、obligation、event、command、credit class/transfer、CFG edge/loop site 与 channel group。关键区分：

1. obligation 表达原依赖，token 是承载一组义务的逻辑 credit lifecycle，event 表达 send/checkout 的时刻与频率，command 表达具体 piggyback 或 standalone 指令。
2. channel group 是身份分桶，不从 token ID 推导 FIFO 顺序。
3. event 的 `equalization` 与频率分离：loop entry 的 acquire 可能是数据义务，不能当作可消费任意旧 credit 的 drain。
4. materialization ownership 冻结在 token 中。下游只消费 schedule，不重新发现 hazard 或重新打开 legacy placement。
5. 同一 CFG edge 可能服务多个 loop；edge/loop site 先冻结，物化先统一建立拓扑，再发射事件。

`InjectSync/Lowering.cpp:194–241` 从 schedule event 建 standalone MailOp 并登记 provenance；`:357–385` 处理 piggyback 并拒绝重复 peer bit。bitmask 中相同 bit 不能表示“两枚 token”。

`InjectSync/Verification.cpp:1673–2026` 检查 planned occupancy、下溢、逐 token 上界、channel 容量与 return-empty；`:2075–3368` 是真实 FIFO credit 验证；`:7890–8171` 为 final provenance / 最终事件核对的重要入口。最终 IR 必须与已冻结事件双向对应；有 origin 还不够，所取 credit 必须覆盖当前义务。

`InjectSync/Staircase/StaircasePlanning.cpp:592–608`：counter 容量 63，规划预算取容量减一（62），为可能共享一个 multi-source recv mask 的情况保留余量；capacity coarsening 有受限 channel，不能当作通用任意合并。不能引用该段关于真实 occupancy 的注释作为本轮测量。

## 6. RA/CodeGen 合同

- `InjectSyncPass.cpp:117–159`：保守预测 initial BReg allocation units，按共同决策记录 requested/effective/reason/capacity，并在可能 lifetime reuse 时设置模型标记。
- `lib/Target/ZeusV3/CodeGen/CodeGenPass.cpp:99–167`：核对字段完整、mode 一致与决策自洽。
- 同文件 `:169–191`：RA 后要求预测不低于真实 initial allocation units；真实 lifetime reuse 必须已经被 InjectSync retirement modeling 覆盖。
- `inject_sync_vp_data_output_retirement.mlir:1–18` 展示 lifetime-reuse、append-only 与 capacity fallback 的不同断言。这里的 32 BR 是该目标合同的容量；不应推广成所有 NPU 的参数。

此合同与 L2 AddressAllocation 不是同一件事，也不替代所有寄存器分配、spill 或物理 alias 的正确性验证。

## 7. 验证入口与已知独立证明边界

| 入口 | 本轮实际核对的意图 |
| --- | --- |
| `inject_sync_instruction_semantics_registry.mlir:1–10` | profile、mail capability、配置字段与数据资源方向 |
| `inject_sync_dynamic_l2_may_alias.mlir:1–18` | 不同 SSA 动态地址仍 may-alias；legacy layout 与默认语义检查分开 |
| `inject_sync_staircase_linear.mlir:1–18` | 保持数量/identity 的 early-send、late-recv、swap-sends 变异要被语义检查拒绝 |
| `inject_sync_staircase_branch_header_waw.mlir:1–18` | 默认/staircase obligation 与 legacy 不支持边界分别检查 |
| `inject_sync_parallel_vp_cross_lane_dependency_invalid.mlir:1–16` | topology 标记不能消除真实跨 lane 依赖 |
| `inject_sync_vp_data_output_retirement.mlir:1–18` | RA reuse policy 的退休边界 |
| `inject_sync_staircase_placement_negatives.mlir:1–18` | loop-carried mutation 目前部分只由 rebuild drift 拒绝，不能称独立 epoch 语义已闭合 |
| `test.sh:560–610` | staircase prepasses、按 gate 精确 expected-failure marker、unexpected-pass 同样失败 |

fixture 路径均位于 `test/ZeusV3Backend/Unit/Transforms/`。`bash test.sh`、`bash test.sh --inject-sync-gates` 是实际存在的入口，本轮未运行。适当的业务验收还需要原始业务 TTIR、工具链/flags/binary/input provenance，不应只测最小 fixture。

`InjectSync/Staircase/StaircaseVerification.cpp:154–231` 的 loop-carried 时序边界、`StaircaseCreditPolicy.cpp:110–146` 的 OPEN 注释，以及上述 placement fixture 一起支持“有多层验证但独立证明仍有缺口”。确定性重建只证明 schedule 与构造一致，不排除构造和重建共享的错误。设计文档的 C3 一般事件图也不能写成生产已完整实现的形式化 deadlock-freedom verifier。

## 8. 编译开销与独立性

- `InjectSync/ImmutableTopologyQueries.h:18–119`：在固定 CFG/loop policy 下缓存 block pair、operation order 与 dominance 查询。IR 变异后重建，独立 oracle/verifier 不借 planner 的 verdict。
- `InjectSync/VerifierVPCompletionCandidates.h:12–62`：按 stage/token ID 缩小候选，不认证 coverage；调用者仍核对完整 lane/frontier/owner/channel/event 生命周期。
- `docs/ZeusLow_Inject_Sync_Pass.md:3096–3208` 记载完整 resource identity、集合表示与查询边界；真实稠密冲突仍可能二次，不能从一个局部索引的复杂度推出整个 pass 线性。

本轮没有编译耗时比较，不把源码注释中的历史耗时写成当前测试结果。

## 9. 交付审查

- 技术正确性：新增说明逐项绑定上述源码与维护中的 RTL 合同；保留默认 planner、typed proof、epoch 与验证层级边界。
- 初学者可理解性：新增内容从具体 op/资源/冲突进入 enum 与数据结构；数据读与描述符读、配置顺序与数据完成、逻辑 token 与硬件 counter 分开。
- 视觉可用性：本工作只产出待集成 HTML section 与证据；未运行浏览器、移动/打印或离线验收，交由主任务集成后执行。未新增图形。
- 本轮没有提交、推送、发布或修改业务源码。

## 引用文件 SHA256

以下列表由本轮实际读取文件计算，同时核对逐文件 Git 状态；hash 不代表执行测试或 RTL 验收。

| 仓库内路径 | SHA256 |
| --- | --- |
| `docs/ZeusLow_Inject_Sync_Pass.md` | `f8c98c909ffbe51c44a8e2cc885f28817171581a4b9566fc8f360721263bed05` |
| `docs/vcs_debug/rtl-instruction-dependency-model.md` | `1658b2cc611ec12fc93131ce0cc269fb7312e404bed48855a046189a3e2e7517` |
| `docs/vcs_debug/inject-sync-debug-manual.md` | `227c13de48376211ec437dc86b6ff6b06daf6b17711e644a062cd744af59bf6d` |
| `.claude/rules/inject-sync-rules.md` | `9e4549bae0a5b82fdd578c9cd54b129aab7d78af97f620325658c76e251a6820` |
| `lib/Dialect/ZeusLow/Transforms/InjectSyncPass.cpp` | `81d5c8f142030a530cb98591182249106731a3741c56dc67823bd100e2112854` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/ModelBuilder.cpp` | `894230cb2c2fdba49e68879670ad87d6dad57a17ea1c268174541ec40b086836` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Effects.cpp` | `c882f0e93cb14a6bede02973ee47da4db7c42f72681059e5820146e1acc2ff33` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/EffectBuilder.cpp` | `87e4626d8ee172e73ee228b0656866a4fb2810b2474f2714ced315f09d31ce95` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Resources.cpp` | `89c158d972eb5e5bf471c61ea967ea3c2bd559d4134da78411b9d4c6c31bda1d` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Admission.cpp` | `ccf04be745bc5a847034baa148eaa7045b28471677dbae4fb73d4bd0280adcf1` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Planning.cpp` | `ad344ca15e5926c77b049fde6a9b2e91720ad492b52163b25609072af174f249` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Lowering.cpp` | `e615a53df822ae62e5c0c4637102c419bb7f068e7bd7519d858bf1fa8b6208e8` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Verification.cpp` | `99589384aa1ce9912299bb046f403131b791737ad9edf7a3d5aa1e7ac0869936` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/ImmutableTopologyQueries.h` | `2e5de9c849ce8cf129707a127079788ad3d7a665ac8904c8f4d6d247b2a63dfd` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/VerifierVPCompletionCandidates.h` | `238fec931bf625d325fd37fd63f194003125437d327940edf49f1684d9823b37` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Staircase/StaircasePlanning.cpp` | `054ff07f8a2c408c1c25f9fcac99ba7488bf6d9496fe6cbd952068fe04a57400` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Staircase/StaircaseVerification.cpp` | `d4b72550f05326dfbb4a21b5b53bc152ac1692f0c66effaf3ce9c3cf3a643bd0` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Staircase/StaircaseCreditPolicy.cpp` | `16501d11ef98d5c56c09b9e58709ee2787dc19ddbb1c47638c1457afa1118c55` |
| `include/triton-shared/Dialect/ZeusLow/Transforms/InjectSync/Model.h` | `fdbb28015b88f0d1d8b91d78aa4cfaefc251b284a21319d13e6ed418ea7e92f7` |
| `include/triton-shared/Dialect/ZeusLow/Transforms/InjectSync/Planning.h` | `15e9fe5ba7a6dcbace52b735af66cb0e2f398f580162ec4b3f0690eb9acc3224` |
| `include/triton-shared/Dialect/ZeusLow/Transforms/Passes.td` | `f2b9002b89fb432d43ddbafe6e47ef4738bd077cfc45717758b3205d0a9fbbb5` |
| `lib/Target/ZeusV3/CodeGen/CodeGenPass.cpp` | `5349d05c30e995814fb9de17e9764cfd0ddf06a6a43718b97a0cf83c73ba1817` |
| `tools/zeus-compiler/zeus-compiler.cpp` | `91fc3b1bbff0c02c97bea622ab2c0c104ed9cccb21a6e88e0513fc745ed55020` |
| `tools/zeusv3-backend/zeusv3-backend.cpp` | `5da639aa4ed4af24979d27bb74a6464359fd1b8142d4dd1f6037bcf11827f75a` |
| `test.sh` | `6b5f567873a4decdbe5b4225ca11518667ed5e3dcbfdb64932e9e8d783141f26` |
| `test/ZeusV3Backend/Unit/Transforms/inject_sync_instruction_semantics_registry.mlir` | `fd966e66e4fd3097d6ff7f3aeaffdb1cc5d57c081a60a6cc690c0b96778b183e` |
| `test/ZeusV3Backend/Unit/Transforms/inject_sync_dynamic_l2_may_alias.mlir` | `ca6e9a92381d05d2570e4ec1d4c0495842748e559245f7e3fafe9fd16422fe37` |
| `test/ZeusV3Backend/Unit/Transforms/inject_sync_staircase_linear.mlir` | `dc3ef7cc59dd7fe498d0d21d688cdcfb25d0abfbacce63e3b186a71688beaa20` |
| `test/ZeusV3Backend/Unit/Transforms/inject_sync_staircase_branch_header_waw.mlir` | `8005439710a35f6d37dafb2db5b6c6c01c01442abe04e25dbf90ce350baf615c` |
| `test/ZeusV3Backend/Unit/Transforms/inject_sync_parallel_vp_cross_lane_dependency_invalid.mlir` | `dba951553136e48839615728be46f3fb47b0406a81890cfddde5aaed9cd9ad55` |
| `test/ZeusV3Backend/Unit/Transforms/inject_sync_vp_data_output_retirement.mlir` | `fe9d13b760571f16449f633cbfc138179564d61ddd342d528c3e1928b9339dc9` |
| `test/ZeusV3Backend/Unit/Transforms/inject_sync_staircase_placement_negatives.mlir` | `3c7d6ec7e10779d588359596921a0b585620014217a98674a92047d5ed71b25b` |
