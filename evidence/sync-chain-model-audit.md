# 同步单调链模型：设计、当前实现与教学边界核对

采集日期：2026-10-26。对应页面：`sync.html` / chapter `compiler-sync`。

本记录核对已有设计文档、当前源码及其说明，并记录协调者运行的配套 Python 教学模型检查。未修改 `triton_shared`，未构建工具链，未执行 kernel、CycleSim、VCS/RTL 或设备测试。设计文档中的旧实验结果只作为历史材料，不作为本轮实测。

## 版本和材料

来源仓库：`triton_shared`，完整 HEAD 为 `82613bc2eb30feb9ef7f57aef20584df0ef9e28a`。仓库整体存在不相关工作区改动和未跟踪资料；本次下表所列文档及 `InjectSync/Staircase/` 引用文件的 `git status --short -- <paths>` 为空，读取内容与该 HEAD 一致。

`mailbox-sync-chain-model.tex` 共 2243 行，标题日期为 2026-09-11，正文开头限定实现/实验状态截至 2026-09-10；后文部分段落后来更新，因此不能把标题日期等同全部源码的冻结日期。现有 PDF 是 56 页、1,148,944 字节，元数据 CreationDate 为 2026-09-14。本文以本轮读取的 TeX 和 C++ 为主要引用；没有假定 PDF 与当前 TeX 逐字一致，没有复制 PDF 到公开产物。

