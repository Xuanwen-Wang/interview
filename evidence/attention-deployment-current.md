# DSA / KDA 当前部署与 kernel 证据

采集日期：2026-10-25（Asia/Shanghai）。仅审读源码与独立计算字节；本轮没有运行 compiler、kernel、CycleSim、VCS、RTL 或生产模型。

## 版本获取与读取边界

- GitHub App 对两个业务仓库均返回 404；使用已有 `gh api` 授权读取仓库默认分支和对应提交。
- `DarronTam/torch_zeus` 默认分支 `master`：`3656952bfee88b1d5f7b68d0e724e54a7a5353d7`，提交时间 `2026-10-24T05:33:45Z`（合入 PR600）。
- `bjxx-algo/zeus_dev` 默认分支 `main`：`05ee10f9cc25d19fca0a144ae095c79b3a888976`，提交时间 `2026-10-21T05:32:55Z`（合入 PR133）。
- 本地 torch 工作树 HEAD 为 `68f19fa0a159b8ff861dc9cf736d9c0ae64906ba`，未将其视作最新实现。最新提交对象已经存在，使用只读 `git show <full-sha>:<path>` 提取所需文件。没有 fetch/pull 或修改业务 `.git`。zeus_dev 本地 HEAD 与本次远端默认分支一致。
- 两个业务工作树均存在未跟踪研究/说明文件，初查无 tracked 修改；当前事实只取固定提交中的 tracked bytes。torch 本地 CLAUDE.md 是操作指导，不作为当前 runtime/算法事实来源。
- 网站变更发生在独立任务工作树；原 interview 目录和业务源码均未修改。仅上传教材及来源索引，不复制业务源码全文、凭据、个人目录、内部主机或原始张量。

## 核心核验结论

1. 内部 `config_next.json` 是 H4096、45主层、34 KDA + 11 DSA（0-based DSA层3,7,…,43），与公开模型名称不等同。DSA latent512、q_lora1536、主head64×256、index32×128、kpool4、index_topk2048；KDA head64×128、conv4、安全gate下界-5。
2. DSA开发入口 `RankLocalDSA.forward_zeus` 是P1→AG4→P2→AG4→P3→AG16。rank=4dp+cp；四token pool轮转CP。P1主query每CP16heads，P2使用四份查询共64heads；默认GDG不是目录里的显式LDG/CP8实验。
3. P3本地[C,1024]是flatten([C,4096])的CP-owned连续区间[cp·C·1024,(cp+1)·C·1024)，不能读作所有token固定1024列。AG16后视图[4,C,4096]。
4. **当前KDA版本断点**：zeus_dev `forward_partial_zeus:573–576`显式传v3.1；最新torch `_require_fused_kda_version:49–55`只接受v4_gdg/v4_ldg（v4映射v4_gdg），`fused_kda_decode:1543`先检查版本。因此最新两主分支的现有调用组合会在源码所示门禁拒绝。这是静态推断，不伪造本轮错误日志，不声称生产回归已通过。
5. KDA TP4/DP4是开发runner既有拓扑：DP分请求，TP分heads，每rank16heads、每core8heads。TP SUM输入是hidden partial；board-replicated gather拼接不同DP请求，不交换rec/conv状态。最新v4机制必须和既有runner拓扑分层讲解。
6. 当前KDA真实代码由core0计算并发布全部gproj（约523–531）；顶层附近仍写core1的旧注释不作为事实。当前history写回已前移到只读taps/group_x加载后；旧注释里“等所有pair计算后”由后续实现与H1注释更新。
7. KDA v4不是仅末尾一次BF16窄化：alpha·k、outer update、next_state和output输入均有明确端点，aggressive-vp-chaining是recipe的一部分。实数decay-last等价不证明逐位等价或长期精度。GDG完整state与两个LDG owner pools的ABI分开，不声称每步隐式copyback。
8. `validate_cache_indices`是显式host工具；`fused_kda_decode`检查元数据/alias但没有每launch调用它读回indices值。有效性、唯一slot和跨调用无竞争依旧是调用者合同。

