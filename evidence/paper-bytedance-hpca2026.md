# HPCA 2026 字节云原生 LLM 推理论文解读：来源与审查

## 内容与导航

- 新增知识域 `paper`，专题 `llm-architecture`，章节 `paper-bytedance-hpca2026`。
- 正文源：`content/80-paper-bytedance-hpca2026.json`。
- 在线入口：`paper-bytedance-hpca2026.html`；离线入口：`paper-bytedance-hpca2026-offline.html`。
- 6 个阅读阶段、26 小节、6 张原图及表 I、8 道问答；沿用现有图示放大、搜索、打印、离线机制。
- 未改动已有章节的 ID、锚点、笔记或阅读记录映射。

## 原始资料

- 标题：Characterizing Cloud-Native LLM Inference at ByteDance and Exposing Optimization Challenges and Opportunities for Future AI Accelerators。
- HPCA 2026 Industry Track；[DOI / IEEE](https://doi.org/10.1109/HPCA68181.2026.11408526)。
- [官方会议条目](https://2026.hpca-conf.org/details/hpca-2026-industry-track/2/Characterizing-Cloud-Native-LLM-Inference-at-ByteDance-and-Exposing-Optimization-Chal)。
- [作者提供的 XPU-Perf 仓库](https://github.com/bytedance/xpu-perf)。2026-11-17 核对该仓库入口；本次未审核所有后端实现，不声称论文描述已全部公开实现。
- 来源为读者提供的正式论文 PDF：19 页，1,370,962 字节；正文及参考文献分界位于 PDF 第 13 页。
- PDF SHA-256：`563cd5a00bfb71deee5a9a8ed661233d8bacf9703ae4c588470a8244b46b5c6c`。
- 本次公开的是原创中文解读与有明确出处的论文图表裁切；不发布完整订阅 PDF、下载机构页脚、作者邮箱或本机路径。

## 原图来源与裁切

原图直接从上述 PDF 使用 PyMuPDF 渲染为无透明背景 PNG，不重绘数据或文字。坐标单位为 PDF point，原点为页面左上；页码从 1 开始。PNG 内嵌于章节 HTML 的 SVG image 中，兼容现有放大和离线阅读机制。

| 对象 | PDF 页 | 裁切矩形 x0,y0,x1,y1 | 渲染倍数 | PNG 尺寸 |
| --- | ---: | --- | ---: | --- |
| 图 1 | 3 | 48,49,568.5,275 | 4 | 2082×904 |
| 图 2 | 5 | 48,48,568.5,616 | 4 | 2082×2272 |
| 图 3 | 6 | 48,407,302,611 | 5 | 1270×1020 |
| 图 4 | 8 | 48,49,302,175 | 6 | 1524×756 |
| 图 5 | 10 | 48,49,568.5,281 | 4 | 2082×928 |
| 图 6 | 11 | 311,49,565,174 | 5 | 1270×625 |
| 表 I | 9 | 313,617,565,717 | 5 | 1260×500 |

各 PNG 的 SHA-256（可从章节内 data URI 解码校验）：

```text
figure1 427abe2c0badef7183c12b3b88d03b1d0024e3761237c495486e82964331a841
figure2 cebb8151af385723b770ff0ffcccfe3934100a7024610eba9af391f963528fab
figure3 8058da1b98ed3bc2033cbd8a194c4d0d1f823bb26ef7e05314b4928bad823467
figure4 98c00503eda3d43cd5d50f5449a527f231e94225c3abe1a4b11f469b68b22a74
figure5 340f5cbe5a72c39f95faf5cb589225a155268487dcede9a137d4b112c4a6d9a1
figure6 317edfeef3bb021b249a75ea56252cb30a4b57716b558607fc68f612f6945d8f
table1 fcc94194adcd6926864aa5b31c6a02b456a00b8e7473129cb894cdb25ec3cbbc
```

## 关键主张与原文位置

| 解读内容 | 原文位置 | 口径 |
| --- | --- | --- |
| SLA 下的成本、10 倍目标、能效与软件可控性 | 第 2 页 §I | 目标、观察与建议分别表述；电力占比不推广到所有集群 |
| PD 系统与业务差异 | 第 3–6 页，图 1–3 | 图 2 各横轴不同；图 3 每项指标按跨业务最小非零值归一化 |
| 缓存/组批有效工作量 | 第 3、5–6 页，图 1(b)、§II.B | 配对数和逻辑输入规模，不等于时延或实测 HBM 字节 |
| 缓存位置、调度与预测 | 第 7–8 页 §II.C | 生产问题与研究机会；未声称通用最优策略已完成 |
| XPU-Perf、VISA、MojoOP、模型测试 | 第 8–9 页 §III，图 4 | 框架设计与当前代码分开；API 调用数不等于物理指令数 |
| 四芯片条件与结果 | 第 9–10 页，表 I、图 5 | 八卡、Attention TP、MoE EP、内部线上 MoE；排名、占比、MFU 分开 |
| Vector/SFU 与量化 | 第 10–11 页 §IV.B.1 | exp 与 sine 举例区分；量化百分比分母为量化+GEMM |
| Chaining 与通信资源争用 | 第 12 页 §IV.B.1–2 | 局部向量案例与作者观察；不提升为整模型加速比 |
| Tensor/Vector 并行、宏观数据流 | 第 12–13 页 §IV.B.3–C、图 6 | 模板不等于具体 RTL；独立控制与近端数据通路共同约束 |
| 编译器线索与实验设计 | 正文最后一个阅读阶段 | 导读的研究归纳与方案，本次未执行硬件实验 |

## 算例与易误读项

- 有效 causal 配对：`NM + N(N+1)/2`；独立请求求和，不能包含跨请求注意力。
- `(M,N)=(0,100)/(900,100)/(0,1000)` 对应 `5050/95050/500500`。
- `1×2048 / 2×1024 / 32×64` 对应 `2098176/1049600/66560`。
- 相同平均长度 `{100,100}` 与 `{1,199}` 对应 `10100/19901`。
- 四 token QK 教学例取 g=1：配对/最少输入向量分别为 `10/8, 9/7, 4/5`，非实际 FLOP/byte。
- 调度 `40+0+5=45 ms` 与 `2+8+6=16 ms`、矩阵/向量 `8+8`、网络 `256 KiB / 900 GB/s` 均为显式教学假设。
- 图 5 右侧读数为近似值，未伪造作者原始数据；MFU 不用于跨设备绝对性能排名。
- Chaining 原文总时间 `48.36c → 34c` 对应约 29.7% 下降；原文写 29.2%，本章明确指出展示数字与百分比的差异。

## 验证记录

2026-11-17，本地验证使用本次生成的站点产物。

- `python3 scripts/build.py` 与 `python3 scripts/check.py` 通过：14 个知识域、35 章、805 小节；章节归属、路由、来源、图示标签与构建一致性检查通过。
- `node scripts/check_reading_numbers.js` 通过：目录、正文、阅读路径编号一致；既有稳定锚点通过检查。
- `git diff --check` 通过。
- `python3 scripts/check_public_artifact.py` 对最终 `dist/` 的 103 个允许文件检查通过，未检出私人文档或联系信息模式。
- 独立遍历 causal mask 验证 128 组小形状，并核对正文中各组配对数与两个平均长度算例；算例通过。
- 7 张内嵌 PNG 的哈希均与原 PDF 裁切结果一致，SVG XML 可解析。
- Playwright 桌面浏览器验证 `paper` 入口、长文入口、6 个阶段/26 小节、正文搜索与章节锚点。1440×1000 与 1280×900 下均无页面横向溢出。
- 7 张原图表逐一打开“放大图示”，200% 缩放均正常；逐张查看文字、图例、图注及边界，图 4 代码可读。
- 搜索 `chaining` 能命中新文章并定位至对应小节；直接进入 `paper-bytedance-hpca2026.html#chapter/paper-bytedance-hpca2026/fig5` 正常。
- 实际点击离线下载，所得文件与构建文件逐字节一致；断网后通过 `file://` 打开，26 小节、7 图、搜索与图 4 放大正常。记录到的 HTTP 请求为 0、外部脚本/样式为 0、页面错误为 0。
- 打印产物为 26 页；核对到全部 26 个小节标题和全部 7 张原图，图 2 长图在单页内完整显示。
- 旧入口 `attention.html#chapter/transformer/attention` 正确映射到 `attention-inference-guide/full-history`；`ffn.html`、`chip-dependencies.html` 正常。浏览器未发现页面脚本错误。

技术审查：主要结论逐项绑定原文页码，量化分母、归一化坐标和教学假设明确，算术独立核验通过。初学者可理解性审查：按线上问题、工作量算例、三级评测、芯片现象与架构机制的顺序展开，首次出现的关键量附解释。视觉审查：原图完整、放大可用、桌面无横向溢出、打印图表无裁断。

发布状态与线上一致性由对应提交的 Actions 和交付记录核对。本次为论文与网页验收，没有重新完成论文设备测量、内部线上服务复现或新的端到端性能实验。
