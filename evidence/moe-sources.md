# FFN / MoE 章节来源与核验记录

核验日期：2026-10-23（Asia/Shanghai）。本记录为采访准备网站的来源账本，不是新一轮 kernel 验收报告。正文允许公开；仅保留理解技术结论所需的信息，不复制原始 checkpoint、业务 prompt、hidden tensor、凭据、内部服务地址、个人操作目录或完整日志。私有仓库链接需原有访问权限。

## 核验方式与版本边界

- torch_zeus 的 origin 已确认是 `DarronTam/torch_zeus`；zeus_dev 是 `bjxx-algo/zeus_dev`。
- GitHub 插件读取私有 PR #588 返回 404，随后使用本机已认证 `gh api` 只读获取 PR/issue 元数据与 body；没有发送评论、修改 PR 或触发 CI。
- 本地 torch_zeus checkout HEAD 为 `68f19fa0a159b8ff861dc9cf736d9c0ae64906ba`，早于 #588，不能据当前工作文件描述 merge_tokens/V122。
- 最新案例源码使用本地已有 git object 的 `git show 882bdf9be61303f826cc3eb3338c2c716f898909:<repo-relative-path>`，没有 checkout、pull、修改编译器或修改原仓库。
- zeus_dev 只读源码锚点是 `05ee10f9cc25d19fca0a144ae095c79b3a888976`。
- 已读相关仓库 AGENTS / AGENTS.local / CLAUDE 与语言规则；只在 interview 写入本记录和 `content/20-moe.json`。
- 本轮没有执行 kernel、CPU reference、Graph、CycleSim、VCS、实板、NV 或全模型性能测试。文中所有历史测试与性能数值明确归属下面冻结记录。

## PR / issue 冻结元数据

