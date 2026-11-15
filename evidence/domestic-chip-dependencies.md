# 国产芯片指令依赖调研：证据与验证记录

初次采集：2026-11-15；深入修订：2026-11-16。文章 ID：`domestic-chip-dependency`；独立入口：`chip-dependencies.html`；专题：`domestic-chips`（国产芯片调研）。

## 本次修订范围

正文重写为 30 节，重点为华为、寒武纪的硬件结构、同步状态与编译求解。保留同一文章 ID、离线文件名、全部旧小节和旧阅读阶段深链接；Zeus 缩为一节对照。新增 4 张有归属说明的厂商原图，另有 10 张原创语义图。未修改业务仓库或构建厂商工具链。

源文件为 `content/42-domestic-chip-dependency.json`；不手改 `dist/`。原始 PNG 以数据 URL 嵌入 SVG 容器以复用放大、打印和离线功能。构建校验仅新增允许 `image[href]` 的有效 base64 PNG 签名；其他 data URL、主动内容和事件属性仍拒绝，有正反例检查。

不发布整本手册、原始论文、内部源码、浏览器数据或本机路径。厂商图用于具体结构解读，图注保留代际、原图编号、来源与版权归属；并未把它们声明为本站原创或公开授权的通用素材。

## 关键更正与可复核依据

| 结论 | 精确来源 / 位置 | 推断边界 |
| --- | --- | --- |
| A2/A3 的 AIC/AIV 有独立 Scalar | H10 CANN8.3.RC1《基本架构》分离模式、原图1 | AIC:AIV 比例按平台查询，不外推所有产品 |
| 同流顺序执行不代表前一条已经完成 | H10 典型指令流；H3 PipeBarrier | 不能把发射序当作完成先行关系 |
| 待执行队列满会阻塞 Scalar 顺序发射 | H11；H19/H20 指令队列深度 | 开发版 2201/3510 数值逐列标注；不叫 event 容量 |
| 核内 Set/Wait 是按方向与 ID 的 bit | H2；H12 功能与约束 | 重复 Set 不当作可积累两个 token；未定义行为不模拟为确定故障 |
| 物理 ID 复用还需动态 HB | H8 §2.4.2，期刊页1972–1973 | 旧论文在没有旧 Wait→新 Set 的 HB 时加入反向握手；不只图着色 |
| 华为核间确有 +1/−1 | H13/H14 CANN商用8.0.RC2 CrossCoreSet/Wait | 核间聚合轮次不同于核内 bit，也不同于九队列匿名通道 |
| CrossCore Wait 范围随代际变化 | H15/H16 开发版参数生效说明 | 不混用 A2/A3 与950的等待流水；旧“最多16次”和新0–15分别标注 |
| UnitFlag 与具体 L0C 块绑定 | H17 特性、模式2/3、沿K累加；H4 CANN9.0最佳实践 | 块大小硬件决定；本报告例子只设四次累加，无性能测量 |
| 新架构还有 Mutex | H18、H20 | 不把 CPU 自旋锁或通用信号量语义套给它 |
| 现代公开自动同步默认 GSS V2 | H5 auto_sync.md | InjectSync 是 fallback；没有把2025论文与当前实现画等号 |
| 区域冲突→可达性→原语选择 | H23 MemInfo.cpp；H21 SyncSolverV2::processOrder / checkGraphConflict / handleConflict；H22 GraphSolver::runDijkstra | 程序位置距离不是周期；未知切片保守冲突 |
| ID 分配还处理预留和冲突邻接 | H7 EventIdSolver::getChosenEventIds / calcEventIds | 不宣称全局最优着色 |
| 内存规划后可能重新做跨核同步 | H5 DelayedCrossCoreGSS | 备份/anchor 保存位置，说明别名改变会影响同步 |
| MLU Core 是 IO/Move/Compute/Scalar 四流 | C8 §4.2.1；C2 §3.3.3 原图 | VFU/TFU 是两个功能部件，不能算成两套独立同步 Compute 流 |
| 寄存器依赖和异步 NRAM 依赖分工不同 | C8；C2 §3.3.5.1 A–F 示例 | 重命名不消灭真正 RAW，不推出任意内存依赖自动解决 |
| 核内 sync 选生产与消费集合 | C3 §3.19.4 | 由 API 推导 cut (k,S,T)，不是 CNCC 内部算法或机器位域的断言 |
| __sync_compute 会约束后续三类流 | C3 §3.19.2 | 不误写为只挡 Compute |
| 三阶段模板在阶段内重叠 IO/Compute | C5 unary_op_3pipeline.h 主宏稳态循环 | Load/Store 同属 IO；max(L+S,C) 为明确条件下的教学下界 |
| 五阶段混合局部与核间同步 | C6 unary_op_5pipeline.h 稳态循环 | 细粒度 builtins 实际核侧发射尚未反汇编；不声称已测得吞吐 |
| MLU barrier wait 本身也可贡献到达 | C4 §3.18.6/9 | 核间参与计数与局部 DMA 完成边分开 |
| MLU570/590 对应 mtp_592 / compute_50 | C9 CNToolkit3.8.4 组件表 | 官方索引正文已核实；直连502无本地正文hash；无同级详细v05图 |
| ISCA2016 仅作为历史原型 | C1 §IV、p.398 | 不用原型内存队列/ROB替现代MLU编程合同背书 |

