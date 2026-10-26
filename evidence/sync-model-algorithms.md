# 建模与算法口述复核

采集日期：2026-10-26。只读审查，没有改业务源码、构建、运行 compiler 或仿真实验。

- 指南基线：`interview`，HEAD `1cb583097c76ad983a5885ce796b6f5aacbf0f26`。任务开始时工作区干净；主任务后续可能同步编辑，不将那些改动作为本审查基线。
- 业务源码：`triton_shared`，HEAD `82613bc2eb30feb9ef7f57aef20584df0ef9e28a`。引用路径逐文件 `git status --porcelain` 为空；整体仓库有其它无关改动。
- 已复用本任务此前阅读的 AGENTS/CLAUDE 与 InjectSync 专项规则，并再次读取 CLAUDE、专项规则的相关模型合同；业务代码只读。
- 产物：`model-algorithm-section.json`，单个 section，ID `modeling-algorithms`，约 1331 个汉字。建议置于 `admission-source-walk` 之后、`points` 之前，先把前端建模与物理规划边界讲清。

## 一、对“沿既定程序顺序维护访问前沿”的判断

这句话有局部依据，但不能作为整个 InjectSync 的唯一算法描述。

1. 同 block RAW：`lib/Dialect/ZeusLow/Transforms/InjectSync/LinearPlanning.cpp:1559–1612` 确实按 block 原始 operation 顺序向前扫，保存 `previousEffects`；对当前 consumer 扫历史 effect，找 syncable conflict witness，再按 producer execution unit 选择最新相关 producer，使用 channel 上已经覆盖的 producer 过滤冗余。它不是简单的 `resource -> lastWriter` 表，也不是每次遇 writer 就无条件覆盖一个全局 reaching state。
2. 同 block WAR：同文件 `:3285–3326` 保存 `activeReaders`，遍历后续 writer 时查询读写冲突，保留 logical edge；同文件 `:3506–3539` 再处理 RAW 对 WAR 的覆盖、ordered WAR、release-order/WAW。不能用一个 latest-writer 解释全部三类 hazard。
3. 候选账本还存在 pair collection：`Admission.cpp:3157–3203` 按同 block 前后 effect pair 枚举 RAW/WAR conflict witness。不能把 production graph 所有来源都说成稀疏前沿扫描。
4. 跨 block：`Admission.cpp:3414–3493` 的 `CrossBlockAccessIndex` 按 Value alias、resource kind、DMA class、L2 静态地址/区间和 may-alias 域标记候选；`:4543–4587,4734–5014` 再结合 CFG、barrier、typed admission、reaching writer 和 completion-carrier proof。索引是候选过滤，不直接证明依赖成立或可删。
5. loop：`Admission.cpp:896–985` 与 `ModelBuilder.cpp:295–306` 保留 owner、循环资源与跨迭代义务。block 列表顺序不是动态先后，嵌套 loop 的每次执行不等于 outer loop 的一次 epoch。

建议口述改成：

> 我先把每条低层指令的真实读写投影成带身份和时刻的资源效果。对同块用顺序扫描与已证明的前沿覆盖，对跨块用资源候选索引加 CFG/循环关系收集 hazard，再给每条关系记录 Lower、CoveredBy 或 typed NoMailProof。真正需要显式同步的义务才投影到默认 staircase，按区域和通道构造收发同序的协议。这里没有重新调度原始指令。

## 二、ResourceAccessKey 不是当前源码类型

本轮在当前业务树的 `.h/.cpp/.md` 中检索 `ResourceAccessKey` 无命中；它不能作为已实现类名写入正文。

当前真实结构：

- `include/triton-shared/Dialect/ZeusLow/Transforms/InjectSync/Model.h:133–165`：`DependencyAccess` 与 `InstructionEffect`。
- `include/triton-shared/Dialect/ZeusLow/Transforms/InjectSync/Resources.h:130–140,277–292`：`DependencyResource` 与 `identity()`。完整 identity 为 kind、Value、id、instanceId、sizeBytes、dmaBaseAliasClass、weightArrayIdentity、weightMayAliasTop；hash 与 equality 共用它。
- `lib/Dialect/ZeusLow/Transforms/InjectSync/Resources.cpp:1465–1500`：`dependencyResourcesMayConflict` 与 `classifyDependencyResourceCoverage` 是不同问题。不同 resource key 仍可能重叠；may-alias top 相等也不能证明写覆盖，静态分配范围包含不代表具体指令完整定义了内部字节。

如要使用“访问键”作为教学概念，应标记为教学归纳，不能与真实 type 名混淆。新 section 直接使用实际类型，避免不必要的别名。

## 三、确有拓扑算法，但并非依赖图重排全部指令

`Admission.cpp:3684–3759`：`Phase3ForwardReachabilityIndex` 去掉由 dominance 识别的 natural backedge，构造 CFG 拓扑序，反向以 bit vector 传播可达性；若剩余 graph 非可拓扑或查询端点不在索引内，退回原 `isStrictForwardReachable` 查询。`isReachable` 还有独立的 one-execution/loop-exit policy，不能把 strict relation 和较宽的动态关系混同。

这里的拓扑遍历是查询加速，不是把原始操作按 dependency DAG 重排。静态 loop 需要 owner 与 d=1；直接把含回边全程序称作普通 DAG、再 Kahn 排序发指令，会失真。

