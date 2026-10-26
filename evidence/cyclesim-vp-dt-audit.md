# VP / DT 源码与周期对齐审计

采集日期：2026-10-26。业务源码只读；未构建 CycleSim，未执行新 VCS/RTL/模型实验。已阅读 CycleSim 的 CLAUDE.md、PROGRESS.md 可信边界与对齐规则，以及 60/61/62/63 文档。CLAUDE.md 的会话结束更新 PROGRESS 要求在本任务不执行，因为用户与主任务明确业务仓库只读。未读取私人简历。

## 冻结版本与证据属性

- CycleSim HEAD：`d7ff3de469f8e4bfe571f4c86e127e6446ed56b0`，提交日期 2026-10-23。
- 工作区：仅 `PROGRESS.md` tracked dirty；本次没有修改。其当前 SHA256：`c551beacb6caa534f0f6a0c93b68c8103b171c47afefd6d6fa1d5ecfbe71ee76`。
- 本次读到的 RTL 树不是 Git checkout，revision 未知。不能给它套用 CycleSim HEAD，也不能称为正式发布 RTL。读取的 13 个 RTL 文件按相对路径和 SHA256 记录在 [RTL 指纹](cyclesim-vp-dt-rtl-hashes.json)。
- 当前实现与历史台架文件的 SHA256 在 [源码指纹](cyclesim-vp-dt-source-hashes.json)。
- 本文数值分三种：READ-RTL 源码读得的结构；仓库历史 MEASURED-RTL 台架记录；教学条件下由现代码/公式复算。当前没有新 MEASURED-RTL 数字。

## 供集成的产物

`content/41-cyclesim-engineering.json` 包含 6 个 `{id,title,html}`：

1. `cyclesim-vp-geometry`：实例与 A/B、几何到 beat、X/Y 共读口、窄化/矩阵 Y 反例、填充与 II、41 固定项。
2. `cyclesim-vp-reduction`：lane 树 / C 根节点、有序依赖、W 归约缺 H 反例、scalar 首结果与 II。
3. `cyclesim-vp-handover`：不同配置的有限缓冲、start≠cal admission、历史混合序列对照。
4. `cyclesim-dt-geometry`：转角缓冲、order 与 row axis、per-block max(fill,drain)、C 尾块 worked example。
5. `cyclesim-multiple-vp-dt`：每核四实例、每实例槽、shared L2、DT 执行深度与依赖的不同层次。
6. `cyclesim-vp-dt-validation`：分层对齐、反例矩阵、默认生产/可选 live 的真实边界。

四张原创 SVG 已做 XML 解析；正文无本机绝对路径或内部主机。视觉图是结构示意，带输入输出/箭头/坐标条件与图注。待主负责人在页面桌面/移动/打印中逐张人工查看。6 节合计约 17.6k HTML 字符，不依赖脚本。

## 当前实现与直接 RTL 读核

