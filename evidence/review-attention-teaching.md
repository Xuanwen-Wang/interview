# Attention 全篇教学重写与动画验收

日期：2026-10-25。承接两篇 HTML 的合并版本，本轮重写的是整篇 Attention，仍保留 `attention.html`、24 节、8 个阅读阶段和全部旧锚点。FFN 继续使用独立 `ffn.html`。本文记录教材与网页验证，不是模型、GPU、CycleSim 或 VCS 性能验收。

## 教学合同

每种机制从问题背景进入，说明新增对象、真实数据 shape、计算顺序、可复算小例、节省项、新增代价与 decode kernel 启发。按设计轴区分模型变化和执行优化，不把它们画成必然依次取代的版本链。

- MHA / MQA / GQA：KV 共享程度、表达约束、真实组映射、保留的 QK/PV 工作、布局和 TP 下的物理复用条件。
- RoPE：Q/K head RMSNorm、split-half 配对、频率与位置广播、二维旋转、相对内积、当前 K 追加和历史 K 读取、融合成本。
- FlashAttention：朴素 prefill 方阵的容量与逻辑搬运、片上分块、每行 m/l/u、mask、空块、有限精度，以及 FA1 与 FA2 的不同工作划分。
- Flash-Decoding：Qlen=1 后的任务不足、沿 KV 位置切片、partial O/LSE 质量加权、workspace、合并与调度代价；完整 KV 仍被覆盖。
- MLA：学习出的联合 latent、解耦位置项、同模型展开与吸收两种求值；低带宽可以伴随更宽点积。仅实数代数等价，不承诺逐 bit 相同。
- DSA：索引选择与主 Attention 重新打分、ID 到地址、TopK、gather、保留历史和遗漏信息的质量代价。
- Linear / Delta / KDA：带分母的特征注意力、固定矩阵、误差写入、按 key 轴遗忘、状态依赖、短卷积和完整输出链。
- 混合结构：各层长期状态分别相加；显式历史层仍随 N 增长。Attention、FFN 与残差连接是不同维度。

## 本轮重新核验的一手来源

