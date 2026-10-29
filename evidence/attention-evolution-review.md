# Attention 演进与模型组合审查

采集日期：2026-10-30。适用正文：`content/13-attention-guide.json`。本轮是公开资料核验、教学数据流与页面更新，没有执行模型、GPU kernel 或性能实验。

## 组织与模型边界

从完整 Qwen3 GQA 基线出发，依次区分逐位置表示压缩、按距离/内容选原始位置、跨位置池化、固定形状递推状态，再比较真实模型组合。FlashAttention 与 PagedAttention 分别集中讲执行和物理存储，不当作 MLA/DSA 的替代算法。保留已有 section、stage 与旧章映射 ID；新增 `swa-window`、`compressed-history`、`deepseek-v4-composition`。历史内部配置保留为可选工程实例，不冒充当前公开模型。

`readingStages` 的顺序与 sections 一致；首页算法专题描述同步。原 MLA、RoPE、Flash、分页与固定状态推导及交互保留。V4 条目交互复用现有模型，仅新增 4096/32768 选项与可选起始值；独立 V4 篇默认仍为百万上下文。

## 固定来源

| 来源 | 版本与位置 | 本轮使用范围 |
| --- | --- | --- |
| Mistral-7B-v0.1 | Hugging Face `27d67f1b5f57dc0953326b2601d68371d40ea8da/config.json`；论文 `2310.06825v1` | H4096 / Q32 / KV8 / D128 / W4096；滚动窗口与间接感受野 |
| DeepSeek-V4-Flash | Hugging Face `60d8d70770c6776ff598c94bb586a859a38244f1/config.json` 与 `inference/model.py`；论文 `2606.19348v1` §2.3 | 43 主干层；CSA/HCA/SWA；共享 K=V、部分 RoPE、sink、输出映射 |
| Qwen3.5-397B-A17B | Hugging Face `8472618112abcbd45acbcdc58436aff4233c23f7/config.json` 的 `text_config` 与官方模型说明 | 60 层，3 个 Gated DeltaNet + 1 个 gated full Attention 重复 15 次 |
| Kimi Linear | 论文 `2510.26692v1` §4 | 3:1 KDA/MLA 与 MLA 的 NoPE；不移用 V2 的位置编码 |
| DeepSeek-V4.1-Flash | 论文 `2609.19969v1` §2.3–2.4 | 仅在展开补充中说明 CSA2 跨层复用、层级索引与 FP4 方向；不套 V4 配置 |

上述 HF 文件通过固定 revision 获取。源文件下载的 SHA256：

- V4 config：`b628e63398a645abc711d92207f8737dd8140f7a4ef1e0a5b3616019e0ddd818`
- V4 model.py：`ce962f1face79d4f633d36436576214057a7e11443c9789935e1deb5c6cd1d71`
- Qwen3.5 config：`3ae7fa89c2f7d1354096418ddaf1331e9e0898a8ca11e804fb6dbaa087efb7da`
- Mistral config：`cf25cdf4719f181d1d1d371973285d9afe9afde0d0c6a6fd48de857555ce1e0d`

已有 Qwen3、MLA、V3.2 DSA、KDA 与 Flash 的来源沿用各小节固定引用，不变更其证据范围。V4 整网来源还见 [原有架构证据](deepseek-model-architecture-sources.md)。

## 源码与教学数字的核对点

V4 `inference/model.py`：

- `get_window_topk_idxs` / `get_compress_topk_idxs`：窗口只含有效近期位置；摘要数由完整分组决定，prefill 不允许未来摘要。
- `Compressor`：r=4 时前后组重叠，8 个候选每 4 步产出一条；r=128 无重叠。门控沿位置 softmax，按特征加权池化。未完成分组另有状态。
- `Indexer`：自己的 128 维压缩 keys，选择压缩条目 IDs，而非 V3.2 的原始 token IDs。
- `MLA.forward`：类名不等于采用 V3 cache schema；实际一条主记录是共享 K=V 的 512 维向量，其中 64 维用于 RoPE。窗口与压缩 IDs 交给同一次 `sparse_attn`。输出逆旋转后分成 8 组，各组投影到 1024，再回到 H4096。
- `compress_ratios` 的 44 个元素包含末尾 MTP 条目：主干前 43 个为 2 个纯 SWA、21 个 CSA、20 个 HCA。不能将末尾元素算作第 44 个主干层。