| 命题 | CycleSim 当前位置 | RTL 当前实际行号（相对于 RTL root） | 证据性质/边界 |
|---|---|---|---|
| 每核四个 VP 和四个 DT | `front/unit_queue.h:649-659` | `zeus518/vp_v3/top_wrapper/vp_518_zeus_top_wrapper.v:286,351,416,481`；`zeus518/zeus_top/zeus_core_top_pwr.v:7729,7773,7817,7862` | READ-RTL；wrapper 的 core0/core1 实例名不是物理 CPU/NPU 核数 |
| A/B 为一个 VP 内部 64lane 或 32lane 级联 | `vector/vp_engine.h:590-596,553-575` | `zeus518/vp_v3/sub_module/cal/vp_518_cal_group_top.v:42,633-643,674,774,889-931` | READ-RTL；不能等同两个独立 VP |
| VP0/1 L2 参数17，VP2/3为15 | `vector/vp_engine.h:259-265` | `zeus518/zeus_top/zeus_core_top_pwr.v:7380,7424,7468,7512` 端口深度4/4/3/3 | 直接深度结构与历史组件校准；不是本次重测 |
| inst_start 是读配置握手，accept 是写配置握手 | `vector/vp_engine.h:1032-1196` | `zeus518/vp_v3/sub_module/ctrl/vp_518_inst_decode.v:1399-1415` | READ-RTL；start 不保证计算已经接收第一拍 |
| 不同 cal/post 配置要排空，相同配置容纳有限 tile ends | `vector/vp_engine.h:1071-1091`、`vp_pipeline_config.h` | `zeus518/vp_v3/sub_module/cal/prl/vp_518_diff_disconnect.v:80-122`；`vp_518_inst_decode.v:1419-1420` | READ-RTL；不能只比较算子枚举，也不比较无关地址 |
| VP 两写尾部槽 | `vector/vp_engine.h:1426-1471` | `zeus518/vp_v3/sub_module/ctrl/vp_518_wr_addr_gen.v:904-921` | READ-RTL+历史b2b；不同配置使用更细 schedule_pipeline |
| VP done等写地址与全部写响应；PG load走单独完成 | `vector/vp_engine.h:912-937` | `zeus518/vp_v3/sub_module/ctrl/vp_518_wr_addr_gen.v:1025-1034` | READ-RTL；accept不代表数据已完成 |
| ordered accumulate反馈3拍 | `vector/vp_engine.h:395-421,774-888` | `zeus518/vp_v3/sub_module/cal/vp_518_acc.v:308-338`；`zeus518/vp_v3/sub_module/common/vp_518_fp32_sum.v:17-19` | READ-RTL+历史扫描；不同维度独立组计数不可漏 |
| scalar模式迭代次数1/2/4/16，非零关闭外部ready | `vector/vp_engine.h:424-471,1149-1171` | `zeus518/vp_v3/sub_module/cal/scl/vp_518_square_root_div.v:185-226` | READ-RTL+历史组件；head与II分开，第一操作数不在tile start到达 |
| DT只有一条活动执行 | `data/dt_engine.h:399-453` | `zeus518/dt/dt_inst_parse.v:277-279,422-427` | READ-RTL+历史b2b；解析FIFO能预存不等于并行执行 |
| DT accept=done | `data/dt_engine.h:466-479` | `zeus518/dt/dt_inst_parse.v:113` 与 `zeus518/dt/dt_top.v:198` | READ-RTL；四credit表示未完成命令可排队 |
| DT转角缓冲与响应FIFO | `data/dt_engine.h:155-173,280-325` | `zeus518/dt/dt_buf.v:14-59`；`zeus518/dt/rd_dtbuf_ctrl.v:131-158` | READ-RTL；32×256bit=1KiB；响应FIFO DEPTH=4是地址宽度、16项 |

## 关键历史记录：必须保留日期与台架条件

- VP 几何：`dev_docs/sim/vp_dt/62_vp_calibration.md` §12.1。FP32 W112/C128 矩阵模式 448X+4Y，而非448X+112Y；FP32窄化保留32元素拍只改strobe。
- VP mixed：同文 §13.3，2026-09-08 真实 VP0+L2 组件台架，C3584 的 vector alone 628；cast→ordered reduction→vector 531/886/913，模型511/886/918；unordered 531/460/723，模型511/447/721。不得删掉模型误差或称本次复跑。
- VP b2b：`dev_docs/sim/vp_dt/62_vp_b2b.tsv`，Icarus、单实例、phase0、固定延迟always-ready L2、无其他master。N+2和尾部约束导致成对/交替，不是整条指令占忙到done。
- DT b2b：`dev_docs/sim/vp_dt/63_dt_b2b.tsv`，单实例、Lrd9/Lwr2、always-ready、credit4；5条形状均inflight_max1，start周期=T1+2。
- DT公式与尾块：`dev_docs/sim/vp_dt/63_dt_calibration.md` §3-5，Lrd=Lwr9例子：bf16 NCHW 1×16×16×32为580；C24为572；C1为293。正文已独立复算。
- 两输入VP self-conflict：`dev_docs/sim/calibration/75_rtl_deviation_2026q3.md` §2。相同1024读/512写beat，三shape/address情况1091/1391/1427；带真实L2出现差异，固定latency stub均1091。当前默认self_conflict对受支持孤立形态已接入，不能仍写“模型完全不管自身冲突”。
- DT与宽口：`dev_docs/sim/vp_dt/63_dt_calibration.md` §2.12(e)，同DT目的偏移相差32B时宽口在重叠窗口损失6.19%～47.79%；这不是kernel slowdown，也不能乘实例数。当前解析默认没有完整跨master预测。