| 文件（仓库相对路径） | SHA256 |
| --- | --- |
| `docs/mailbox-sync-chain-model/mailbox-sync-chain-model.tex` | `36b447ca0aa5d1b709bd044a0e7da0f00ea894ece536db9fc181d0b87966b462` |
| `docs/mailbox-sync-chain-model/mailbox-sync-chain-model.pdf` | `06394d9f0f09c133784942cf22d36e2ee4241182d9cf59d4bad21f72bc5a4247` |
| `docs/mailbox-sync-chain-model/mailbox-sync-chain-model-check.py` | `a26fd05a49055aba0d98ee596c30fb6cdd76878b28384869494b2c5c4e26baf7` |
| `docs/vcs_debug/rtl-instruction-dependency-model.md` | `1658b2cc611ec12fc93131ce0cc269fb7312e404bed48855a046189a3e2e7517` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Staircase/StaircasePlanning.cpp` | `054ff07f8a2c408c1c25f9fcac99ba7488bf6d9496fe6cbd952068fe04a57400` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Staircase/StaircaseCreditPolicy.cpp` | `16501d11ef98d5c56c09b9e58709ee2787dc19ddbb1c47638c1457afa1118c55` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Staircase/StaircaseVerification.cpp` | `d4b72550f05326dfbb4a21b5b53bc152ac1692f0c66effaf3ce9c3cf3a643bd0` |
| `lib/Dialect/ZeusLow/Transforms/InjectSync/Staircase/RegionTree.cpp` | `9038b8939d1d47b70e0abc77f050e9d1812878a2be77f2c066b2cb40954bd8eb` |

本轮开始时 `interview` 位于 `main`，HEAD `0c98c155f05b3ca9c2c3e98b9c378275abe4e037`，工作区有大量现有改动，`content/37-compiler-sync.json` 已存在但未跟踪。本子任务只新增本证据记录；正文由协调者统一集成，未覆盖既有工作。

## 核心推导及依据

| 教学结论 | 设计文档位置 | 当前实现位置 / 限制 |
| --- | --- | --- |
| dispatch、issue、done、release 不能合并为“完成” | TeX 168–297；RTL 模型 190–205 | ordered outbox 的顺序事实与数据效果事实分开；SI match-fail 的效果需要跨核合同 |
| 第 k 个 recv 只能用第 k 个已 release send 计数认证 | TeX 380–404 | 硬件不保存资源/token 身份；编译器身份只用于证明 |
| token `(s,r)` 覆盖 `(p,c)` 的条件是 `p≤s`、`r≤c` | TeX 299–404 | 依赖同发送单元 ordered release 与接收单元 issue order |
| 后缀最小值 + 相同 recv 保留最晚 send | TeX 444–524 | `StaircasePlanning.cpp:442–532`；同 send 桶内按 recv 降序，保证组内最早 recv 进入全部后缀 |
| 固定单元序的等待下界 | TeX 500–524、1528–1540 | 只比较直接 token、相同区域指派与站点序；无 hoist/粗化，忽略 MAIL 自身执行成本 |
| 支配合并保持覆盖但可能推迟前面的消费者 | TeX 525–596 | `boundOutstanding:592–694` 只做当前容量驱动的合并；不是完整 profile 成本优化 |
| 周期配对偏移 `ni+j=k+ni′+j′` | TeX 598–687 | `planStaircase:449–532` 展开两周期，取 period 0 的 send；`d∈{0,1}` |
| Φ 是程序序 send 减 recv，实际 B(t) 是 release 减 checkout | TeX 905–989、557–596 | 不从静态余额峰值推出硬件实时峰值；硬件反压负责物理上界 |
| C1 是选定综合范围的充分门禁，不是所有物理正确方案的必要条件 | TeX 990–1022 | 正确非 CT 队列等待可以出现虚拟负前缀；不能把当前 reject 等同理论无解 |
| 区域投影让两端保持同动态频率 | TeX 1023–1296 | `projectPoints`、`sinkIntoLoops`、区域站点；if 恒优先下沉，loop 结构启发式 |
| 父子各自配平仍可能被同 channel FIFO 偷走 credit | TeX 1297–1458 | `crossChildren` 后必须再次 `planStaircase`，再容量粗化，最终结算吸收 |
| k 槽吸收 e 个父 credit，出口留下最后 e 个槽 | TeX 1388–1458 | 入口槽 i 不等于出口槽 k−e+i；零轮保留来源集合，不把来源简化为单一 token |
| 每条 exit 单独补 drain/refill，零轮也有真实边界协议 | TeX 1459–1484 | `equalizeLoops:835–896`；与 toy 的零轮 schema 不完全一致 |
| C3 的一般事件图检查未完整实装 | TeX 722–896、1642–1679、1839–1870 | 当前依赖构造前向性和容量约束；不能宣称完整硬件死锁证明 |

## 原创教学等价式：消费者等待前沿

固定直线段、单 channel、两边 issue 顺序以及直接 token 模型，定义：

```text
F(j) = max({p | (p,c) 是输入依赖，c <= j} ∪ {0})
```

`F(j)` 是发送单元上的位置，而非时间。其等待下界是 `release(F(j))`。证明分两部分：

1. 必要性：任何 `c<=j` 对 p 的要求，结合 V issue 序，都会迫使 j 等到 p 的 release；取全部 p 的最大值。
2. 可达性：只在 F 严格增长的位置放 `(F(j),j)`，便同时满足全部依赖且不增加 F。

由 `(p,c)` 推出所有 `p′<=p,c′>=c` 的关系，可把闭包表示为消费者前沿。该式是对设计文档单 channel 定理的等价教学表达，不是文档原句，也不是当前 C++ 使用的另一个算法入口。

“唯一最弱”指这个前沿或去冗余后的标准关系，不表示唯一 machine instruction sequence。MAIL 载体、独立指令打包、不同区域候选、跨 channel 的传递路径均可改变表示或适用范围。

## 不能混用的三个优化目标

- 最弱等待前沿：尽量让每个 consumer 只等不可避免的 producer release。
- 最少 token：减少 channel 上的加减次数；往往可通过粗化得到更少 token，但会扩大等待。
- 最少 standalone MAIL：如果原始数据指令可 piggyback，两个 token 与一个 token 都可能新增 0 条 MAIL。反过来多个 channel 的位又可能打包在一条 MAIL 中。

因此不能从 token 数或独立 MAIL 数直接推出周期收益。文档的 223 cycles/迭代、2%–9% 等数据均为文档记载的历史案例，本轮没有重跑，也未将其用作新性能结论。

## 当前实现复杂度与设计界的差异

设计文档 1642–1679 已明确区分理想数据结构的单步上界与现有 C++。此外本轮直接读 `planStaircase:464–480` 可见：send 下标用 counting buckets，而同 send 桶内部用 `llvm::stable_sort` 比较 recv；若 m 个点集中于一个桶，局部最坏存在 `O(m log m)` 排序成本。后缀最小值和相同 recv 分组扫描本身是线性的。

整套 pass 还受输入点数、区域深度、跨子区域扫描、粗化轮数、schedule 装配查询和 verifier alternatives 数量影响。物理 mailbox 容量有界，不能推出路径 alternatives 数量常数；连续 N 个可能零轮的吸收子循环即可产生 N+1 个合法来源。不能把“核心扫描线性”写成“整个 InjectSync 是 O(N)”。

## 已确认的证明边界

### 1. 63、62、Φ、Ω 与真实计数

硬件容量 C=63；当前 `kOutstandingBudget = kMailboxCounterCapacity - 1` 为 62。原因是多源 recv 原子 checkout：某 channel 已满，命令仍可能因另一 channel 空而等待，容量证明需要一格余量。当前构造按闭区间统计 `Ω̂`，recv 当点尚不扣减，保守于文档的 `Ω`。

预算证明的是模型中容量反压不会闭环，不表示硬件 counter 永不触满。VP/DT→CT 的 R1 约束不允许这类粗化；同点交换 token 也不能通过合并把 send 推到自己的 recv 之后。

### 2. 独立 verifier 的未闭合接受路径

当前 `StaircaseCreditPolicy.cpp`：

- 122–129：`isRegisteredAbsorption` 的 OPEN 注释说明“未跨 owner backedge”本身不证明是首轮空依赖 credit；部分零轮/内层 carrier 链依赖注册转移。
- 305–312：相同 token 的 equalization send 直接作为 `LoopEpochSeed` 接受，需要区分设计意图与独立的首轮语义认证。
- 325–328：sunk point 依赖区域整体执行关系，循环直接 `continue`。
- 329–335：同 token 的 loop-carried obligation 跳过完整 epoch 检查。

当前 `StaircaseVerification.cpp:184–210` 的独立 frozen schedule timing 检查也明确跳过 loop-carried，注释承认其 own-credit send placement 仍由 construction 认证。schedule 重建比较可以发现漂移，但不能排除构造器稳定重现同一个错误。

这些是源码明确声明的验证边界，不是本次发现一个已触发的生产错误。页面应说清楚“有多层验证，仍有已知独立证明边界”，不能反过来把它推演成当前所有循环都不可信。

### 3. 模型与硬件完整性

TeX 754–896、2050–2180 把公平推进、无丢失、事件图完整性作为条件，同时记录 FIFO 丢失候选及 VP 退休问题的证据限制。文档曾观测的单个 VCS 对照不能代表所有形态；本轮没有重新采集 RTL 波形，也没有直接核对 RTL 文件 hash。

RTL 模型文档某些 SI 段落沿用 legacy 的保守排除表，而链模型明确区分 SI ordered outbox 与 match-fail 的效果。页面不能只截取旧表宣称 staircase 完全不支持 SI，亦不能把 SI retirement 说成一定完成 payload 写入。

### 4. 文档与 CLI 帮助并非唯一事实源

`tools/zeusv3-backend/zeusv3-backend.cpp:128–130` 帮助文本仍提及 auto/legacy fallback；当前 `InjectSyncPass.cpp:214–220` 对 planner 字符串只接受 staircase/legacy，`Passes.td:131–132` 默认 staircase，unsupported fail loud。实际行为应以选择/拒绝逻辑为依据，而非旧帮助文本。

## 对既有 sync.html 的扩展建议

保留原有 section ID，新增内容沿读者问题插入：

| 草稿 section | 推荐接在既有 section 后 | 意图 |
| --- | --- | --- |
| `chain-closure-proof` | `points` 或阶梯交互之后 | 解释偏序闭包与最弱等待，避免只记后缀最小步骤 |
| `staircase-code-invariants` | `staircase-example` / 交互之后 | 将具体实现每一步与不变量相连 |
| `token-mail-objectives` | `capacity-cost` | 区分三种成本 |
| `periodic-pairing-proof` | `epochs` | 为 seed 偏移建立可复算编号 |
| `potential-versus-counter` | `seed-drain` | 澄清静态与运行期账本 |
| `region-placement-tradeoffs` | `region-tree` | 教读者比较上投和下沉 |
| `absorption-fifo-walkthrough` | `nested-credit` | 用反例、单槽、双槽逐步说明吸收 |
| `capacity-wait-graph` | `capacity-cost` 或循环区域之后 | 说明真正容量环和 62 的来源 |
| `proof-layers-and-counterexamples` | `verification` | 给面试回答与后续验证边界 |

现有内容总体保守，未发现应直接删除的核心结论。集成时建议精化两处：

- 原 `verification` 的 “C1：收发与容量” 易把数学 C1 与容量门禁合成一个概念；可写成“C1 收支 / 单独容量约束”。
- 原阶梯例子中“producer 3 完成”最好补成“producer 3 的 ordered release”，避免读者把乱序 done 与可观测 release 混用。

## 本子任务实际完成的检查

- 读取项目规范和只读来源规范，核对 HEAD、目标文件 dirty 状态与 SHA256。
- 对照 TeX 算法、当前 `planStaircase`、`boundOutstanding`、`planRegion`、`equalizeLoops`、credit policy 与独立 timing checker。
- 草稿 JSON 通过 `python3 -m json.tool` 语法检查。
- 协调者本轮运行原配套 `mailbox-sync-chain-model-check.py`：53 个教学场景全部符合预期，其中 7 个 expected failure；本子任务核对日志结尾与计数。它是 Python 路径枚举模型检查，不是运行当前 C++ 编译器或 RTL；toy 与 C++ 的零轮、下沉和物化顺序边界仍如上所述。
- 本子任务未构建页面、未截图、未提交或发布，本记录不能代替协调者最终页面验收。
