# 第一轮独立审阅：通用章节与 MoE 算法/性能

审阅日期：2026-10-23。只读审阅 `content/00-core.json` 和 `content/20-moe.json`，没有修改两份正文。

审阅快照 SHA256：

- `content/00-core.json`：`8e82232f64b4733af952db374e262be3d6469e018c849aec1da4a38ee7bfeced`
- `content/20-moe.json`：`6a7b301ffd0fc69a4a1e1b86ad98295165d4ab80ff75c1ea79cc209499b05ec5`

结论：未发现 P1；发现 2 个技术表述 P2，以及 1 个发布前需要闭环的来源链接 P2。以下不以“应再增加内容”为问题，只记录可复现的错误与证据缺口。

## P2-1：细粒度专家不必降低单专家 token 数 M

位置：`content/20-moe.json:37`，章节 `ffn-to-moe`，小节 `moe-evolution`。

当前表格将“更细粒度专家”的新增问题写为“单专家 M 更小，元数据和 dispatch 占比上升”。它把经常出现的小矩阵现象归因到了错误维度，并与所引用 DeepSeekMoE 的固定计算量比较不一致。

DeepSeekMoE §3.1 的做法是将专家数 E 扩为 mE，将中间维 I 缩为 I/m，同时将每 token 激活数 K 扩为 mK。均匀选择的教学模型下，每专家平均命中数约为 TK/E，因此变化后仍为 T(mK)/(mE)=TK/E。确定缩小的是专家 intermediate 维度，而不是 M。只有 E 增大、K 不同比例增大，或实际路由分布改变时，M 才会相应减少。

这会影响后续硬件推理：矩阵变小、调度开销占比上升的理由可以是 I 变窄、route 数变多、每次计算粒度下降；不应一律说成 M 更小。

建议改为：

> 单专家 I 变窄，route/dispatch 数可能增加；单专家 M 由 T·K/E 与真实路由分布决定，不能仅由“细粒度”推出。