## 版本身份与原图清单

- AscendNPU-IR 固定到 `255344be91f234b622c16290f14b8638ac894001`；本次另外阅读 GraphSolver、SyncSolverV2、MemInfo 等文件。
- MLU-OPS 固定到 `8c428bfca7fd20cdbbdd4396cff20c017302dbca`；三/五阶段模板直接核对源码。
- 昇腾 API 使用明确的 CANN8.x/9.0 页面；asc-devkit 开发页标示 `d433ffc4f75274b901521dfc42d98542abb98627`、2026-11-14构建且含未提交修改，因此以正文 SHA256 固定实际内容。
- 寒武纪架构调优指南0.4.1、编程指南1.7.0、BANG C4.7.2。公开产品映射补到 CNToolkit3.8.4，不宣称这是全部最新公开资料。
- 2025期刊论文 DOI `10.7544/issn1000-1239.202440093`，本次补读§2.2–2.4，特别是物理ID合并与安全复用；不称为顶会论文。
- ISCA2016 DOI `10.1109/ISCA.2016.42`。VTA/PTO保留为公开层次与相关工作参照，非正文主线。

| 本文图 | 厂商来源 | 处理 |
| --- | --- | --- |
| 图1 AIC/AIV | 华为 CANN8.3.RC1《基本架构》图1，`zh-cn_image_0000002446516986.png` | 原始PNG字节，无重绘、裁剪、改标 |
| 图2 IPU/MPU | 寒武纪调优指南图3.7，`figure1-7.png` | 同上 |
| 图3 Cluster | 同一指南图3.4，`figure1-4.png` | 同上 |
| 图10 MLU流水 | MLU-OPS `docs/images/figure4-1.png` | 固定提交原始PNG；与四流定义交叉解释 |

完整 URL、字节数和 SHA256 见 [来源清单](domestic-chip-dependency-sources.json)。原图之外均为本站原创语义示意，图注给出输入输出、箭头含义和比较前提，无周期比例或实测性能暗示。

## 有限语义模型与反例

运行 `python3 scripts/check_chip_dependency_examples.py`，新增检查：

1. 穷举两条独立执行流：同 ID 第二次 Set 可早于旧 Wait，产生非法重复发布；加入反向确认后所有可达状态满足回收顺序且最终 bit 清零。
2. 比较固定 `P1,P2,C0,C1` 的全部切点与重排 `P1,C1,P2,C0`。按传递闭包比较约束；前者所有覆盖都增加偏序，后者存在不增加必要闭包之外约束的切点。
3. 四个tile、两个独立输入/输出槽，枚举IO与Compute完成交错。按模板阶段屏障约束时版本一致；删除阶段屏障可出现读取旧版本。
4. 两个AIV、各两轮，枚举到达与AIC消费。可消费轮数受两者最小完成轮次限制；只一个AIV到达不能释放整轮。模型不猜测调度器电路。
5. 四张实际嵌入PNG通过构建校验；主动SVG/data链接、错误base64/签名、事件属性等反例仍被拒绝。

前版匿名token错配、单切点、有界通道闭环模型继续保留，作为历史对照验证。全部检查均是有限语义模型，不代表硬件时序、商用工具链或真实 pass 已通过回归。

