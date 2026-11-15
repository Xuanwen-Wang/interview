# 国产芯片指令依赖调研：证据与验证记录

采集日期：2026-11-15。文章：`domestic-chip-dependency`；独立页面：`chip-dependencies.html`；专题：`domestic-chips`（国产芯片调研）。

## 范围与发布边界

本次新增一篇连续 HTML 长文、一个可继续扩展的专题入口、八张原创内联 SVG、来源清单与教学模型检查。业务编译器、算子和 RTL 仓库只读；不修改或构建业务工具链，不执行硬件实验。正文由 `content/42-domestic-chip-dependency.json` 生成，不手改 `dist/`。

公开记录只包含必要机制说明、仓库别名、相对位置和内容摘要；不上传内部源码、原始论文、浏览器状态或本机环境。原始外部资料和静态参考文件的 SHA256 见 [来源清单](domestic-chip-dependency-sources.json)。摘要固定本次读取的内容，不认证非 Git RTL 的来源标签。

## 外部来源身份

| 来源 | 冻结版本或文档范围 | 用途 |
| --- | --- | --- |
| Ascend/AscendNPU-IR | `255344be91f234b622c16290f14b8638ac894001` | 同步 IR、默认图求解和 fallback、event ID 分配 |
| Cambricon/mlu-ops | `8c428bfca7fd20cdbbdd4396cff20c017302dbca` | MLUv03 指南、三阶段和五阶段真实流水模板 |
| apache/tvm | `97c5de63ba6baa148fdf0c545ded2cd01d7838d1`，v0.13.0 | VTA 无信息依赖 token 与有序阶段 |
| apache/tvm-vta | `d4a15f627d5cc9762a82270d1be60a136e6af9c2` | 指令依赖 push/pop 位 |
| hw-native-sys/pto-isa | `71ce9dd4e850e0fc04e9d9acdfdf8b8f52839d0c` | 明确 PTO 是 virtual ISA，不等同完整机器编码手册 |
| 昇腾 SetFlag/WaitFlag | CANN 8.2.RC1 | 方向与 ID、置位与等待清零、分产品 ID 范围 |
| 昇腾流水线概览 | CANN 8.5.0 | 流水线角色；不跨代固定流水线数 |
| 昇腾 UnitFlag 最佳实践 | CANN 9.0.0，Matmul High-Level API Enabling UnitFlag | 按内存块交接 MMAD/FIXPIPE，区别于整指令完成 |
| 昇腾 PipeBarrier | 2026-11-15 采集的开发版页面；页面标示 `d433ffc4f752`、构建于 2026-11-14 且包含未提交修改 | 同流水线 barrier、PIPE_ALL 与代际限制；以正文摘要固定内容，不能只用页面标示提交代表全文 |
| 寒武纪同步 API | SDK 1.15.0 / CNToolkit 3.7.2 / BANG C 4.7.2 | §3.19 核内选择性同步，§3.18 跨核 barrier 与 arrive/wait |

外部网页正文通过官方页面及其官方正文资源读取；部分站点前端只返回页面框架。来源清单保留实际取得正文的 URL。Git 文件按上述 commit 读取；页面正文无 commit 的部分保留版本、采集日与摘要。

### 直接相关论文