V4-Flash 单请求、N 含当前 token 且为 128 的倍数：

| N | CSA 候选 | CSA 主输入（含 W128） | HCA 主输入（含 W128） |
| --- | --- | --- | --- |
| 4096 | 1024 | 512+128=640 | 32+128=160 |
| 32768 | 8192 | 512+128=640 | 256+128=384 |
| 1048576 | 262144 | 512+128=640 | 8192+128=8320 |

这是逻辑条目账，排除索引、压缩器状态、尾部、格式/scale、页表、padding、重复加载与通信，不代表显存或 HBM 实测。BF16 仅作为显式字节教学假设；共享 K=V 的一条 512 维记录不再乘两份。V4 参考实现的 fake quant 与实际生产存储格式不能直接互代。

Mistral 的 N8192、W4096 教学运行：BF16 K+V 从 32 MiB/层变为 16 MiB/层；QK+PV 从 134217728 变为 67108864 FLOPs（每乘加 2 FLOPs）。N≤W 不裁合法位置；不能只添加 mask 就宣称 dense kernel 跳过了窗口外乘法。

联合 softmax 的独立反例：两分支 score=[0,ln3]、value=[2,10]，不带 sink 的联合输出为 8；分开求输出后平均为 6，相加为 12。用于说明归一化合同，不是 V4 实际 activation。

## 审查与验证

六张新图均为原创结构/shape 示意；只有 SWA 的位置条带按相同位置比例绘制，不用框宽暗示跨模型容量或性能。

- 技术正确性：对固定配置及 V4 forward 核对记录身份、层型、轴与归一化。纠正重排后 Linear 开头仍称“前两种机制保存 N 行”的旧承接，区分逐位置历史、摘要与有界窗口。MLA 两种存法的图改为“对照”，不画成由展开 KV 直接压缩的执行箭头。
- 初学者可理解性：首图先定义历史的行/特征列，再分四类问题；每节说明上一个方法剩余的成本。先讲池化再讲 CSA/HCA，明确两个 512 的不同轴以及 V3/V4 不同 cache schema；公开组合与历史内部实例分开。
- 视觉可用性：1440 像素桌面逐张检查六图，SVG 文本无视窗越界；检查修改后的表示对照图、交互全图和放大弹窗。按仓库规则仅做桌面验收。
- 浏览器：新章节与旧 `mla-dsa/latent`、`flash-attention/io-problem`、`kv-cache/paging` 及当前 PagedAttention 深链可访问；搜索 CSA/HCA 可定位。交互核对 N4096/32768/1048576 和 Pro 预算；原独立 V4 篇默认 1048576、Attention 篇默认 4096。
- 离线与打印：`file://` 独立 Attention HTML 的条目交互正常；受影响内容输出 A4 PDF，检查机制图和混合模型图未裁断。
- 本地检查：`scripts/build.py`、`scripts/check.py`、`scripts/check_public_artifact.py`、`node --check web/deepseek-architecture.js`、`scripts/check_deepseek_model.js`、`scripts/check_attention_lab.js` 与 `git diff --check` 通过。数值测试验证独立不变量/反例，不表示真实模型推理或硬件性能验收。浏览器没有 pageerror。

合入并行主分支的 CUDA 与 ZeusCore 更新后，重新完成构建、内容检查、公开产物检查和受影响浏览器回归；保留两项更新。固定配置的 43 层计数、Qwen3.5 的 3:1 层序及 SWA 字节/FLOPs 另按下载配置独立复算。

发布、CI 与线上核验另以最终提交对应工作流和站点产物记录，不从本地通过推定部署完成。