| 来源 | 版本 / 范围 |
| --- | --- |
| [Qwen3-8B config](https://huggingface.co/Qwen/Qwen3-8B/blob/b968826d9c46dd6066d109eabc6255188de91218/config.json) | b968826d：H4096/Q32/KV8/d128/36层，theta=1000000，rope_scaling=null，eps=1e-6 |
| [Qwen3 模型定义](https://github.com/huggingface/transformers/blob/50e35cc0ca18ec19b80653690de553e6decf74f5/src/transformers/models/qwen3/modeling_qwen3.py) | 50e35cc0：head Norm→RoPE→cache，split-half与广播，输出投影及残差 |
| [RoFormer](https://arxiv.org/html/2104.09864v5) | v5：旋转与相对位置；具体数值、缓存地址反例为本文独立构造 |
| [MQA](https://arxiv.org/abs/1911.02150v1)、[GQA](https://arxiv.org/html/2305.13245v3) | 增量推理带宽动机、分组共享与质量取舍；没有转引性能倍数 |
| [FlashAttention](https://arxiv.org/html/2205.14135v2) | 第一篇论文的 v2 修订稿；IO-aware tiling、online softmax与重算 |
| [FlashAttention-2](https://arxiv.org/html/2307.08691v1)、[作者说明](https://crfm.stanford.edu/2023/07/17/flash2.html) | query/warp工作划分、减少非矩阵计算；与第一篇论文版本号分开 |
| [Flash-Decoding 作者说明](https://crfm.stanford.edu/2023/10/12/flashdecoding.html) | 位置分片、partial结果与log-sum-exp归约；没有把论文硬件收益移植为本教程实测 |
| [DeepSeek-V2](https://arxiv.org/html/2405.04434v5) | v5：联合压缩、解耦RoPE、真实维度、两种求值与位置扩展边界 |
| [DeepSeek-V3.2](https://arxiv.org/html/2512.02556v1) | v1：indexer、TopK、主模型重打分、索引与主注意力复杂度分开 |
| [Transformers are RNNs](https://arxiv.org/html/2006.16236v3) | v3：特征核的累计矩阵与归一化向量 |
| [DeltaNet](https://arxiv.org/html/2406.06484v1)、[Gated Delta Networks](https://arxiv.org/html/2412.06464v1)、[Kimi Linear](https://arxiv.org/html/2510.26692v2) | 误差写入、遗忘、按通道门控、完整子层与chunk/recurrent区别 |
| [内部 next 配置](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/configs/config_next.json)、[KDA runner参考](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_linear_attn_fused_tp4_dp4.py) | 05ee10f9：尺寸、卷积/激活、Q/K L2Norm、Q的1/√128缩放、状态与输出门；只读源码，没有运行模型 |

## 可复算锚点

所有容量以逻辑元素计，BF16=2 B、FP32=4 B，乘加计2 FLOPs。GiB/MiB是二进制单位；真实设备传输还受缓存、事务粒度、布局与重复读取影响。

- Prefill：Q32/N4096的每张S或P整方阵，BF16为1 GiB；N32768为64 GiB。各写读一次分别4/256 GiB逻辑中间流量；这不是同时存活容量，也不是decode每步的N²表。
- Flash tile 64×64、d128：Q16 KiB、KV32 KiB、可复用score16 KiB、u32 KiB、m/l0.5 KiB，共96.5 KiB逻辑工作集；不是shared-memory分配值。
- Flash数例：scores=[0,ln3,ln2,ln4]，V=[[2,0],[8,2],[4,6],[10,4]]。两块online得到m=ln4、l=2.5、u=[18.5,8.5]、O=[7.4,3.4]。
- Flash-Decoding数例：partial O=[6.5,1.5]与[8,14/3]，LSE=ln4/ln6，合并质量0.4/0.6。直接平均错误。Q32/d128的2片FP32 O/LSE workspace为32.25 KiB，8片为129 KiB，逻辑完整写读为各自两倍。
- RoPE：Qwen pair i32频率0.001；给定head Norm后的pair q=(1,2)@p1000、k=(2,1)@n500，旋转后内积贡献2.072053631748882。共同平移位置保持该固定内容pair的贡献。新K_p与当前Q_p都用p，旧K_n不再旋转。
- Norm/RoPE/K-append局部融合：在明确不计V、gamma、cos/sin、投影的边界下，逻辑中间读写44→20 KiB；不是整个Attention流量。
- MLA同模型展开/吸收：C=[[1,2],[3,1]]、AK=[[1,0],[1,1]]、AV=[[1,2],[0,1]]、q=[2,1]，两路径score=[8,9]，输出约[2.462117,6.193176]。独立标注为无位置项、scale=1的代数例。
- MLA真实维度：N4096的展开内容+共享位置key为256.5 MiB，紧凑内容+位置key4.5 MiB；N32768紧凑36 MiB。两种主点积/汇总账为335,544,320与1,140,850,688 FLOPs，不含两端映射。
- 特征线性例：S=[[2,1],[4,3]]、z=[1,1]、q=[1,2]，输出[10/3,7/3]，与同scores的exp-softmax不同。
- 状态例：S=I、k=[1,0]、v=[3,4]、beta=.5；Delta得[[2,2],[0,1]]；先按alpha=[.5,1]遗忘再更新得[[1.75,2],[0,1]]。当前q=[0,1]输出相同，下一q=[1,0]暴露差异。
- 内部KDA教学BF16：每层S2 MiB，卷积历史144 KiB，34层72.78125 MiB；Q/K/V/O四投影权重256 MiB。固定状态不消除投影权重与门的成本。

## 实现与验收

- `web/attention-lab.js` / `.css`：七种实际步骤与数字变化的可交互演示，支持前后、重置、播放暂停、步骤直达、键盘；播放由用户启动。页面切换、隐藏、离开可视范围与打印时停止计时器。
- 打印展示完整步骤、公式和最终静态图；离线 HTML 内嵌脚本与样式。动画不是GPU时间或设备测量，不用装饰性进度代替数据流。
- `scripts/check_attention_lab.js`：独立softmax oracle、所有玩具连续分块与乱序分区、100组不同形状、±1000平移、LSE加权、屏蔽块/整行、短尾、RoPE范数与相对位置、Delta/KDA仿射oracle和多步状态。
- 人工与独立复核修正：KDA的Q缩放；MLA实数等价与实际scale/YaRN边界；Flash的K→QK与KV→split依赖连线；RoPE动画区分当前新K_p和历史K_n。

最终正文为24节、8阶段、25张静态SVG、7类逐步动画、12道追问；全站41章、399节、296道追问、130张正文SVG。验证结果：

- 构建与静态检查通过；全部SVG XML、所有web JavaScript语法、旧链接/来源路径与独立HTML内嵌一致性通过。
- 新增Attention独立数学oracle及既有decode、PE、MoE、性能分析模型检查均通过。
- 既有实际浏览器59项回归全部通过，包括12个旧章节/87个内容锚点、笔记迁移、搜索、B/N交互、移动页面、打印及两篇离线阅读。
- 新增111项联调覆盖七类动画所有步骤、前后/重置/键盘、390px各帧无整页横向溢出、播放/暂停、导航与打印停播、reduced-motion、岗位/性能页面保留、Flash-Decoding搜索、离线七动画。初跑110项通过；RoPE共同平移的测试误选缓存帧而非内积帧，修正测试目标后，在正确内积帧对0/100/500三种平移分别复核通过。修正不涉及数学实现。
- 补充5项定点检查全部通过：三种RoPE位移、最终新旧K双路手机帧、所有最终静态SVG文字边界。人工查看Flash tile、Flash-Decoding、RoPE、Delta/KDA截图，依赖连线明确。
- 实际A4 PDF共64页，七个动画各自打印完整步骤与最终静态图；屏幕控件在打印版隐藏。所有步骤的PDF内容可检索。
- 不提交浏览器状态、截图、PDF、临时测试脚本或缓存；网页不依赖外部字体、脚本或服务。

以上为本地教材与网页验收，发布状态另由GitHub Actions成功与线上文件/浏览器读回确认。