- 李帅江等：《面向昇腾处理器的高性能同步原语自动插入方法》，《计算机研究与发展》2025，62(8):1962–1978。DOI [10.7544/issn1000-1239.202440093](https://crad.ict.ac.cn/cn/article/pdf/preview/10.7544/issn1000-1239.202440093.pdf)。评估对象为 910A；核对 PDF 第 4、5 页中的同步模型、资源与算法背景。它是期刊论文，不标作体系结构顶会论文。
- Shaoli Liu et al., *Cambricon: An Instruction Set Architecture for Neural Networks*, ISCA 2016:393–405。DOI 10.1109/ISCA.2016.42。[原文镜像](https://reconfigdeeplearning.wordpress.com/wp-content/uploads/2017/02/2016-isca_cambricon-an-instruction-set-architecture-for-neural-networks_cyj.pdf)。核对 §IV、p.398（PDF 第 6 页）中的原型、内存依赖检查和 ROB；不将原型等同现代 MLU。

正文不复制论文图，不转述厂商案例数字作为本次测量。所有机制图为原创教学示意。

## 结论到外部实现的映射

| 结论 | 定位 | 限制 |
| --- | --- | --- |
| 昇腾跨流水线事件有独立方向与 ID | H2；`HIVMSynchronizationOps.td` 的 SetFlagOp / WaitFlagOp | MLIR 操作不是机器码 |
| 当前公开实现默认图求解，InjectSync 可回退 | `docs/source/en/developer_guide/features/auto_sync.md`，Algorithm Principles | 未运行编译器，不证明所有目标启用同一配置 |
| ID 分配与冲突关系、保留 ID 相关 | `GraphSyncSolver/EventIdSolver.cpp`，`isColorable`、`getRoundRobinEventIds` 和 `allocateUnusedEventId` | 没有把图求解器直接认作 2025 论文同一实现 |
| MLU 异步存储交接需显式同步 | `docs/BANG-C-OPS-Develop-Guide.md`，MLUv03 内存依赖示例 | 寄存器机制不能代替异步片上内存依赖 |
| MLU 核内同步可选择两侧流水线 | BANG C §3.19.4，六个布尔参数 | 未取得内部状态和完整编码规格 |
| __sync_compute 约束后续 IO/Move/Compute | BANG C §3.19.2 | 不能误写为只挡后续 Compute |
| 真实模板使用 sync 及细分同步 | `kernels/unary_op/unary_op_3pipeline.h`、`unary_op_5pipeline.h` | 一个模板不代表所有算子的唯一策略 |
| 跨核同步可拆 arrive / wait | BANG C §3.18 的 cluster / all 版本 | 参与范围、目标架构和禁止交叉使用规则需遵守 |
| 匿名 token 与附带依赖位已有先例 | VTA `hardware.rst` 的 Dataflow Execution，`hw_spec.h` 依赖字段 | 不等同 Zeus 拓扑和完成合同 |

## Zeus 静态证据身份

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

## 原创教学模型的独立检查

运行：

```bash
python3 scripts/check_chip_dependency_examples.py
```

检查对象是正文的有限语义模型，不模拟任何厂商时序：

1. 穷举保持生产端 A→B、消费端 B→A 顺序的可达状态。匿名逐项收发模型发现 `P1 → C1 premature read` 反例，虽然最终收发总数相等。
2. 合并到 P2 的完成前沿，以及使用两个有名事件的对照模型，所有可达状态均满足缓冲区就绪；最终通知耗尽。
3. 固定 `P1, P2, C0, C1` 顺序，枚举所有截面；每个覆盖 P1→C1 的单截面都加入额外跨流水线约束。不允许重排是模型前提。
4. 对 B=1..4 枚举有界通道模型：P 先向 C 发送 B+1 次再通知 R；R 通知 C；C 先等 R 后消费 P。容量 B 出现闭环；同一模型容量 B+1 完成。它说明容量可以改变活性，不推导真实硬件延迟或规划预算是否充分。

已执行以上检查并通过预期反例/正例判据。检查纳入 Pages CI。它们不证明当前 Zeus pass 的完整实现正确，也不替代 RTL 仿真。

## 验收记录

- 技术：关键合同与原始资料交叉检查；明确区分 API、论文原型、当前源码和本文推导。有限教学模型通过。
- 可理解性：先定义资源与事件，再介绍厂商接口；独立说明匿名错配、两个前沿、双缓冲归还；每图注明箭头、轴/顺序与非比例性质。
- 页面验证：`build.py`、`check.py`、`check_public_artifact.py`、`check_reading_numbers.js`、教学模型检查与 `git diff --check` 通过。公共产物检查覆盖 29 个允许文件。
- 桌面验证：1440×1000 主阅读与专题入口、1280×900 对照表无文档横向溢出；八张 SVG 分别截图并逐张查看；图示放大、搜索、新小节深链接、专题到正文入口，以及原有 `compiler-sync/questions` 路由通过。未做移动端验收，遵循当前桌面阅读范围。
- 打印验证：导出 A4 PDF，检查八个图注均存在；查看包含图 1、3、5、8 的打印页，图文未裁切，折叠技术补充可打印。PDF 仅作为本地验收产物，不随站点发布。
- 离线验证：独立 HTML 无外部脚本、样式或图片依赖；在断网浏览器上下文中直接从 `file://` 冷启动，八张图、锚点、放大和搜索通过。桌面在线检查用 Chromium 157；离线文件入口另用 Chromium 134，避开系统 Snap 对参考文件目录的隔离。测试配置和浏览器数据未提交。
- 发布边界：上述为本地验收记录；推送提交、对应 CI、Pages 部署与线上关键产物字节核对分别在交付时确认。
- 未执行：厂商 SDK 编译/反汇编、Zeus pass 全回归、CycleSim、VCS/RTL、FPGA/硅上性能、端到端模型测试。本次不作性能排名或新颖性已证明的声明。
