# CycleSim 工程长文：源码与验证依据

采集日期：2026-10-26（Asia/Shanghai）。正文是原创中文解释与原创 SVG，不复制完整 RTL 或原始模型输入。业务仓库只读。正文主入口为 `cyclesim.html`；稳定章节 ID 为 `cyclesim-engineering`。

## 专项证据

- [LD / DMA / 内存路径](cyclesim-ld-audit.md)
- [VP / DT / 多实例](cyclesim-vp-dt-audit.md)
- [PE / WL1 / INT4](cyclesim-pe-audit.md)
- [PE 源版本与 RTL 文件指纹](cyclesim-pe-provenance.json)

以下路径均相对所标记的仓库；本文不将本机路径作为公开依据。

<a id="scope"></a>

## 版本与边界

当前 HEAD 为 d7ff3de469f8e4bfe571f4c86e127e6446ed56b0；采集日期 2026-10-26。git status 仅有既存 PROGRESS.md 修改。该文件按下表 hash 固定，不把本地记录归给 HEAD。RTL 为无可核验 Git revision 的参考副本。此次未构建或运行业务模型、VCS、RTL/硅上实验。

- `Zeus3Simulator/PROGRESS.md`
- `Zeus3Simulator/CLAUDE.md`

<a id="runtime"></a>

## 默认工具接线

ModelRun:47–71、daemon:857–877/993–1013/1121–1128 创建并 attach 各 Engine。shared_clock_tools:6–19 明确共享时钟选项不启用 physical LD/ST/GDG/NoC/MC/app0。VP/DT live 是显式开关，PE INT4 的限定接入见 PE 专项。已存在工具二进制的构建来源本次没有认证。

- `Zeus3Simulator/tools/src/model_run.h`
- `Zeus3Simulator/tools/src/sim_daemon.cpp`
- `Zeus3Simulator/tools/src/shared_clock_tools.h`

<a id="events"></a>

## 执行与观测事件

UnitQueue CommandRecord:950–980 保留 start/done 与 traced_start_at/retired_at；retire_completions:1368–1414 每拍最多弹一个有序完成项。timeline:21–40/58–69/90–105/136–148 区分 service 和 trace 并始终输出两组。DT 等单元起点含 head，不能机械把字段映成相同物理引脚。

- `Zeus3Simulator/simulator/include/zeus3/front/unit_queue.h`
- `Zeus3Simulator/tools/src/timeline.cpp`

<a id="clocks"></a>

## 时钟与旧状态采样

Simulator:39–53 用频率 LCM；64–71 在 tick 前递增 local_clk，并按注册顺序执行。module.h 顶部旧注释说 tick 后自增，正文按实际代码。SharedMemoryLaunch:100–147 分 sample/prepare/commit、队列/mail、dispatch、settle；delta 收敛不加物理时间。chip_config 为当前名义 profile，未重新量测本机运行时钟。

- `Zeus3Simulator/simulator/include/zeus3/base/simulator.h`
- `Zeus3Simulator/simulator/include/zeus3/base/module.h`
- `Zeus3Simulator/simulator/include/zeus3/base/chip_config.h`
- `Zeus3Simulator/simulator/include/zeus3/base/link.h`
- `Zeus3Simulator/simulator/include/zeus3/sim/shared_memory_launch.h`
- `Zeus3Simulator/test/base/test_tick_model.cpp`

<a id="frontend"></a>

## 真实程序与队列

frontend.cpp:394–430 外部时钟阶段合同；442–474 取指命中/缺失；623–703 命令与数值路径；860–943 预解码及 CT_ED 后 drain。UnitQueue:1064–1095 捕获旧 credit/outbox 状态，再推进与退休；1531–1595 队头条件与 MAIL 顺序。

- `Zeus3Simulator/simulator/src/front/frontend.cpp`
- `Zeus3Simulator/simulator/include/zeus3/front/frontend.h`
- `Zeus3Simulator/simulator/include/zeus3/front/unit_queue.h`

<a id="mailbox"></a>

## 令牌计数与可见性

