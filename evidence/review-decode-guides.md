# Attention / FFN decode 入门教程重构

日期：2026-10-25（Asia/Shanghai）。本轮将“算法与数据流”的 12 章合并为 Attention、FFN 两篇连续教程，分别生成 `dist/attention.html` 与 `dist/ffn.html`。其他知识域保留原结构。旧章节的 87 个内容小节通过 `legacyChapters` 映射到新教程；旧笔记与已读记录保留，旧章已读不自动等同于新整篇已读。

## 教学目标与证据范围

从一次单 token decode 出发，以真实模型维度说明输入、输出、持久状态、临时张量和逻辑读写，再解释算法变化的动机与代价。默认贯穿 Qwen3-8B：H=4096、32 个 Q heads、8 个 KV heads、head dim=128、FFN I=12288、36 层。N=4096 包含本步新增 token；BF16、等长请求、无分片为教学算账假设。

- Attention：GQA 沿 head 轴缩减 KV；在线 softmax 减少中间 score 的落存；MLA 压缩每位置表示；稀疏主 Attention 缩小精读集合并付出索引成本；递归状态用固定大小记忆替代逐位置历史。分别注明是否保持同一模型函数，以及对计算、容量和逻辑字节的影响。
- FFN：用 Gate/Up 的并行输入、SiLU 逐元素门控、Down 返回原宽度，建立三矩阵数据流。MoE 用另一个固定公开模型配置说明 Router、TopK、token/expert/slot、归组和加权还原；总权重、单 token 激活权重、batch 专家并集各自计数。
- 同 Q/head dim 的 MHA32、MQA1 只是对照，不是 Qwen3-8B 的真实结构；内部 GLM5Next 与公开 GLM-5 明确区分。所有图、FLOPs 与字节都是教学推导，没有设备性能或业务 kernel 验收含义。
- B=1、N=4096 时，单层 Qwen3-8B 的 GQA KV 为 16 MiB、四个 Attention 投影 BF16 权重共 80 MiB、Dense FFN 三矩阵共 288 MiB。不能据“decode 读 KV”就宣称短上下文整模型必由 KV 主导；batch 的权重摊销与各请求独立 KV 扫描需分开。

新增 Qwen3-8B 与内部 GLM5Next300B 的整模型生成闭环图及层内放大图：明确 Embedding、层堆叠、各层状态、最终归一化、词表投影与采样反馈；GLM 图明确末层四流取平均在最终 RMSNorm 之前，且 KDA/DSA 与 Dense/MoE 是同一组层的两条分类轴。

## 实现

- `content/13-attention-guide.json`、`content/14-ffn-guide.json`：两篇正文、阶段目录、固定来源与历史入口映射。
- `config/navigation.json`：算法域只保留两章；旧 `models` 专题入口映射到 Attention 专题。
- `web/decode-explorer.js`、`web/decode-explorer.css`：真实 shape 与逻辑字节交互，固定模型配置，B/N 可调，无网络依赖。
- `scripts/build.py`、`web/app.js`：沿现有独立 HTML 与 explorer 架构接入；生成文件不手工编辑。
- `scripts/check_decode_model.js`：独立整数 oracle 校验 KV、FLOPs、B/N 缩放、MHA/GQA/MQA 关系、FFN 复用与非法输入。

## 验收记录

最终正文为 Attention 24 节 / 8 阶段 / 20 张 SVG，FFN 18 节 / 6 阶段 / 14 张 SVG；合计 42 节、34 张图、2 个交互账本。全站构建后为 8 知识域、18 专题、41 章、399 节、292 道追问、125 张正文 SVG。

- `python3 scripts/build.py` 与 `python3 scripts/check.py` 通过：目录归属、来源文件、站内链接、SVG 标注与全部独立 HTML 的内嵌一致性。
- 对本轮开始时的原文件快照逐项核验：原 12 章全部 87 个内容锚点均有语义对应的新目标；两个新文件全部 SVG 通过 XML parser。
- `node scripts/check_decode_model.js` 通过：所有 16 种 B/N 组合、三个 KV 共享方案、独立整数 byte/FLOP oracle、batch/上下文缩放、Dense 固定权重与非法输入。
- 既有 PE、MoE、性能分析模型检查均通过，相关 JavaScript 语法及 `git diff --check` 通过。
- 实际 Chromium 页面 59/59 项通过，结果保存在不提交的 `output/playwright/qa-decode-guides-result.json`：两独立入口和下载目标、B16/N32768 更新、阶段跳转保留交互状态、全部旧章导航与目标、旧笔记/新笔记共存、v2 已读迁移、旧专题映射、GQA 搜索、图示放大及 SVG 文字边界。
- 390px 完整页面无横向溢出；组件另测 360px / B32 / N32768。打印保留当前值和计算结果，隐藏无法交互的控件；两篇 A4 PDF 实际生成。两份 `file://` 离线 HTML 正确打开完整文章，无外部网络资源请求。浏览器没有 JavaScript 错误。
- 补充 7/7 项实际浏览器检查：两套完整模型与层内图数量、GLM 手机端放大、移动页宽，以及远端已发布的 9 个岗位与性能分析教程保留。检查 A4 输出，完整模型图与长 block 图的标签均出现在各自单页内；人工复核 SVG 截图并修正末尾残差连线与输出标签重叠。
- 独立内容复核重算 MLA、Flash tile、KDA 状态、Dense/MoE、fusion、专家并集与量化 scale；已修正 Q→KV 图示生产关系的误导，以及 KDA 每路合并 heads 的宽度歧义。最终图中 Q 与 KV 是独立输入。

来源细节见 [Attention 来源](attention-guide-sources.md) 与 [FFN 来源](ffn-guide-sources.md)。上述检查属于教材内容与网站验收，不是业务 kernel 测试。

本轮只修改指南仓库，没有运行业务模型、编译器、CycleSim、VCS 或硬件测试。GitHub Pages 发布是独立步骤，本记录不将本地生成文件视为线上部署。