| 对象 | 核验标题 | 作者 | 状态 | head SHA |
| --- | --- | --- | --- | --- |
| [#429](https://github.com/DarronTam/torch_zeus/pull/429) | perf(moe): 集成 300B 四算子优化及 Routed/Reduce 有效行 ABI | Xuanwen-Wang | merged；2026-09-18 08:58:25 UTC | `7747ec34f332defd10dc65558ea9aa1e40e0e56b` |
| [#570](https://github.com/DarronTam/torch_zeus/pull/570) | perf(moe): optimize router, routed, shared and reduce | Xuanwen-Wang | merged；2026-10-21 14:11:27 UTC | `9f6ecaf2e72ea816a15976e46ffccb35d08c28bb` |
| [#572](https://github.com/DarronTam/torch_zeus/pull/572) | test(cyclesim): 支持 T24 MoE 42 层真实输入 benchmark | QiyiJiang | merged；2026-10-20 16:45:04 UTC | `657137c2921f6c88a8c6fa5aab89a3228e1bab6a` |
| [#588](https://github.com/DarronTam/torch_zeus/pull/588) | perf(moe): optimize GLM5Next 300B routed token merge and enable T32 | Xuanwen-Wang | merged；2026-10-22 14:12:13 UTC | `882bdf9be61303f826cc3eb3338c2c716f898909` |
| [#528](https://github.com/DarronTam/torch_zeus/pull/528) | feat(moe): 支持 DS V4 decode 新版量化与首次缓存 | siahuat0727 | merged | `0a64e1058270e26cc766a117d77c2f4a2a5a624d` |
| [issue #592](https://github.com/DarronTam/torch_zeus/issues/592) | bug(moe): 真实 decode T24 Routed peak 2.209% 超门槛，M1/merged 一致 | Xuanwen-Wang | open，closed_at=null | issue 无 PR head；原反例使用 `bc24ea5706572c73c4b75f1043dce8cd0cea1dd6` |

相应 PR base SHA（API 当时读回）：

- #429：`e3c281f1cb05315a1bc8fdcf9be35a1c08bf1f7e`
- #570：`8ea6e83638eebd81e170b3390d2f7c11f90fb919`
- #572：`b75ad7d593c752180553a87511628771de3429e0`
- #588：`af0f3e2500e1405e05f911302e17638d2250ab64`

**署名边界：** #429/#570/#588 的作者为 Xuanwen-Wang，支持把对应已明确的工作写为个人案例；#572/#528 是团队其他作者，正文明确作为配套或对比，不纳入本人 PR 贡献。用户“25% 以上 MR”是本人陈述，尚未定义分母、时间窗口、合并/关闭口径或完成历史统计，正文不把它写成已核验事实。PR 作者字段也不等于所有架构决策均为该作者独立完成。

## 源码锚点

### zeus_dev：形状、模型与分布式合同

冻结 SHA：`05ee10f9cc25d19fca0a144ae095c79b3a888976`。

1. [model_state_dev/glm5next_modules/configs/config_next.json](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/configs/config_next.json)
   - H=4096，Dense I=12288，MoE I=2048，288 routed / 1 shared / top8。
   - first_k_dense_replace=3，num_hidden_layers=45，故42层MoE。
   - scoring_func=sigmoid，norm_topk_prob=true，routed_scaling_factor=2.5，swiglu_clamp_limit=10。
   - 这是内部具体配置身份，不外推全部同名公开模型。
2. [full_model_test/config/test_300b_fp8_in_h20.py](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/full_model_test/config/test_300b_fp8_in_h20.py)
   - Zeus tp_size=4、ep_size=4、dp_size=4、world_size=16。
   - 页面只保留拓扑字段，不复制文件中的部署路径。
3. [model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py)
   - `forward_zeus`：四算子本地链，返回 rank-local partial，当前 IDs 决定 valid rows。
   - 约第1756行：tp_rank=rank%4、ep_rank=rank//4。
   - 约第1795–1802行：caller 的 TP all_reduce 与 board_replicated_reduce_scatter，位于本地 kernel 链外。
   - Shared 真权重只在 EP0；dev harness 其他 EP 可用零权重保持链形状。生产是否跳过 inactive Shared 必须按相应实际调用与计时记录核验。
4. [model_state_dev/glm5next_modules/_support/_comm.py](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/_support/_comm.py)
   - world16、四个rank每board，跨board lane如[0,4,8,12]。
5. [model_state_dev/glm5next_modules/docs/README_moe_dense.md](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/docs/README_moe_dense.md)
   - 默认GLM链Router / BF16 Shared / per-tensor FP8 Routed / Reduce的四次launch；
   - prepare负责pack与Graph-stable scratch；collectives由caller负责；
   - Dense入口是不同的BF16 module chain，不能与其他模型FP8旧实验互换。

### torch_zeus：以 PR588 head 作为新优化源码锚点

冻结 SHA：`882bdf9be61303f826cc3eb3338c2c716f898909`。

1. [sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py](https://github.com/DarronTam/torch_zeus/blob/882bdf9be61303f826cc3eb3338c2c716f898909/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py)
   - `_owner_planned_group`约第983行：完整owner分类、device-side bitmap、slot mask、M1/M2/M4。
   - `_moe_fp8_per_tensor_merged_kernel`约第1254行：T24/T32 ParallelExecutor hint，保持原token/slot ABI。
   - wrapper约第1684行：merge_tokens默认开启T16/T24/T32；I512/top8/owner/ID精度限制，静态映射与非支持shape回退。
   - IDs通过metadata-only int8 view传原storage；host不读取设备IDs或生成归组计划。
   - T24/T32逐launch设置executor width=2、headroom=131072 bytes；其他路径40960 bytes。
   - activation scale=1、每projection权重scale、BF16/FP8舍入合同保持。
2. [sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_router_linear_biased_topk.py](https://github.com/DarronTam/torch_zeus/blob/882bdf9be61303f826cc3eb3338c2c716f898909/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_router_linear_biased_topk.py)
   - logits生产舍入；selection=scores+bias；weights gather来自无bias的scores。
   - normalize后按调用者配置应用routed factor；dev chain只在Router应用一次。
3. [sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_reduce_sparse_fast.py](https://github.com/DarronTam/torch_zeus/blob/882bdf9be61303f826cc3eb3338c2c716f898909/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_reduce_sparse_fast.py)
   - valid row guard、Shared-first FP32初值、slot ascending accumulation、最后BF16 store。
   - 非本地行即使为DMA连续性搬进SRAM，也不允许进入浮点算术。
4. [sgl-kernel-zeus-triton/tests/cyclesim_performance/helpers/moe_reference.py](https://github.com/DarronTam/torch_zeus/blob/882bdf9be61303f826cc3eb3338c2c716f898909/sgl-kernel-zeus-triton/tests/cyclesim_performance/helpers/moe_reference.py)
   - `_projection`：FP64 dot → FP32 → FP32 scale → BF16。
   - I512 relative L2 < 0.03，其他profile < 0.02；peak < 0.02，finite与全零gate保留。
5. [sgl-kernel-zeus-triton/tests/test_moe_fp8_per_tensor.py](https://github.com/DarronTam/torch_zeus/blob/882bdf9be61303f826cc3eb3338c2c716f898909/sgl-kernel-zeus-triton/tests/test_moe_fp8_per_tensor.py)
   - 使用独立reference；不能仅依赖历史文档中旧2% L2说明。
6. [dev_docs/evaluations/moe_routed_v122_20261022/README.md](https://github.com/DarronTam/torch_zeus/blob/882bdf9be61303f826cc3eb3338c2c716f898909/dev_docs/evaluations/moe_routed_v122_20261022/README.md)
   - 原42层测量、A/B完整矩阵、Shared与holdout验证边界。
7. [dev_docs/evaluations/moe_issue592_20261022/README.md](https://github.com/DarronTam/torch_zeus/blob/882bdf9be61303f826cc3eb3338c2c716f898909/dev_docs/evaluations/moe_issue592_20261022/README.md)
   - 首次分歧与高精度累加解释、原门槛、原case补测，不冒充全量性能。
8. [dev_docs/evaluations/moe_pr588_compiler_refresh_20261022/RETRY.md](https://github.com/DarronTam/torch_zeus/blob/882bdf9be61303f826cc3eb3338c2c716f898909/dev_docs/evaluations/moe_pr588_compiler_refresh_20261022/RETRY.md)
   - 16规格加载程序等价、15实际JIT程序与6入口补测，支持复用原性能；原Shared解析偏差保留。

## 性能、精度与完成状态核对表

### PR429：历史 T8 VCS

- 输入：T8/H4096/top8，TP0/EP0，TP-local I512，E72，合成seed42；16 local / 48 remote routes。
- 本轮四项 VCS cycles：Router 10282，Shared 8557，Routed 28383，Reduce 13633；合计60855。
- 同口径上版合计84373；下降27.87%，包含kernel与编译器更新，不能单独归因于一项patch。
- 400MHz下合计152.1375μs。
- 每launch主指标是max(core_end−core_start)，含异步尾部；跨核span另作诊断。
- 四项RTL输出对同输入CycleSim golden逐字节一致，CPU reference与Graph另行验证。
- 排除TP/EP通信、host/JIT、装载；不能外推真实checkpoint或多rank端到端验收。
- 原截图数字存在span与duration差异，正文没有把未对齐截图计算为严格提升率。

### PR570：默认合并与低复用回退

- 真实输入42层：T16 7.4486→5.5356ms，T24 11.4430→7.3260ms；完整方案包含四算子与编译器累计变化。
- 固定随机看板T16 EP3的35route只有5组M2、25组M1、无M4；Routed 74.9625→82.8275μs，单项回退10.49%。
- 这不与完整MoE整体收益矛盾；聚合必须选最慢完整EP，不拼不同stage的不同EP极值。
- Shared保持同一连续parent；放弃的物理双GDG输出实验未重新接入。
- 解析SiLU预算仍有超线项，固定LUT与A/B一致不等于原模型精度验收。
- 本轮暂无对应真实业务RTL结果。

### PR572：4032是该PR计划，而非已完成benchmark

- 6个batch×42层×16目标rank=4032计划case；默认b01为672。
- 1008源文件=6×42×4；每个是BF16 [24,4096]，源TP4/EP1，目标TP4/EP4。
- 该PR验证仅语法、diff与无设备plan，没有执行CycleSim、Graph或benchmark。
- 不能把数据完整性、PR合入或计划case数当算子数值/性能已通过。
- 作者QiyiJiang；不是本人PR。

### PR588：V122 42层周期和复用

| 实际T | PR570基线ms | PR588 ms | 下降 |
| --- | ---: | ---: | ---: |
| 16 | 5.5356 | 4.8623 | 12.16% |
| 24 | 7.3260 | 6.4421 | 12.07% |
| 32 | 14.4504 | 8.3757 | 42.04% |

- H200真实输入的Zeus 400MHz CycleSim回放；layer3..44，每层16逻辑rank。
- 逐launch双核duration最大值；rank内累加实际Router/Routed/Shared/Reduce，再在TP/EP取最慢完整路径，最后实际42层求和。
- Shared只计实际EP0执行；排除通信、host/JIT、pack、初始化。不是整模E2E/TPOT。
- 原测量生产kernel `6cea5ebd13e4983ea167032233336dab5d9954fb`，编译器 `95bcca8a3334fb5e15ac4584e0a5b5249f9ead31`。
- 后续编译器 `d115a6c85a636349633e75fc5cc3326bbed99f1e` 下16规格加载字节等价、15 JIT程序匹配、6实际入口cycles/输出/Graph一致；1380/1380 MLIR通过。
- 因此复用原42层性能，没有重新跑全量；性能收益包含Routed与编译器升级，不单独归因于编译器某MR。
- PR588自身原验收4,032完整MoE case，含2,016组A/B；它与PR572的6批计划4032不是同一个矩阵身份。
- 原验收71项唯一pytest、追加T32 holdout、Shared实现参考审计等各自按原报告范围保留；本轮建站没有重跑。
- Shared原解析参考T32 layer44 / TP2仍保留单元素偏差，不能宣称全部解析门禁通过。
- 本轮没有新增V122 RTL，不能借PR429的旧RTL覆盖新版本。
- 代表性decode/NV比较：三档各9个观测，42层非通信kernel预算均值分别为4.665/6.104、6.151/6.853、7.973/7.160ms（Zeus/NV）。不是纯batch伸缩曲线，不是E2E。

### Issue592：一个原反例的参考修复

- 原反例T24 layer29 rank13，46条有效route；固定LUT reference L2=1.8286945%、peak=2.2093024%，原门槛3%/2%，peak FAIL。
- M1/merged逐位相同；512个SiLU LUT输出也逐位相同。首次分歧在Up207的BF16中点。
- 独立FP64和3784.00030517578125；原CPU FP32和3784.0；PE和3784.000244140625。
- scale=2^-12，BF16 midpoint=0.923828125；原CPU/PE BF16 Up=0.921875/0.92578125；FP8 activation=0.5/0.5625。
- 只改CPU Gate/Up reference为FP64累加再回FP32，生产kernel、LUT、pack、ABI、门槛与计时窗口不变。
- 修正固定LUT reference对46route L2/peak均0；原case解析诊断L2约1.7964%、peak约1.6892%。
- 原case两次Graph（含行置换）、M1对照、无效slot NaN及6 CPU + 4算子补测通过。
- cycles仍6484/26857/14119；原性能沿用，没有全量18,144case或NV重跑；没有新增VCS/RTL或整模质量验证。
- 技术修复已进入merged PR588；issue页面目前仍open。正文不声称issue已关闭。

## 直接推导的量，不冒充实测

- 单SwiGLU专家参数=3HI；三GEMM FLOPs≈6THI。
- H4096/I2048单专家纯矩阵BF16=48MiB、FP8=24MiB；TP4 shard分别12/6MiB。
- 72个Routed shard/rank为432MiB，双核各216MiB；四TP rank组成一个EP board为1728MiB。
- T24/top8/H4096的全route BF16输出容量=1536KiB；这是逻辑容量，与仅有效行有定义的语义相容。
- 理想权重主导AI≈2M/b FLOP/byte，忽略activation、输出、metadata与重复weight traversal，不能当真实roofline测量。
- 并发上升时GPU并行覆盖改善、518由访存转计算受限是待具体trace检验的架构推断，不写成普遍已测定律。

## 外部算法一手来源

- [GLU Variants Improve Transformer](https://arxiv.org/abs/2002.05202)：SwiGLU与GLU演进。
- [Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer](https://arxiv.org/abs/1701.06538)：稀疏条件计算。
- [Switch Transformers](https://arxiv.org/abs/2101.03961)：路由简化、通信与稳定性。
- [DeepSeekMoE](https://arxiv.org/abs/2401.06066)：细粒度与共享专家。
- 以上均于本轮浏览原始论文页面；没有用二手博客证明技术细节。章节中的项目参数以冻结源码为准。

## 交付内容与可维护性

- `content/20-moe.json`：6章，order20–25；42节，36组问答；4张自包含SVG，多个shape/数值/证据表。
- 章节路径：Dense/SwiGLU→TP/EP→四算子ABI→token merge→量化与#592→benchmark和面试叙述。
- 所有性能图示为公式或明示的示意图，不绘制伪造实测曲线。
- 新一轮更新应先核验PR/issue状态和新的生产SHA，再更新“核验日期”；不得用新状态悄悄覆盖历史测量身份。
