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