Mailbox:80–100 ready/send_allowed，112–132 post，142–165 commit。收/扣同拍净零，计数按 6 位回绕。UnitQueue:1107 registered DMA 使用 send_allowed；不能从方法存在推断所有路径都有同等满计数背压。Frontend end_external_cycle 在队列推进后 commit。

- `Zeus3Simulator/simulator/include/zeus3/front/mailbox.h`
- `Zeus3Simulator/simulator/include/zeus3/front/unit_queue.h`
- `Zeus3Simulator/simulator/src/front/frontend.cpp`

<a id="outbox"></a>

## 多实例有序退休

测试用延迟第一实例、快速后续实例与尾部 MAIL，断言保留真实 done、每拍一个 retire 和有序 trace start。本篇只读该测试，未重跑。教学时间线 10/30、12/20、32/33/34/35/36 是原创构造，不是 RTL 数据。

- `Zeus3Simulator/simulator/include/zeus3/front/unit_queue.h`
- `Zeus3Simulator/test/front/test_outbox_retirement.cpp`

<a id="scheduling"></a>

## 跨单元和跨核

默认数值在部分 dispatch 路径提前计算，合法 mail 保证消费。共享物理调度不是共享内存完整后端的代名词。frontend:883–936 的无进度判定与 drain_stalled 提示结果未完成；不可当作性能值。依赖图与双缓冲例均为教学，不声称来自同一个真实业务编译。

- `Zeus3Simulator/simulator/src/front/frontend.cpp`
- `Zeus3Simulator/simulator/include/zeus3/sim/shared_memory_launch.h`
- `Zeus3Simulator/tools/src/shared_clock_tools.h`

<a id="history"></a>

## 历史相位排错

该记录 §1/§2 保留旧总周期1811/2534、计算VP两条588/203对599/195、DT开始518→878对RTL862、PE787→1078对1064、ST1657→2256对2255。这里复述历史与机制，未认证当时较小语料为当前覆盖；旧文中“MC不在drop”等时效判断不沿用。

- `Zeus3Simulator/dev_docs/sim/calibration/87_phase_alignment.md`

<a id="tools"></a>

## 工具口径审计

timeline_diff.py 调用 [TL,d,core]，缺少 trace 参数；使用输出第3列 ts（默认service），并按单元排序顺位对比。这与把字段当 RTL queue trace 精确误差不一致。正文明确要求正式比较显式trc与动态身份，不提供虚假已验证命令。本篇没有修改该业务工具。

- `Zeus3Simulator/tools/src/timeline.cpp`
- `Zeus3Simulator/tools/src/model_run.h`
- `Zeus3Simulator/tools/scripts/timeline_diff.py`

<a id="validation"></a>

## 证据层级与校准

常数分类按98文档区分MEASURED-RTL、READ-RTL、INFERRED-STRUCTURAL、SOLVED-RESIDUAL、FITTED、DECLARED-UNKNOWN；文档原有[M]不能默认解释为新测。网页数学手算检查与业务模型/RTL实验分别报告。

- `Zeus3Simulator/dev_docs/sim/calibration/98_constant_register.md`
- `Zeus3Simulator/dev_docs/sim/calibration/87_phase_alignment.md`
- `Zeus3Simulator/test/front/test_outbox_retirement.cpp`
- `Zeus3Simulator/test/base/test_tick_model.cpp`

## 本次读取的 CycleSim 文件指纹

HEAD 与文件 hash 同时保留；源码文件无本地改动，PROGRESS.md 的本地记录由该 hash 单独标识。