## 独立字节核算

令C为DSA runner input_rows，P为P1物理容量（legacy B1时P=2、C=1），R为FP32 score pitch：W1=P·(16·512·2+R·4)，W2=C·64·512·2+4096，W3=C·1024·2。W1、W2是AG4单rank输入，W3是AG16单rank输入；输出缓冲分别4W1、4W2、16W3。不能当物理链路总发送字节。

| 准备形态 | W1 | W2 | W3 | 最终[4,C,4096] |
|---|---:|---:|---:|---:|
| legacy B1 | 65536 B | 69632 B | 2048 B | 32768 B |
| legacy B4 KC6272 | 131072 B | 266240 B | 8192 B | 131072 B |
| legacy B6 KC6272 | 196608 B | 397312 B | 12288 B | 196608 B |
| bucket B6 KC65536 | 294912 B | 397312 B | 12288 B | 196608 B |
| bucket B8 KC65536 | 393216 B | 528384 B | 16384 B | 262144 B |

- KDA每请求rec为16·128·128·2=524288 B=512KiB；一读一写逻辑流量1MiB。conv history为3·6144·2=36864 B=36KiB，读写各一次共72KiB。
- KDA两个value slabs/head，每slab64·128·2=16384 B；不是整rank所有state同时在SRAM的证明。
- KDA QKV权重6144·4096·2=48MiB，O权重4096·2048·2=16MiB；只两矩阵每有效token67,108,864 FLOPs（FMA=2）。不含低秩门、padding与实执行量；不推断每token实际读权重量。
- KDA B6时每rank[B,4096] BF16=49152 B=48KiB；board gather返回4倍=196608 B=192KiB。state字节与跨TP字节不可混算。

## 固定源码索引

每个锚点的行范围均在 `git show` 的原始文件上检查；10个不同文件的SHA256从固定提交内容计算。原仓库权限独立，公开教材链接不会授予源码访问权限。

<a id="ad-config"></a>

### ad-config · 内部 next 模型维度及 34 KDA/11 DSA 层号