## 验收记录

技术审查：核对上述合同及代码路径，单独区分 API 状态、本文模型与物理实现未知项。可理解性审查：先给两家原始架构图，再沿读写、状态、实例、抽象问题递进；避免以论文定位清单代替机制解释。

- 本地基础检查：`build.py`、`check.py`、`check_public_artifact.py`、`check_chip_dependency_examples.py`、`check_reading_numbers.js` 与 `git diff --check` 通过，公共产物为29个允许文件。
- 桌面与离线：Chromium134，1440×1000 / 1280×900，无文档横向溢出；14张图逐张截图并检查，修正箭头、连线压字和UnitFlag轴说明。四张原图正确加载并可放大到200%。断网上下文中从独立HTML文件冷启动，搜索“回收顺序”跳到事件复用、专题进入正文、旧`zeus-ordinal`深链接均通过。
- 兼容：脚本比较旧版与新版，原35个小节/阅读阶段锚点全部保留；同一文章ID、离线文件名和笔记入口未变。
- 打印：导出33页A4 PDF，14个图注全部存在；关键原图与机制图的打印页另做视觉核对。截图/PDF仅为本地验收产物，不随Pages发布。
- 发布边界：提交、匹配SHA的CI与Pages部署，以及线上关键产物字节一致性在发布后另核实，不以本地通过替代部署完成。

没有执行厂商SDK编译/反汇编、CycleSim、VCS/RTL或芯片实验；不作硬件性能验证声明。按当前用户约定，仅验收电脑阅读。

## 附录：前版 Zeus 静态证据身份（保留审计）

编译器仓库别名：`triton_shared`。读取时 HEAD：

`a6161ef94b1941f786ce05d4e31104ec91ea22d4`

读取时已跟踪文件无修改；存在无关未跟踪文件，本次没有复制或纳入。相关文件摘要单独记录，避免仅用整个仓库 HEAD 代替内容身份。

RTL 仓库别名：`design-reference`，非 Git。其 README 记载为 `tag_PN100_R1_20250928` 的部分副本，拷入日期 2026-07-03，并列出部分局部差异。原始 tag 身份、这批文件与量产配置的对应关系没有独立认证。本文因此采用逐文件 SHA256，不以该标签声称硅上行为已确认。

以下 RTL 位置均相对 `rtl/zeus518/inst_ctrl/`：

| 结论 | 文件与关键位置 | 证据层级 |
| --- | --- | --- |
| 九逻辑端点与顶层位序 | `zeus518_inst_ctrl.v:34–43`；编译器 `lib/Target/ZeusV3/AsmParser.cpp:60–61` | 静态顶层/端点表 |
| 接收需要所有掩码源非零 | `inst518_queue_inbox.v:105–125` | 静态组合逻辑 |
| 成功 checkout 后每个所选源扣一；同拍收发抵消 | `inst518_queue_inbox.v:127–161` 及其余端点同构部分 | 静态时序逻辑 |
| LD 发射还受 credit、队列与 inbox 条件限制 | `inst518_queue_ld.v:354`、`495–497` | 静态发射条件 |
| 通知释放需要目的未满，并受 outbox 头部顺序约束 | `inst518_queue_ld.v:552–576`、`713–718` | 静态通知路径 |
| VP/DT 多 lane 完成经一个逻辑 outbox 按头部选择 | `inst518_queue_vp.v:1280–1320`；`inst518_queue_dt.v:1165–1208` | 静态子通路/通知退休 |
| CT ready 参与统一前端推进 | `inst518_inst_dispatch.v:714–738`；`inst518_ct_unit.v:1848–1855` | 静态控制关系 |
| 规划预算是容量减一，即 62 | `lib/Dialect/ZeusLow/Transforms/InjectSync/Staircase/StaircasePlanning.cpp:647–663` | 当前编译器规划逻辑 |
| 通道、物理安排、ledger 与验证工程存在 | `StaircasePlanning.cpp`、`Ledger.cpp`、`Verification.cpp` | 静态源码；不是全程序正确性证明 |

通用文档 `docs/vcs_debug/rtl-instruction-dependency-model.md` 用于导航，再回到上述实现核对。未从不同文档的单位缩写推断端点用途，未把子模块默认位号当成顶层实例化位号。