一手依据：[DeepSeekMoE §3.1](https://arxiv.org/html/2401.06066v1#S3.SS1)，本轮读取正文第 174–180 行对应段落，明确同时调整 E、I 与 K。这里的 M 估计是独立推导，不是论文性能结论。

## P2-2：固定点终止条件不能写成“有限域或单调转移”

位置：`content/00-core.json:332`，章节 `engineering-drills`，小节 `classical`。

当前句子为“实现上应使用有限域或合适的单调转移来保证收敛”。“或”会让读者认为任一条件独立足够，作为编译基础面试教材不准确。

最小反例：在无限高度链上 F(n)=n+1 是单调的，却可以无限增长；在有限集合 {0,1} 上反复执行 F(x)=1−x 会振荡。常见 worklist 有限步终止保证依赖有限高度格、单调转移及正确 join/初始化/调度；无限高度域通常需要 widening 或其他收敛机制。有限高度即可，并不要求格中元素个数必须有限。

建议改为：

> 对常见有限高度格，在单调转移和正确的 join/worklist 更新下，迭代可有限步收敛；无限高度抽象域需另设 widening 等机制。

依据：[MLIR DataFlow 教程](https://mlir.llvm.org/docs/Tutorials/DataFlowAnalysis/)说明 lattice 与 monotonic join 合同；[CMU 数据流正确性课程材料](https://www.cs.cmu.edu/~aldrich/courses/17-355-18sp/notes/notes05-dataflow-correctness.pdf)明确有限高度格与单调 flow function 的联合终止条件。原页面的 Toy 教程可保留作多层 lowering 来源，但不能作为此终止定理的充分来源。

## P2-3：两处“证据约定”来源暂时指向不存在的文件

位置：`content/00-core.json:67` 与 `:74`，`start-here.sources` 中的 `jd` 和 `method`。

两者 URL 都是 `evidence/README.md`。本轮检查时仓库内该文件不存在；`evidence/moe-sources.md`、`evidence/compiler-sources.md` 则存在。因此页面点击这两项不能得到所称的岗位材料边界及全站证据约定。

建议在发布前补齐该索引，并确保打包流程会携带它；若实际索引采用另一位置，则更正两个 URL。若构建脚本负责生成该文件，应通过最终构建产物及链接检查闭环。此项不要求发布 JD 截图或个人材料。

## 已核验且未发现实质问题的部分

### 公式、量纲与容量

- GEMM：F=2BKN，bytes=s(KN+BK+BN)，AI 单位为 FLOP/byte；文本已说明相同元素字节的教学假设、理想重叠 max 下界及串行/控制开销边界。
- 标准 KV 教学例：2×32层×32768×8 heads×128×2 bytes=4 GiB/请求；40 GiB 预算对应理想 10 请求，文本明确未含 TP、碎片与其他状态。
- SwiGLU：参数 3HI，三矩阵 FLOPs≈6MHI；H4096/I2048 的 BF16 48 MiB、FP8 24 MiB、TP4 12/6 MiB 正确。
- Routed 72×6 MiB=432 MiB/rank，两个默认 owner 各216 MiB；全 route T24×8×4096×2=1536 KiB 正确。
- 理想权重 AI≈2M/b 已明确忽略激活、元数据和重复 traversal，没有直接将逻辑 merge 当作测得复用。
- 性能下降率 27.87%、12.16%、12.07%、42.04% 与低复用回退10.49%均按所列数值重新计算吻合。
- 400 MHz 的 ms=cycles/400000 正确。

### GPU、并发与归因

- root 的 `gpu-idle` 正确区分 grid 覆盖、active warps、发射不足、带宽和 host 空隙；没有把 occupancy 当 Tensor FLOPs。
- GPU 与 518 均可能受益于权重摊销和更多独立工作，没有写成互斥机制。
- “518 约并发2饱和”保留为特定 profile 经验假设，尚需 sweep/trace，而非硬件常数。
- KDA/DSA 的状态与检索成本没有被写成免费；KV 容量、外存流量、逻辑访问边界清楚。
- MoE 聚合先在同一 rank 内累加再取 max，且与 E2E/通信分离；两 rank 反例计算正确。该组件指标不声称等于真实端到端关键路径。

### 模型边界、数值与历史证据

- 内部 next 配置 H4096、E288、top8、45层、3 Dense/42 MoE，与公开 GLM-5 未混用；原配置链接为固定 SHA。
- #592 的参考修复不是生产 kernel 改动。已读取固定 SHA 的 `moe_reference.py` 与 `moe_issue592_20261022/README.md`：Gate/Up FP64 dot→FP32→FP32 scale→BF16、Down保留、L2/peak门槛、46 routes、BF16中点与FP8激活差异均与正文一致。
- 参考指标的 peak 分母是每 route reference 最大绝对值，正文公式正确；无效行按当前 IDs 过滤且不能通过乘0抹掉NaN，表述正确。
- 已读取冻结 V122 报告：42层主表、T32新增M1基线、实际执行Shared、CycleSim/RTL边界与原Shared解析超差均被正文保留。
- 原PR572计划4032与PR588完成4032被明确区分，没有互相挪用完成状态。

## 来源链接核验

- `20-moe.json` 全部 11 个 GitHub `/blob/<SHA>/<path>` 链接，均用对应本地 Git object 逐项验证 SHA/path 存在；验证的是来源对象身份，不代表公开匿名访问权限。原私有仓库仍需各自权限。
- 本轮认证 API 重新读回：PR429/528/570/572/588 均 merged；作者分别为 Xuanwen-Wang/siahuat0727/Xuanwen-Wang/QiyiJiang/Xuanwen-Wang；issue592 仍 open。PR588 首次请求 TLS timeout，单次重试成功，head=`882bdf9be61303f826cc3eb3338c2c716f898909`。
- GLU、Sparsely-Gated MoE、Switch、DeepSeekMoE、MLIR Toy、vLLM PagedAttention、CUDA Best Practices、Nsight Compute 的官方/一手 URL 均成功读取。
- Roofline eScholarship 页面直接打开触发网站机器人检查，之后官方页面的搜索索引成功确认题名、作者与文献身份；不认定链接失效，也不把机器人检查当文献缺失。
- root 的本地来源链接仅 `evidence/README.md` 暂缺；其他所引 evidence 文件存在。

## 未验证范围

本轮没有运行业务 kernel、CPU/Graph/CycleSim/VCS/实板测试，没有复测历史性能或核验完整原始 trace。未逐条审计所有 kernel 指令和所有 PR discussion；上述历史数值主要通过固定提交的报告与对应参考实现交叉核验。没有检查浏览器排版与最终部署路径，来源文件是否被发布包携带需由主任务完成。

## 第二轮复验与闭环（2026-10-23）

以下状态更新覆盖上文第一轮问题的处理结果；第一轮快照及原发现保留用于审计。本轮只修改本审阅记录，未修改正文和网页代码。

复验快照 SHA256：

- `content/00-core.json`：`b0945ef8baee1131856dc2505271e9819cb4b242761c2ffe64cad60aee90e3f5`
- `content/20-moe.json`：`d27fd54f037d053f0f4b404ed1d18a0bf5028fb04abbadde878d86667fd79586`
- `content/10-algorithms.json`：`95307e96877be9ff67dea9f1f006cb9ba9d01ac3a2daa95db8ad346f4d9490c6`
- `evidence/README.md`：`298db5349edc14b7474bf5b3069b3fc751d03ca2e7ee435b7e3fba19a36a5da1`

### 第一轮三项的处理结果

| 项目 | 复验结论 | 当前依据 |
| --- | --- | --- |
| P2-1 细粒度专家与 M | 已修复 | 表格已改为单专家 I 更小；正文明确 E、K 同比例增加时 T·K/E 不变，并区分仅增加 E、固定 K 的情况。 |
| P2-2 固定点终止条件 | 已修复 | 当前句子同时要求有限高度格与单调转移，另说明无限高度域可能需要 widening。没有继续使用“有限域或单调”的错误析取。 |
| P2-3 来源文件不存在 | 原问题已修复，发布读回另验 | `evidence/README.md` 已存在，包含 JD 输入、个人陈述、固定源码、历史实验、教学推导与本站验收的边界。`web/app.js` 的 `sourceUrl()` 将相对来源转为 GitHub 仓库文件链接，因此无需把 Markdown 复制进 Pages 的 dist 才能访问，但仍需提交/发布对应文件并检查线上链接。 |

复验时新索引引用的 `evidence/review-and-validation.md` 尚未生成，其他三份分领域来源文件均存在。该链接已反馈主任务补齐；这属于尚在进行的最终验收记录，不否定前述两项技术修复。最终发布验收应确认这份索引目标存在，不能只检查 README 本身。

### KV 实验室的扫描用词与单位

已检查 `web/app.js` 的 KV 实验室公式、标签和更新函数。默认参数得到 4 GiB/请求、40 GiB 预算下理想并发 10、4096 MiB 的完整逻辑 KV 扫描，三者一致。滑块明确使用标准 MHA/GQA/MQA 的 K+V、全层总账、无 TP 分片，另有不适用于 MLA/KDA 的说明。

“完整逻辑 KV 扫描 / MiB”描述单请求在给定历史长度下全层 K+V 数据各参与一次的逻辑量；它没有被标为 HBM 实测流量。算法正文 `kv-cache/reads` 也明确区分逻辑访问、cache/驻留、跨 query 复用与多卡分片。因此当前没有发现将逻辑 cache 大小直接冒充真实外存事务的 P1/P2。该卡片是单请求、单步、全层口径；不应用它推断整个 batch 的外存流量或每个 query head 独立重读的实现开销。

### KDA 时间顺序、时间线和数学算例

- 递推顺序复核为 decay → 用衰减后状态预测 value → delta 写入 → query 读出；与正文采用的逻辑状态 `[Dk,Dv]` 一致。Delta 示例给出 `[[2,2],[0,1]]`，按通道 decay 示例给出 `[[1.75,2],[0,1]]`，矩阵方向及数值均正确。
- 论文首次提交时间分别为 [DeltaNet 并行算法 2024-06-10](https://arxiv.org/abs/2406.06484)、[Gated DeltaNet 2024-12-09](https://arxiv.org/abs/2412.06464)、[Kimi Linear / KDA 2025-10-30](https://arxiv.org/abs/2510.26692)。六章中的概念演化顺序没有倒置；没有把 KDA 论文发布时间等同于内部 GLM5Next 部署时间，也没有把上述并行算法论文说成 delta rule 的最初发明。
- FlashAttention 算例 `[0,ln2,ln3]` 与 value `[2,5,8]` 得到 6；将第三项改为 `ln6` 得到 `20/3`。文中已说明第一个例子局部输出简单平均恰好正确，第二个例子才用于展示反例，不再混淆这两个结论。
- KDA rec 为 512 KiB、conv 为 36 KiB，每请求每 rank 的 34 层总计 18.1953125 MiB；528-byte latent 的 65536 token 单层为 33 MiB，11 层 CP4 理想均分为 90.75 MiB/rank，均独立复算通过。
- 45 层示意图中 0–2 为 KDA、3 为 DSA、4–43 为十组 3:1、44 为 KDA，累计 34 KDA/11 DSA；与前三层 dense、后42层 MoE 属于同一组主干层的两条分类轴。

二轮没有新增算法/数学 P1 或 P2。仍未进行浏览器视觉验收、线上发布读回或硬件重测；上述闭环仅覆盖内容正确性与当前源码内链接目标。

## 最终新增章节复验（2026-10-23）

只读复验以下两份新增正文，未发现需要修正的 P1/P2：

- `content/36-real-compiler-case.json`，SHA256=`c8f3f51bc7aad82dfa31e8dd7b57d5ba5dcd7a20c27de5252bdf51d90b919103`。
- `content/43-compiler-workshop.json`，SHA256=`0abd31200fa9b2ed6872dd6c17cd874d26e25b1469da81a2928460d7d70045b3`。

白板章节：重新计算 diamond 的四轮同步迭代和循环固定点，结果与全部表格一致。φ 输入按前驱边 use、IN 采用 φ 定义前外部值的约定自洽；完整干涉边 `{ab,ac,bc,tc,fc,xc}` 正确。在独立 predicate、NEXT 无额外 clobber、read-before-write 两地址运算、固定私有 spill 槽的教学模型下，所列 R0/R1 序列保持输入顺序，动态一次 store 和一次 reload，true/false 路径分别得到45/25。循环第二轮 `IN[B]` 增加 n、第三轮 `OUT[H]` 包含 n 的叙述也吻合。另核对了 [LLVM φ 边 use 定义](https://llvm.org/docs/LangRef.html#phi-instruction)、[MLIR block argument](https://mlir.llvm.org/docs/LangRef/#blocks)与[两地址/寄存器分配背景](https://llvm.org/docs/CodeGenerator.html#register-allocation)。

真实案例：对 `triton_shared@82613bc2eb30feb9ef7f57aef20584df0ef9e28a` 的主地址分配夹具、PE WAR 和 WAW 夹具、入口驱动测试、`findPaidReusePair`、容量回退、L2 region lowering、区间相交与 ODS 开关逐项读取核验。地址预期 `1024→3072`、`0→0`、`147456→147456`，144 KiB 容量算例，以及两128-byte区间相交64字节均正确。引入提交 `5dd4ddbe47d91ca5a081fd466df2a9d0e389dbe4` 的标题已读回。正文明确区分测试 CHECK 预期与实际执行结果、两个独立夹具与连续 pipeline 输出、legacy planner 编排与通用语义；没有据此宣称新测试 PASS、RTL 通过或收益百分比。

前一轮待补的 `evidence/review-and-validation.md` 现已存在，README 索引目标完整性在本地闭环。本轮仅进行源码审读与教学集合/算术独立复算，没有执行业务编译夹具、编译器测试、RTL 或硬件性能测试；线上来源链接与浏览器验收仍由主任务记录。