- 仓库：`zeus_dev@05ee10f9cc25d19fca0a144ae095c79b3a888976`
- 位置：`model_state_dev/glm5next_modules/configs/config_next.json:1–150`
- [固定来源](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/configs/config_next.json#L1-L150)
- 文件 SHA256：`1d7f3567e84516a4465ae6fa9e0cb0424acfa059c12e75e93beea2ca07da37dc`

<a id="ad-dsa-topology"></a>

### ad-dsa-topology · 四 token pool 的 CP 轮转与物理页

- 仓库：`zeus_dev@05ee10f9cc25d19fca0a144ae095c79b3a888976`
- 位置：`model_state_dev/glm5next_modules/dev_dsa_deepfused_cp4_dp4.py:145–244`
- [固定来源](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_dsa_deepfused_cp4_dp4.py#L145-L244)
- 文件 SHA256：`23e10c5ff491d75c87147ffe261518305e01dfd9e77c468711d1a3caaf467e98`

<a id="ad-dsa-runner"></a>

### ad-dsa-runner · 三计算/三通信，wire 与最终输出视图

- 仓库：`zeus_dev@05ee10f9cc25d19fca0a144ae095c79b3a888976`
- 位置：`model_state_dev/glm5next_modules/dev_dsa_deepfused_cp4_dp4.py:250–336`
- [固定来源](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_dsa_deepfused_cp4_dp4.py#L250-L336)
- 文件 SHA256：`23e10c5ff491d75c87147ffe261518305e01dfd9e77c468711d1a3caaf467e98`

<a id="ad-dsa-oracle"></a>

### ad-dsa-oracle · 独立 CP 候选集合、slot、P2 O/LSE 与最终拼接参考

- 仓库：`zeus_dev@05ee10f9cc25d19fca0a144ae095c79b3a888976`
- 位置：`model_state_dev/glm5next_modules/dev_dsa_deepfused_cp4_dp4.py:413–476`
- [固定来源](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_dsa_deepfused_cp4_dp4.py#L413-L476)
- 文件 SHA256：`23e10c5ff491d75c87147ffe261518305e01dfd9e77c468711d1a3caaf467e98`

<a id="ad-dsa-export"></a>

### ad-dsa-export · 默认 GDG 三阶段导出，LDG 独立显式导入

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/dsa/__init__.py:1–33`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/dsa/__init__.py#L1-L33)
- 文件 SHA256：`7eeb2a39527e73881e66b24cbe6d43fc0aab9907c474dc9f360762fc1f7acd37`

<a id="ad-dsa-p1-math"></a>

### ad-dsa-p1-math · P1 RMSNorm、BF16 查询、latent 量化及 query absorb

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_proj_indexer_topk1.py:735–928`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_proj_indexer_topk1.py#L735-L928)
- 文件 SHA256：`482456c4a737ff51a62ff76d4c9a553f7ee156d72e8968c14ac69b2c60a00bde`

<a id="ad-dsa-p1-owner"></a>

### ad-dsa-p1-owner · 每 CP 16 个 query heads、每 core 8 heads 与复制 indexer 权重

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_proj_indexer_topk1.py:5272–5323`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_proj_indexer_topk1.py#L5272-L5323)
- 文件 SHA256：`482456c4a737ff51a62ff76d4c9a553f7ee156d72e8968c14ac69b2c60a00bde`

<a id="ad-dsa-p1-wire"></a>

### ad-dsa-p1-wire · metadata 更新、有效前缀、raw 模式判定

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_proj_indexer_topk1.py:6039–6102`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_proj_indexer_topk1.py#L6039-L6102)
- 文件 SHA256：`482456c4a737ff51a62ff76d4c9a553f7ee156d72e8968c14ac69b2c60a00bde`

<a id="ad-dsa-p1-prepare"></a>

### ad-dsa-p1-prepare · legacy B1、large KC 与普通 bucket 的 P1 wire 几何

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_proj_indexer_topk1.py:6123–6311`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_proj_indexer_topk1.py#L6123-L6311)
- 文件 SHA256：`482456c4a737ff51a62ff76d4c9a553f7ee156d72e8968c14ac69b2c60a00bde`

<a id="ad-dsa-p2-select"></a>

### ad-dsa-p2-select · TopK2 raw/candidate 分支、非负充分性证明、B1 双核分工

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_topk2_gather_attn.py:1584–1714`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_topk2_gather_attn.py#L1584-L1714)
- 文件 SHA256：`82cd68c0167dab29eb875cae661764a04ffa4244309607f909114d7523f2337f`

<a id="ad-dsa-p2-attn"></a>

### ad-dsa-p2-attn · 640-row helper、128-row gather、QK/PV、online softmax

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_topk2_gather_attn.py:13–449`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_topk2_gather_attn.py#L13-L449)
- 文件 SHA256：`82cd68c0167dab29eb875cae661764a04ffa4244309607f909114d7523f2337f`

<a id="ad-dsa-p2-prepare"></a>

### ad-dsa-p2-prepare · direct wire strides、528-byte pool、compact banks 与 opt-in 门禁

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_topk2_gather_attn.py:2292–2556`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_topk2_gather_attn.py#L2292-L2556)
- 文件 SHA256：`82cd68c0167dab29eb875cae661764a04ffa4244309607f909114d7523f2337f`

<a id="ad-dsa-p3"></a>

### ad-dsa-p3 · LSE 合并、V 投影、共享 MID、输出 flat ownership

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_absorb_proj.py:23–406`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_absorb_proj.py#L23-L406)
- 文件 SHA256：`479de60bde10957a853f9879eb4005c1310dc75eedd5c28650222e55246f401e`

<a id="ad-dsa-p3-host"></a>

### ad-dsa-p3-host · 输出 pack/shape 和 CP-owned flat gather 入口

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_absorb_proj.py:707–807`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_absorb_proj.py#L707-L807)
- 文件 SHA256：`479de60bde10957a853f9879eb4005c1310dc75eedd5c28650222e55246f401e`

<a id="ad-kda-runner"></a>

### ad-kda-runner · DP token 分片、TP head/weight/state 分片

- 仓库：`zeus_dev@05ee10f9cc25d19fca0a144ae095c79b3a888976`
- 位置：`model_state_dev/glm5next_modules/dev_linear_attn_fused_tp4_dp4.py:340–458`
- [固定来源](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_linear_attn_fused_tp4_dp4.py#L340-L458)
- 文件 SHA256：`4218bf3c00cd6d12ecf9f8d85daa298f07e64bff2d0f9be0d93123fcee64773e`

<a id="ad-kda-gap"></a>

### ad-kda-gap · 旧 runner 硬传 v3.1 以及唯一 TP SUM

- 仓库：`zeus_dev@05ee10f9cc25d19fca0a144ae095c79b3a888976`
- 位置：`model_state_dev/glm5next_modules/dev_linear_attn_fused_tp4_dp4.py:484–583`
- [固定来源](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_linear_attn_fused_tp4_dp4.py#L484-L583)
- 文件 SHA256：`4218bf3c00cd6d12ecf9f8d85daa298f07e64bff2d0f9be0d93123fcee64773e`

<a id="ad-kda-gather"></a>

### ad-kda-gather · 开发回归 TP SUM 之后的 board-replicated gather

- 仓库：`zeus_dev@05ee10f9cc25d19fca0a144ae095c79b3a888976`
- 位置：`model_state_dev/glm5next_modules/dev_linear_attn_fused_tp4_dp4.py:782–812`
- [固定来源](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_linear_attn_fused_tp4_dp4.py#L782-L812)
- 文件 SHA256：`4218bf3c00cd6d12ecf9f8d85daa298f07e64bff2d0f9be0d93123fcee64773e`

<a id="ad-comm"></a>

### ad-comm · 跨板 lane 和 BoardReplicatedAllgather 的输入/输出形状

- 仓库：`zeus_dev@05ee10f9cc25d19fca0a144ae095c79b3a888976`
- 位置：`model_state_dev/glm5next_modules/_support/_comm.py:13–114`
- [固定来源](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/_support/_comm.py#L13-L114)
- 文件 SHA256：`f8673f281fe2d0078eb7a69698d6ccc56f9b9484663062f80cebc1de8ed24dea`

<a id="ad-kda-v4"></a>

### ad-kda-v4 · 只允许 v4_gdg/v4_ldg，v4 别名映射

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py:49–68`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py#L49-L68)
- 文件 SHA256：`85a79ae8919dd93c4b0b2ca3fb5c935ba1540a1252ae686273251fb32258b96d`

<a id="ad-kda-pack"></a>

### ad-kda-pack · 本地权重形状、core slab、workspace 与 pack

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py:101–236`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py#L101-L236)
- 文件 SHA256：`85a79ae8919dd93c4b0b2ca3fb5c935ba1540a1252ae686273251fb32258b96d`

<a id="ad-kda-state"></a>

### ad-kda-state · 显式两-bank owner state、K-major conv pack

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py:240–321`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py#L240-L321)
- 文件 SHA256：`85a79ae8919dd93c4b0b2ca3fb5c935ba1540a1252ae686273251fb32258b96d`

<a id="ad-kda-input"></a>

### ad-kda-input · 本核 QKV/decay/beta，core0 发布全部 output gate

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py:435–532`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py#L435-L532)
- 文件 SHA256：`85a79ae8919dd93c4b0b2ca3fb5c935ba1540a1252ae686273251fb32258b96d`

<a id="ad-kda-conv"></a>

### ad-kda-conv · readonly taps、提早 history 写回、两 head 卷积

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py:599–734`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py#L599-L734)
- 文件 SHA256：`85a79ae8919dd93c4b0b2ca3fb5c935ba1540a1252ae686273251fb32258b96d`

<a id="ad-kda-recur"></a>

### ad-kda-recur · decay-last、BF16 中间端点和 64×128 state slab

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py:757–956`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py#L757-L956)
- 文件 SHA256：`85a79ae8919dd93c4b0b2ca3fb5c935ba1540a1252ae686273251fb32258b96d`

<a id="ad-kda-tail"></a>

### ad-kda-tail · pair 输出的 gated RMSNorm

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py:958–1000`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py#L958-L1000)
- 文件 SHA256：`85a79ae8919dd93c4b0b2ca3fb5c935ba1540a1252ae686273251fb32258b96d`

<a id="ad-kda-pairs"></a>

### ad-kda-pairs · 四个 head-pair lane、state 预取和 early tail

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py:1124–1248`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py#L1124-L1248)
- 文件 SHA256：`85a79ae8919dd93c4b0b2ca3fb5c935ba1540a1252ae686273251fb32258b96d`

<a id="ad-kda-kernel"></a>

### ad-kda-kernel · 单 launch、全局 barrier、request tile 与编译 constants

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py:1399–1512`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py#L1399-L1512)
- 文件 SHA256：`85a79ae8919dd93c4b0b2ca3fb5c935ba1540a1252ae686273251fb32258b96d`

<a id="ad-kda-api"></a>

### ad-kda-api · v4 ABI、完整 shape/alias 验证、zero batch 与调用

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py:1515–1623`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_triton.py#L1515-L1623)
- 文件 SHA256：`85a79ae8919dd93c4b0b2ca3fb5c935ba1540a1252ae686273251fb32258b96d`

<a id="ad-kda-ldg"></a>

### ad-kda-ldg · 两 core 静态分支指向不同持久 owner bank

- 仓库：`torch_zeus@3656952bfee88b1d5f7b68d0e724e54a7a5353d7`
- 位置：`sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_ldg_triton.py:1021–1132`
- [固定来源](https://github.com/DarronTam/torch_zeus/blob/3656952bfee88b1d5f7b68d0e724e54a7a5353d7/sgl-kernel-zeus-triton/python/glm53_flash/kda/sgl_fused_kda_decode_ldg_triton.py#L1021-L1132)
- 文件 SHA256：`8584c750b80b4d3e4968b363b0a204bb330cde31eb4d7ae7b76e9b4f53bd50ff`

## 覆盖与未证明项

- 新增dsa-kernel-walkthrough与kda-kernel-walkthrough，共17节、10组问答、8张原创SVG；旧章节ID和section ID保留。图为源码机制/布局示意，不是运行trace。
- DSA完整证明仍需匹配compiler、二进制、调度状态与设备验证；本文只审当前入口/关键分支，不穷举全部输入和实验variant。
- KDA v4接入当前模型runner、生产scheduler状态分配、完整45层生成质量与整层时延均未在本轮验证。源码中出现production字样不扩大本轮证据范围。
- 未使用历史性能数字充当本轮实测。后续性能对比必须固定有效B/容量bucket、history、owner分布、compiler options、warmup/capture、collective以及state数值参考。


## 交叉审查 root 部署总览

2026-10-25只读核对 `comm_token_shard.py:16–49,122–174,178–265` 与 DSA runner `:299–302`，并按上游授权修正文档：

- 修复 `glm-deployment-overview/persistent-state` 的 mHC SVG 文本被逐字符展开且超出viewBox的问题；原本22个散落text恢复两行。
- `glm-parallel-communication/replica-vs-partial` 补齐DSA总输出 `[4,C,4096]` → 本DP的 `output[dp]` / `local_output` `[C,4096]` → FLAT replicated lane切片的桥。P3未AG16的 `[C,1024]` 不满足该接口。
- KDA版本断点、DSA flat output、FLAT16 RS/AG与Batch8/padding声明已按固定源码复核；审查范围内无剩余P1/P2。本文未执行这些回归。