`docs/mailbox-sync-chain-model/mailbox-sync-chain-model.tex` 含一般调度/重排讨论。不能因为设计文档中出现 Kahn 或事件图，就声称默认 InjectSync 已执行该调度算法。当前默认 planner 的实现应以 `ModelBuilder.cpp:340–356` 与 `StaircasePlanning.cpp` 为准。

## 四、NoMailProof 到 Staircase 的真实边界

- `Planning.cpp:484–542`：candidate 与 admitted scope 共存；不是 graph 中每条边都送到物理规划。
- `ModelBuilder.cpp:248–272,295–315`：部分 front-end snapshot、presynced NoMail、completion carrier 等由集合化关系/合同持有，不一定显式展开每个 effect pair。因此“每个候选都先建一条完整 graph edge，再分类”的线性流程图只能视为逻辑职责，不是逐对象运行轨迹。
- `LinearPlanning.cpp:3564–3581`：生产 factored 模式在候选/history walk 前剥离由完整前端 snapshot 合同拥有的资源角色，保留原指令 timing ledger。这不是把义务忽略，而是换成共同合同表达。
- `Staircase/StaircasePlanning.cpp:77–172`：通过 `isAdmittedDependencyEdgeScope` 筛选数据边；managed group 归一为 tail/head；from/to 所属 region 求 LCA；loop-carried d=1 验证 owner；再求单元站点位置。此处也有 DMA read-batch 策略边与 core-sync 点，但它们明确不冒充 resource alias hazard。
- 同文件 `:442–530`：按 send 站点分桶，同 send 桶按 recv 降序稳定排序，逆序求 recv suffix minimum，合并同 suffix 为 latest send 的 token；循环两周期展开。不要把分桶这一局部解释成整体严格线性。
- 同文件 `:836–860`：loop seed/exit 均衡还有专门步骤。点构造完成并不等于 provenance、FIFO、容量与 epoch 的全部证明已闭合。

## 五、对指南 @1cb5830 正文的处理建议

本轮没有在基线正文找到 `ResourceAccessKey`、`访问前沿` 或“重新拓扑排序全部指令”的字样。因此这几项是对前轮口述/新拟稿的纠偏，不能声称现网页已经写错了这些具体句子。

1. `model-to-schedule` 的职责图与 `effect-source-walk`、`admission-source-walk` 基本正确，但缺“同 block/跨 block/loop 如何得到候选”的中间层。新增 `modeling-algorithms` 用一条 LD→PE→LD 教学链补齐，不另造算法名。
2. `admission-source-walk` 的逐边 enum 解释保留，但补充 factored contract/集合化关系是当前生产表示，免得读者误以为每对配置访问都实际分配一条图边。
3. `points` 以直线段的各单元指令序号作教学坐标成立；进入当前代码时要改称“区域内站点序号”，包含边界站点及 managed-group 投影，不全是原始指令下标。
4. `scalability-source-walk` 已正确保留不可变 scope、独立 verifier 与非全程线性边界；不需要为此次 QA 合并改写成通用图拓扑调度。
5. 旧 QA 09/10（点/手算）适合作为第二个主 QA 中的深入段落；旧 QA 04/07 与新增硬件/CUDA 对照归入第三个主 QA。旧 20 个锚点保留为兼容落点，不能因合并丢失深链接与熟练度状态语义。

## 文件 SHA256

以下为本轮确切引用文件；逐文件工作区无相关修改。hash 只固定阅读内容，不是测试通过证明。

| 仓库内路径 | SHA256 |
| --- | --- |
| `include/triton-shared/Dialect/ZeusLow/Transforms/InjectSync/Model.h` | `fdbb28015b88f0d1d8b91d78aa4cfaefc251b284a21319d13e6ed418ea7e92f7` |
| `include/triton-shared/Dialect/ZeusLow/Transforms/InjectSync/Resources.h` | `344b250b50a9ee5fe06d0269630d2d803d0ef282b218ab3a4043912d7019c1a0` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/EffectBuilder.cpp` | `87e4626d8ee172e73ee228b0656866a4fb2810b2474f2714ced315f09d31ce95` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Resources.cpp` | `89c158d972eb5e5bf471c61ea967ea3c2bd559d4134da78411b9d4c6c31bda1d` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Admission.cpp` | `ccf04be745bc5a847034baa148eaa7045b28471677dbae4fb73d4bd0280adcf1` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/LinearPlanning.cpp` | `e2f246861f7a1007a14162633f7211784cbec6a8b27f4da2b1d84b602743111d` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Planning.cpp` | `ad344ca15e5926c77b049fde6a9b2e91720ad492b52163b25609072af174f249` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/ModelBuilder.cpp` | `894230cb2c2fdba49e68879670ad87d6dad57a17ea1c268174541ec40b086836` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Staircase/StaircasePlanning.cpp` | `054ff07f8a2c408c1c25f9fcac99ba7488bf6d9496fe6cbd952068fe04a57400` |
| `docs/vcs_debug/rtl-instruction-dependency-model.md` | `1658b2cc611ec12fc93131ce0cc269fb7312e404bed48855a046189a3e2e7517` |
| `docs/mailbox-sync-chain-model/mailbox-sync-chain-model.tex` | `36b447ca0aa5d1b709bd044a0e7da0f00ea894ece536db9fc181d0b87966b462` |