## 当前生产默认与 live

- `tools/src/sim_daemon.cpp:857-860`、`tools/src/model_run.h:47-50`：只有相应 `ZEUS3SIM_VP_LIVE_L2=1` / `ZEUS3SIM_DT_LIVE_L2=1` 才启用 live。
- 默认 VP = `analyse` 几何/固定包络 + `schedule_pipeline` 有限缓冲与配置寿命 + 支持形态的孤立 `self_conflict` 差值。不能简单称“只加总公式”，也不能称“全系统逐拍执行”。
- 默认 DT = 已修正 per-block max(fill,drain) 的解析模型；按 `duration + kInstHandoff` 做实例占用；接受和完成关联。
- live VP 的 `vp_live_timing.h:35-108` 有严格模式/链/格式/shape/roll门禁，当前已包含某些规约、scalar、cascade、参数加载路径，因此不能照搬早期PROGRESS“这些全部未实现”的广泛句子。仅宣称已支持并经过门禁的具体形态。
- live DT 的 `dt_tra_timing.h:51-71`：BF16/FP32，order0/1/4/9/12，无active roll，拒绝DT_RES，目的tile要匹配排列。
- `front/unit_queue.h:121-157` live事件在发生时发布；`1823-1827` 禁止live与reserved在同一队列混用。
- `vp_engine.h:1517-1587` 默认self_conflict调用live，但只以独立命令运行；其不支持的形态不给修正项。不存在因此自动覆盖四VP/DT/LD/PE整个系统的推论。

## 必须避免抄入正文的旧注释

1. `data/dt_engine.h` 文件头“write port bottleneck for every transposing order”已与同文件 `analyse:308-320` 和C尾块实测矛盾。正确是每块对max(fill,drain)。
2. `vector/vp_engine.h:700-701` 的38常数注释陈旧；当前同相默认15+19+8+(N−1)=41+N。非同相旧bench14/18/7得38+N，条件必须连同CDC/start换算一起声明。
3. `front/unit_queue.h:1760-1765` “engine ONE command/no overlap”是旧讲法；随后1772起说明pipeline与两资源，现代码另接stage scheduler。不能据开头一句否定VP流水。
4. `60_vp_rtl.md` 的[M]原来混合“读RTL/数flop”；按PROGRESS §7.3应转为READ-RTL，不能当运行测量。
5. 文档中的“silicon”9/9常数通常是实际L2 RTL组件或替身参数对齐，正文称历史组件/固定L2条件，不宣称真实硅片实测。
6. `PROGRESS.md` 的不同日期段落有历史边界；当前live已扩展不能用早期范围盖掉本次代码。脚注旧行号应查真实本机文件；本文引用的是实际读取行号。

## 检查已执行 / 未执行

- 已执行：JSON解析、4个SVG XML合法性、正文公开路径扫描、3个DT worked example独立算术复核、源码HEAD/dirty/SHA核验、RTL文件SHA清单。
- 技术审读：所有数值有条件；多实例/流水槽/队列credit/内核关键路径不同层级明确；实际当前实现与历史注释差异显式说明。
- 初学者审读：先解释beat/lane/shape、再公式与反例；每图明确输入与结构示意；规约首结果与II分开。
- 待集成执行：实际页面SVG桌面/手机/打印视觉、阅读顺序、链接与搜索；根任务完成build/check/public artifact及部署回读。
- 未执行：任何新RTL/VCS运行、业务构建、四VP/DT完整新增资格与整kernel性能结论。
