# MLA：从 token、特征与 head 三个轴重新解释

核查日期：2026-10-28。基线 `c3bdf5d`。范围为 `content/13-attention-guide.json` 的 `mla-cache`、`mla-absorption` 及既有 MLA 动画；保留章节、小节、阅读记录和旧深链接的 ID。没有修改业务源码或运行模型 / GPU kernel。

## 读者问题与改写

此前虽然列出了 shape，但没有先建立“一个 token 是一行特征数”的概念。读者容易把 5120 当成序列长度，也容易把隐藏维度、head 数与每头维度都当成同一个轴。

- 开篇直接回答：5120 是 DeepSeek-V2 的隐藏向量长度；4096 是本例选择的可见历史长度。解释 token ID → embedding → 逐层隐藏状态，及特征坐标不等于人为可命名属性。
- 新增四张原创 SVG：位置 / 特征轴、4→2 线性投影、Q 投影后的 head 分组、打分与取值的两个不同归约轴。图题、轴、数字来源、被省略的 batch / 单 token 轴分别说明。
- 用 `[1,2,3,1]` 乘 `[4,2]` 教学权重得到 `[3,5]`，解释投影不是截取或改变 token 数；再接回真实 `5120→512→RMSNorm`。
- 用不等宽的三维 latent / 二维 key 手算 K 吸收：`q=[2,1]` 转为 `[2,3,2]`，两种路径都得到位置分数 `[8,11]`。V 线性加权例使用另行给定的 ¼、¾，明确不是前一例的 softmax。
- 保留既有 RoPE、完整 decode、容量 / FLOPs 与代价说明，并补充位置分支不是直接存储整数位置；MLA 仍访问所有可见位置，紧凑缓存与原始 HF 展开缓存不能混称。
- 动画从十步扩为十二步，先建立 token / 特征与投影概念；小数值例按四格输入、两格输出绘制。后续步骤引用同步更新。

## 来源与技术正确性

主要来源仍为 [MLA 固定来源审计](mla-source-audit.md)，本轮重新读取：

1. [DeepSeek-V2 论文 v5 §2.1 / 附录 C](https://arxiv.org/html/2405.04434v5)：联合低秩表示、矩阵吸收与解耦 RoPE。
2. [官方固定配置](https://huggingface.co/deepseek-ai/DeepSeek-V2/blob/4461458f186c35188585855f28f77af5661ad489/config.json)：hidden 5120，KV rank 512，Q rank 1536，128 heads，内容128 / 位置64 / value128。
3. [同版本 modeling_deepseek.py](https://huggingface.co/deepseek-ai/DeepSeek-V2/blob/4461458f186c35188585855f28f77af5661ad489/modeling_deepseek.py)：L711–745 投影与 scale，L814–863 split / reshape / RoPE / cache，L886–898 输出投影，L1237–1242 输入 RMSNorm。本轮下载文件 SHA256：`82f8aa5e64d53a7f378719798fac763749cff92a6cea8437b9a8d7f37193bb90`。

图中的 `[1,128,192]` 采用 token / head / feature 的逻辑顺序；实际参考实现还 transpose 成 batch / head / token / feature，不能把图示顺序当作物理 stride。用行向量书写投影，所以矩阵 shape 与论文列向量约定互为转置。K/V 的紧凑执行是算法及等价计算说明，不声称上述 V2 HF eager 已采用紧凑 cache。

`scripts/check_attention_lab.js` 增加新手算例的独立数值检查，原有展开 / 吸收、RoPE、mask、checkpoint scale、错误换序和容量 oracle 继续通过。`scripts/check_decode_model.js` 通过。所有结果属于教学算术与结构验证，不是 checkpoint 精度或设备性能验收。

## 初学者可理解性与视觉审查

人工按“第一次接触 MLA”的顺序复读：先定义位置 / 特征，再讲投影、共享 c、head、缓存、两种求值路径。数字首次出现标明角色与模型 / 教学条件；主文手算只保留能逐项检查的数值，完整公式仍在补充中。

桌面逐张查看两节共十张图及十二步动画；四张新 SVG 无文本越界。初审修正了位置轴图中容易被误读为“先构造完整 X 再切一行”的箭头，并把玩具投影权重标为教学取值。图示和动画说明不按实际数量比例绘制的部分。

最终浏览器检查（Chromium 141）：

- 1440×1000 桌面逐步操作十二步；Home / End、前后、重置、播放 / 暂停通过。搜索 5120 可到本节；旧 `#chapter/mla-dsa/latent` 迁移到 `mla-cache`。
- 390×844 手机整页宽度与 scrollWidth 同为390；新数值格子、长 shape 与缓存行正常换行，图示放大可用。桌面 150% 图示放大通过。
- 实际生成本 MLA 阅读阶段的18页 A4 PDF，含十二步说明与末帧，控件隐藏；查看第2、3、12、16页，新增轴图、投影图、归约图和动画末帧未截断。返回 screen 后交互继续工作。
- `file://` 独立 Attention HTML 可以切到第十二步；无 pageerror。
- 构建、静态检查、公开产物检查、JS 语法、Attention / Decode 数学检查、`git diff --check` 通过。截图与 PDF 保存在忽略的 `output/playwright/`，不随源码发布。

技术结论绑定固定来源与教学假设；初学者审查已补齐名词的引入顺序；视觉审查覆盖实际截图而非只检查 SVG 语法。线上发布状态以对应提交的 Actions 结果和发布后实际核验为准。
