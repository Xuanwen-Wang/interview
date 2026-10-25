# MoE 单篇重构与当前部署复核

日期：2026-10-25（Asia/Shanghai）。基线网站 `0c98c15`。本轮按用户确认的实际部署口径：**卡间 EP4、卡内 TP4**；这项物理卡口径是用户提供的信息，rank 映射、专家分片和调用行为另外由源码核验。业务仓库只读。

## 来源与范围

- `zeus_dev@05ee10f9cc25d19fca0a144ae095c79b3a888976`：配置、开发 caller 与通信合同，详见 [当前部署证据](moe-ep4-tp4-deployment.md)。
- `torch_zeus@01046b2bd533fcd3a6754c2f6e03ca612000b176`：本轮核验的远端 master，详见 [四 kernel 证据](moe-four-kernels-current.md)。此前同日证据页冻结于 `3656952b`，保留其原采集身份，不再用它表示当前 master。
- 真实权重 300B 验收配置另绑定 SGLang `acc98d7d924630d43cd4796f462f015b7aef8670` 与 torch_zeus `01fcfa8176759b2a5921a31b470e16dbc1380169`。按固定源码追到 Shared UScale、Router、align、Routed UScale 和 Reduce；通信继续追到 SGLang `dp_attention.py` 的 Zeus 分支，确认复制感知输入 gather、卡内 TP AllReduce 与卡间 EP ReduceScatter。旧真实权重入口存在不等于最新开发四核已经接入，也没有推断用户当前服务进程使用旧绑定版本。
- 公开 `zai-org/GLM-5`：2026-10-25 用 Hugging Face 模型 API 获得 revision `c183ef8c61faee82855eca1ed9bb3a9a7ce3b0b2`，读取 [固定配置](https://huggingface.co/zai-org/GLM-5/blob/c183ef8c61faee82855eca1ed9bb3a9a7ce3b0b2/config.json)。H6144、78层、256 routed、1 shared、Top8、MoE I2048、前3 Dense；75 MoE 为配置推导。仅用于区分模型身份，不据模型文件的 `ep_size=1` 推断生产拓扑。
- 历史性能仅按 [原始证据归档说明](moe-deep-sources.md#nv) 转述，未新增任何性能测量；T24/NV 表明确保留 diagnostic_only 和未接受为性能基线的状态。

## 结构与纠正

把分散的 MoE 拓扑、通信、四核、算子细节和优化证据合成 `moe-deployment-walkthrough`，独立入口 `moe.html`。通用 FFN/MoE 数学仍留在算法域，完整模型总览和 Attention 专题保留。读者沿卡/rank、token、Router、Shared、Routed、Reduce 和通信返回读完。

重点纠正：rank 不等于卡；TP/DP/EP 不能相乘成64；开发 fixture 和测试入口不等于全模型生产部署；不能把开发子目录缺 loader 推广成整个仓库无真实权重入口；clamp 配置与 caller 实参分开；CrossEPLayout 是 opt-in；FLAT16 不等于专家 TP16；T24 不直接套未 padding 的 FLAT16 整行分片。Shared 当前 dev 非 EP0 零占位、旧绑定 SGLang 跨 EP 复制权重但仅 EP0 注入、历史性能 harness 的 EP0 计时，三者分别说明。

旧章/旧节通过 `legacyChapters.anchorMap` 映射到对应新节，避免不同旧章同名锚点相互覆盖。原笔记、阅读记录保留；新整篇不会继承一个旧章的已完成状态。旧题仅在语义和答案保持一致时迁移熟练度。

## 验证

- 独立发布工作树构建与 `scripts/check.py` 通过：50章、417节、319问、111张正文SVG；MoE单篇34节、9阶段、18问。共享工作区有其他任务的独立性能章节，未纳入本次提交。
- `scripts/check_moe_model.js`：1,152专家分片、权重容量守恒、T8/16/24/32张量账、同名旧节路由、旧阅读/笔记/题目迁移均通过。PE交互模型和相关JS语法检查通过。
- 浏览器实际遍历15个旧章入口与107个旧节锚点，共122个入口，均到达新长文相应位置且没有重复DOM ID。
- `readingVersion=2` 的既有记录仍可二次迁移：旧已读保留在legacyRead、旧笔记可展开并继续编辑，题目熟练度仅通过精确legacyKeys继承。
- 全文搜索可找到EP4/TP4长文；交互检查T8/16/24/32、专家0/71/72/287、EP3/TP3与非法288；跨节跳转保留交互选择。
- 390px手机整篇无横向溢出；离线下载文件名正确，断网后锚点和交互仍可用；打印保留34节，隐藏操作控件并展开正文details。
- 独立复核全部正文SVG XML、精确数学/字节算例、引用范围与敏感路径。正文证据链接指向GitHub文档，避免将仓库相对路径误当成Pages已部署资源。

本文不把网页测试称为 kernel、Graph 或设备验收；没有新增设备性能数据。
