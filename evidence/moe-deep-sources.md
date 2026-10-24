# MoE 深度章节：来源、版本与计算复核

核验日期：2026-10-24。新增内容只用于教学与面试准备。本轮只读源码、历史报告和 GitHub 元数据，没有执行模型、kernel、CycleSim、VCS、CUDA 或通信性能测试。历史观测、源码推导、教学算例分别标识；内部原始输入、个人路径、服务地址和凭据不进入公开仓库。业务源码链接可能需要原仓库访问权限；公开网站不会因此变成源码仓库的镜像。

<a id="versions"></a>
## 版本与旧 HTML 的适用边界

- torch_zeus 本地 HEAD：`68f19fa0a159b8ff861dc9cf736d9c0ae64906ba`；origin：`DarronTam/torch_zeus`。新优化使用已有 git object `882bdf9be61303f826cc3eb3338c2c716f898909`，通过 `git show` 只读，不切分支。
- zeus_dev：`05ee10f9cc25d19fca0a144ae095c79b3a888976`；origin：`bjxx-algo/zeus_dev`。
- 2026-10-24 GitHub API 再核验 [PR588](https://github.com/DarronTam/torch_zeus/pull/588)：作者 Xuanwen-Wang，closed / merged=true，merged_at=2026-10-22T14:12:13Z，head=`882bdf9be61303f826cc3eb3338c2c716f898909`，base=`af0f3e2500e1405e05f911302e17638d2250ab64`。标题：perf(moe): optimize GLM5Next 300B routed token merge and enable T32。
- 已读 torch_zeus CLAUDE、triton_shared AGENTS/AGENTS.local/CLAUDE、语言规则、Claude memory 索引、PE/MAC 利用率技能。业务仓库不修改。
- 定位并阅读 `triton_shared/docs/glm5next300b_opt/2026-09-01-moe-ffn-flow-visual-guide.html`，SHA256 `f6558a5e7e97283bdc722b816f406fecbec1e163ffd44de285e3d41ddc146936`。它保留旧 UScale、独立 prequant、`[2,T,8,H]` 的路线；不能替代 PR588 当前 per-tensor 单输出 `[T,8,H]` 合同。
- 定位并阅读 `triton_shared/docs/2026-10-21-moe-tp16-hierarchical-vs-tp4-ep4.html`，SHA256 `8ce280c8c9e32412e4240708e37fb7c5e56cfcb65369d1e4789153d194afbab5`。其中 TP16 是方案推演，不是已完成部署或性能排名。
- `torch_zeus/docs/moe_grouped_gemm_deep_dive.md` 与 `docs/moe_pipeline_overview.md` 是 GLM-4.7/H5120/E160 历史教学文档，只用于识别 grouped GEMM 表达差异，不移植成 GLM5Next300B 参数。

<a id="topology"></a>
## 拓扑、模型和调用边界

冻结 zeus_dev 上的精确文件：

- [config_next.json](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/configs/config_next.json)：H4096、MoE I2048、288 routed、1 shared、top8、sigmoid、normalize、factor2.5、clamp10；45层、前3层dense。
- [TP4EP4 config](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/full_model_test/config/test_300b_fp8_in_h20.py)：TP4、EP4、DP4、world16。DP4 是 Attention overlay，不再乘出64。
- [dev_moe_fused_fp8_tp4_ep4.py](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_moe_fused_fp8_tp4_ep4.py)：rank 映射、prepare/forward、Shared ownership；1795–1802 行 TP all_reduce 后 EP board_replicated_reduce_scatter 位于本地四算子之外。
- [TP1EP16 config](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/full_model_test/config/test_300b_fp8_tp1_ep16.py)：固定 SGLang `24b63fa7724453270bd7c15fb4709850ff7ee995`、torch_zeus `0e7bae095069e8d18c093719c71531e0cea7394e`。有兼容配置不等于 PR588 全链已在该拓扑验收。
- 历史对比 `triton_shared/docs/glm5next300b_opt/2026-09-10-tp4ep4-vs-ep16-pe-conv.md`，SHA256 `e819ff4e4d8ceca4b30c771e6513d4d51193daa1e819a2dec05a951288fe94dd`。该文的 TP1 双核各 I1024、UScale 小 dot 次数属于当时版本，不套给 PR588 per-tensor。
- 当前库 per-tensor pack 支持 local-I512/E≤72、I2048/E≤18，merge 只在规定的 I512/T16/24/32等守卫内启用；这不证明 TP1EP16 caller、Shared ownership 和 collectives 均已改用新路径。

<a id="router"></a>
## Router

[PR588 Router](https://github.com/DarronTam/torch_zeus/blob/882bdf9be61303f826cc3eb3338c2c716f898909/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_router_linear_biased_topk.py)：

- `router_reciprocal` 用 rsqrt 平方，保留零分母语义，不把 LUT 数值当精确实数除法。
- `sgl_moe_router_quad_kernel_bf16` 约246行起：BF16输入/weight，FP32 dot 后 BF16 logits；fast sigmoid 64段；selection=scores+bias；selected raw weights 从无 bias scores gather，FP32 sum/normalize/scale，最终 BF16输出。
- padded bias 的物理尾项是有限负 sentinel；pack ABI=2；bias指针/版本在 Graph 前准备，capture 内不能偷偷分配或修缓存。
- `T` 是 kernel实际token行数。矩阵乘有效 FLOPs=2THE，逻辑权重2EH字节，不包含 padding、双核副本与重复遍历。

<a id="shared"></a>
## BF16 Shared

[PR588 Shared](https://github.com/DarronTam/torch_zeus/blob/882bdf9be61303f826cc3eb3338c2c716f898909/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_shared_expert_silu_down_tp4.py)：

- T8/16/24/32、H4096、local-I512的已限定 profile：Gate tile M8，Down按M4分段，N4096；每核I256。T4、decode、tail有其他选择，不能外推同一profile。
- Gate/Up projection有BF16舍入，Gate只做上截断，Up双侧截断；fast sigmoid后乘Gate与Up、BF16激活、Down FP32 dot、BF16 partial。
- 约356–426行：沿M拆Down及完整VP行链，不切K累加；连续parent中的两核输出约定保持。
- 两核 Shared 输出 `[2,T,H]`，每rank完整Shard纯BF16矩阵12MiB，每核6MiB；不是旧FP8 Shared的6.09375MiB含scale口径。

<a id="routed"></a>
## Per-tensor Routed 与 token merge

[PR588 Routed](https://github.com/DarronTam/torch_zeus/blob/882bdf9be61303f826cc3eb3338c2c716f898909/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_grouped_gemm_silu_down_fp8_per_tensor.py)：

- `_owner_activation_rows`：当前合并路径分别发Gate和Up投影，以Gate非线性覆盖独立Up PE窗口；不是所有路径都用一个concat GU dot。
- 输入 BF16→FP8 E4M3FN，fixed activation scale1；每expert三projection weight scales；FP32投影×scale→BF16→FP32；I512使用固定非均匀SiLU LUT；激活BF16→FP8；Down×scale→BF16。
- `_owner_planned_group` 从本次设备IDs分类；expert奇偶owner，每核36个I512专家；M1/M2/M4桶，3行可补到4行；T32以两个16bit半字保护位图精确性。
- `_owner_scatter_batch` 将结果写回原token/slot；重复slot均写回；padding不产生store。合并行并非把不同token激活相加。
- wrapper约1684行起：输出是未乘路由权重的BF16 `[T,topk,4096]`，非本地行undefined；merge默认仅T16/24/32、I512/top8及owner条件；static expert map走原路径；host不读取设备IDs。
- `_owner_down_rows` 与Gate/Up是独立minitile设置；源码选项与SRAM headroom按launch隔离。当前tile M和内部w都须核对，不能只由外层batch猜复用率。

<a id="reduce"></a>
## Reduce 与数值结合次序

[PR588 Reduce](https://github.com/DarronTam/torch_zeus/blob/882bdf9be61303f826cc3eb3338c2c716f898909/sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_reduce_sparse_fast.py)：

- 当前快路径SOURCE_CORES=1、SHARED_SOURCE_CORES=2；local Routed没有双核partial维。
- 双核各拥有完整token行；HALF为该核token块的一半，A/B两组FP32累加器形成软件流水。名字/形参中的旧BLOCK_H不能当成该路径实际按H分核。
- Shared-first FP32初始化、按slot递增添加route×weight、最后BF16输出。无Shared按相应守卫跳过。
- min/max本地slot范围用于连续DMA；其中洞可能含NaN/Inf，只有有效mask行进入算术。logical valid bytes不是实际DMA跨度。
- T32 Shared按半块staging避免512KiB压力；out-of-place、lifetimes与completion约束不可由“公式能融合”取代。

<a id="communication"></a>
## 通信合同与模型

[zeus_dev _support/_comm.py](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/_support/_comm.py)：

- BoardReplicatedAllgather.n16-b4 和 BoardReplicatedReduceScatter.n16-b4固定world16、每board4rank；lane为[l,l+4,l+8,l+12]。
- TP先合齐同expert I切片；EP再合不同expert贡献并把T行分成4片。T24时每片6行。
- 教学ring模型 `AllReduce:2(p−1)α+2(p−1)/p·S/β`、`ReduceScatter:(p−1)α+(p−1)/p·S/β` 仅为理想p-rank ring，每rank发送量口径；不是ZECL算法实际链路包数或时延。
- [NCCL collective定义](https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/usage/collectives.html)与[Triton grouped GEMM教程](https://triton-lang.org/main/getting-started/tutorials/08-grouped-gemm.html)于2026-10-24浏览，作为一般机制的一手出处。文中不搬用其性能表。

<a id="nv"></a>
## NV 对照：两种样本绝不能混用

### 代表性真实 decode 的27个观测

已读历史冻结归档的 `README.md`（SHA256 `46270d3756d0f2e4e18a8ee94b235a12c95ec310a9ec7657d87697bc3134241d`）、`report/summary.json`（SHA256 `e2de90915cd74f0b66fac9b997d64e267b89f376109b920eed3be9a1df07528a`）。归档名 `moe-pr588-real-decode-20261022`；公开网站只保留结论和hash，不复制原始checkpoint或输入。

- 3请求组×T16/24/32×decode1/4/16，4K上下文；每T九观测等权均值；请求相关，跨T生成history并非全部相同，不能当严格仅改变batch的伸缩曲线。
- NV原生SGLang `1208155c6091537e10e3870ab085b3eaa31c6fa0`，四H200、模型TP4，MoE expert-TP1/EP4，每EP72完整I2048专家，Shared TP4 I512。
- NV每样本4rank×10轮CUDA Graph，每层每轮max-rank后取min10，累加42层；kernel duration预算包括双stream重叠，且各层最快轮次可不同，不能当真实跨42层wall或整模TPOT。
- Zeus 16逻辑rank×双核、400MHz；双核duration取max，同rank完整链求和后选慢rank，再累加层；通信/host/JIT/pack排除。
- 三档Zeus/NV均值ms：4.665073/6.104015、6.150687/6.852949、7.972748/7.160180。
- T24四组件Zeus/NV(ms)：Router .680820/.591106；Routed 3.159819/5.208906；Shared .793384/.834758；Reduce 1.516663/.218179。Routed+Reduce=4.676482/5.427085。Shared列属于各层已选完整路径，不是独立EP0 Shared所有层之和。
- NV Routed含本地EP映射、sort、quant、GateUp、SwiGLU、Down与route-weight；Zeus route-weight位于Reduce。NV Routed block128×128 FP8、Shared FP8、route weights FP32；Zeus Routed per-tensor FP8、Shared BF16、weights BF16。不是同数值指令的纯硬件A/B。
- 原summary保留diagnostic_only=true、performance_baseline_accepted=false及#592一次参考失败。后来#588修参考并只补测原反例，未重跑18144项或NV；不可悄悄把原诊断矩阵改写成新全量PASS。
- NV代码冻结：`fused_moe.py` SHA256 `a4dae2b2e2e53a92b65fe67c1462ef9960e515c2181bd79634d7e0cd31d5c35e`，`fused_moe_triton_kernels.py` SHA256 `d5c44835c15d5c24e3ed9bb38d78c4995b106df9d4a89e8866b3d98f581d0e28`。真实FP8通用kernel的route乘法在约598行；310行属于另一GPTQ/AWQ kernel，不作为FP8路径单独证据。Down caller约599–633行传入乘权开关。
- [PR588公开元数据入口](https://github.com/DarronTam/torch_zeus/pull/588)及[原数值修复记录](https://github.com/DarronTam/torch_zeus/blob/882bdf9be61303f826cc3eb3338c2c716f898909/dev_docs/evaluations/moe_issue592_20261022/README.md)连接该归档的后续状态。

<a id="reuse"></a>
## 历史权重请求模型：CUDA M64 与 Zeus w4

`triton_shared/docs/2026-10-19-zeus-moe-weight-reuse-and-h200-traffic-analysis.md` SHA256 `96b7734e916d434096d734db90234d23478985650a64710e71cacc07760371a1`。

这是较早的H200 **TP4** 源码/编译产物审计，不是上一节NV expert-TP1/EP4的相同数值路径。GateUp(M,4096,1024)、Down(M,512,4096)，每TP slice纯FP8权重6MiB。CUDA CTA M64/N128/K128、4warps/3stages；每K阶段16KiB权重tile服务M64窗口，无需把6MiB整专家塞进shared。

同PR567的T16/top8、42层真实路由：5376 routes、跨层不同专家数之和1471；CUDA M64请求模型34.4765625GiB、旧M1模型126GiB、固定M4/w4模型50.5078125GiB，三者均是四个TP slice合计的FP8 weight payload。没有本轮HBM/MC counter实测；PR567输入是Zeus eager step0，不能因存于GPU服务器便叫CUDA输入捕获。当前PR588也不是旧M1实现。

可复用的机制：同一w窗口内WL1 FIFO重放不等于重复外存读取；跨W窗口重新遍历可产生重复请求。M16/w4的四遍模型，不等于M16必然四倍延迟。M/w、AL1驻留、输出容量与minitile设置共同约束。

<a id="arithmetic"></a>
## 教学计算身份与待验证事项

所有新章用MiB=2²⁰B、KiB=2¹⁰B，FLOPs按一乘一加计2。固定例H4096、I2048、T24、K8；TP4本地I512。

- 纯FP8专家24MiB；TP4每专家slice6MiB；EP4每rank72slice=432MiB。TP1EP16为18×24MiB=432MiB；TP16EP1为288×1.5MiB=432MiB。均排除scale、packing、复制和Shared。
- 理想均匀route数/排名：48、12、192；每route-local有效FLOPs分别6H×512、6H×2048、6H×128；总量相同。M_e是某expert命中token数，不因TP自动除4。
- T24 Router输入192KiB，逻辑router weight2.25MiB，logits BF16 13.5KiB，IDs768B、weights384B；忽略padding/副本/中间物化。
- T24 Routed输出容量1.5MiB，均匀48有效行的payload384KiB；Shared两plane384KiB、final output192KiB。EP0有效读写最低payload960KiB、无Shared576KiB，仅针对Reduce数据接口、不含跨度洞/重载/metadata。
- K8本地slot0和7仅16KiB有效行，但连续跨度64KiB；NaN洞不能乘0后加入。
- 以n_e=5,3,1的教学grouped GEMM例，9条route、当前M≤4式分组4个窗口、10执行行；M1 9窗口/9行，M64 3窗口/192行。payload、padding与时间不能互换。

<a id="validation"></a>
## 本轮独立复核结果

新增文件包含7章、49节、35组问答、14张原创内嵌SVG。章节正文剥除标签后约2.25万字符，其中约9200个汉字，另含公式、shape、源码标识符、表格与数值。章节ID与其他content文件无冲突。

- 使用独立Python算式重新计算三种world16拓扑的432MiB/rank容量、603,979,776 FLOPs/rank及288MiB逐route载荷；核对Router逻辑/计算/packing三种宽度与T24六遍prefix请求模型。
- 验证Shared二通道实数算例输出约为[-0.15153137096,1.15905441534]；此验证只检查代数，不模拟BF16或LUT。
- 重算M4 Routed的50,331,648 FLOPs、6MiB权重与8 FLOP/B；Reduce的960KiB最低payload、0.5 FLOP/B；ring每rank发送288/144/144KiB；board命中期望3.599548/6.452488。
- 重算历史34.4765625/126/50.5078125GiB，确认四个TP slice的统一分母；逐项重加真实T24 duration，得到6.1506866666/6.852949ms，Reduce组件比值6.95148，合计预算相对低约10.25%。该计算不改变原归档的诊断状态与数值路径差异。
- JSON解析、章节/section/question ID唯一性、现有ContentCheck、所有本地证据锚点、14张SVG XML解析与viewBox元素边界检查通过。SVG均自包含，不依赖远端图。
- 自审发现Shared时间轴早稿把Down框画在该组activation完成之前；已调整为Gate→Up→VP activation→对应Down→store，并保留低组Down/高组VP、低组store/高组Down合法窗口。图不是真实trace。本轮未自动化浏览器截图验收，页面整体布局由主任务集成检查。
- 两名独立审查者发现最后一章两节只有首条公式：构造内容时多余参数被helper忽略。已恢复Roofline有效/执行行完整对照与并发/模型演进段，明确M_exec、M_valid、F_exec与F_useful；追加全部49节正文长度检查，最短268字符，未发现其他同类截断。
- 修订后二人均readback关闭上述P2。算法审查者复算Shared、分组、ring及恢复后的AI/KV公式；硬件审查者读完49节，并用PR588冻结源码额外核对Reduce的单plane/完整H/slot升序/NaN guard、Shared沿M拆Down、Router compute64对齐前缀。范围内无剩余P1/P2。多窗口AI公式补充M_exec/M_valid按全部窗口合计，防止分母与分子范围错配。

以上验证均为内容与算式检查；没有产生新的设备、模拟器、RTL、CUDA、模型精度或端到端性能结果。