| 相对路径 | SHA256 |
| --- | --- |
| `CLAUDE.md` | `bbb56b59c424193d52e885f0267ccbe665157c13130d2d4252eee46152e6ce51` |
| `PROGRESS.md` | `c551beacb6caa534f0f6a0c93b68c8103b171c47afefd6d6fa1d5ecfbe71ee76` |
| `dev_docs/sim/calibration/87_phase_alignment.md` | `235c8ee7f36e09ddb0204628d93051963650fdc63afbc4315989f8904002b6ad` |
| `dev_docs/sim/calibration/98_constant_register.md` | `4d29cc5054ccb039c173120e2d0bc8c0e9ef98c88ef0bcdad01752324d426fdb` |
| `simulator/include/zeus3/base/chip_config.h` | `9c103de39ff1570b6a42634ef69defc920823fff3f791158ad67978e1e452e70` |
| `simulator/include/zeus3/base/link.h` | `0b4db8439d4d981a3c7d8c612b5c6356885590c14d5b79d2c475b21115a20f84` |
| `simulator/include/zeus3/base/module.h` | `3f0a84eac29c59c5272dba9d2ae9cf1febac6afb083bf59b528fc7278ac28b3e` |
| `simulator/include/zeus3/base/simulator.h` | `ebac9a51d4b17127f1258c4990da3b3cea7a560d697a5b7c6bbb37fe9cfecd5e` |
| `simulator/include/zeus3/front/frontend.h` | `ecc61956e1b53b3279d2e79ae5bde0aba00c1a1917b21445eaeb05b730fd1a75` |
| `simulator/include/zeus3/front/mailbox.h` | `23ed60bb54f237922331c31bd577633db4f7d8b9108405bf14d2bf7d63e85cce` |
| `simulator/include/zeus3/front/unit_queue.h` | `371153c1500064fcde6cd0236c366516f81e572aa5d9e64b76404493a5ae7510` |
| `simulator/include/zeus3/sim/shared_memory_launch.h` | `9588805e8d283eb2243171e45862e21b87512d6c1d4d3b1d4df4558cadc0d0d4` |
| `simulator/src/front/frontend.cpp` | `662774aa7aa9641d73cb973258d26ee89b8738afb583f3528c6820ffba1518c3` |
| `test/base/test_tick_model.cpp` | `9304b7d5227cc2ea812fa0152e25dec570a3e892ce059b4b647ea775ec129688` |
| `test/front/test_outbox_retirement.cpp` | `2ba3d8f41a0e75d1219f93aa9869d0e2fc18406b0e4c576380ec6b37928463a6` |
| `tools/scripts/timeline_diff.py` | `bec49dafdbba89881b9df2595e6b73e5f20e26edcb3b735dbc1442f43806dd63` |
| `tools/src/model_run.h` | `06c9abd39f8c93dd27736aac44dfe871eda5258b288621057e0d08a334c09be7` |
| `tools/src/shared_clock_tools.h` | `685d1492260ff39b70a3142d04721de494d41738e043900d44723907f9e97a76` |
| `tools/src/sim_daemon.cpp` | `54464f0a30814a9581dc1dc762929399bb45281d6c85646bb91e743f00046a0a` |
| `tools/src/timeline.cpp` | `92ae0f162c911e152b28cc1e67bae449fb1a3514bd88acfe10c3cdb688e79631` |

## 前端/依赖 RTL 指纹

revision unknown，非 Git 参考副本；READ-RTL，仅静态核对。

| 路径（相对 RTL 根） | 本次核对位置 | SHA256 |
| --- | --- | --- |
| `zeus518/inst_ctrl/inst518_queue_inbox.v` | 107–147：非零条件、AND、同拍收扣 | `3cdea836a2ade09863782a75bcf5f8b0e227a772171ad0e7447bb29160047cce` |
| `zeus518/inst_ctrl/inst518_queue_ld.v` | 484–497、552–579：checkout、outbox及mail发送 | `7f1dfd227e09df7e0704ac5d5d181427b865364a737029ccf7dbdd2c8cf4a6db` |
| `zeus518/inst_ctrl/inst518_queue_vp.v` | 1260–1309、1499–1522：有序done选择、trace输出 | `0f8cf7f494fe60e3d0343fb6d480f1b6b62109830f53ee46bce52b54c390169d` |

## 发布检查记录

网页构建、静态链接、公开产物、图形可读性、离线与线上核验见 [本篇验收记录](review-cyclesim-guide.md)。这些网页检查不证明新增硬件性能实验通过。
