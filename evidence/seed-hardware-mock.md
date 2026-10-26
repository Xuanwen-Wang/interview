# M01 · Seed 硬件性能评估原创模拟面试

编写与来源复核日期：2026-10-26（Asia/Shanghai）。

## 内容身份与范围

- 用户认可的 30 个主问题保持原顺序和题意，场次 ID 为 `mock-byte-seed-hardware`，题目 ID 为 `qm-seed-01` 至 `qm-seed-30`。
- 本场为依据官方 JD 编写的原创练习，不是字节真实面经、固定轮次、评分规则或内部流程。`config/interviews.json` 中 M01 使用 `category: reading`；官方岗位仍用 J01。
- 题干从经历、业务与评估场景展开，不假设面试官预先熟悉候选人的专有单元或指令。CycleSim 只作为可选的技术展开阅读。
- 23 题提供技术或方法参考；第 5、6、7、8、10 题中涉及既往项目的内容仍待本人补证。第 1–4、18、29、30 题给个人回答框架，职业动机、职责、结果及失败经历由本人确认。
- 本次没有读取私人简历，没有新增硬件、CycleSim 或 RTL 实验，也不将公开指南的工程内容写成本人的贡献。教学算例不是测量结果。

## 岗位来源

- [官方岗位](https://jobs.bytedance.com/experienced/position/7647081477118085429/detail)
- [官方职位 API](https://jobs.bytedance.com/api/v1/job/posts/7647081477118085429/)
- 2026-10-26 直接获取官方 JSON，字段 `data.job_post_detail`：标题为“AI异构硬件性能评估专家 - Seed Model”，`id=7647081477118085429`，`code=A54228`，杭州，社招 · 正式。
- `publish_time=1780475007256`，对应发布日期 2026-06-03；`channel_online_status=1`，只证明核验时官方发布在线，不保证招聘名额或进度。
- 相关专业为优先条件；未明确学历层级或工作年限。正文分别概述职责、基本要求与加分项，不新增招聘门槛。
- J01 在 `config/jobs.json`、`config/interviews.json`、岗位正文与 `job-sources.md` 同步更新到本次核验日期；其余岗位不改核验日期。

## 技术来源与推演边界

| 问题 | 来源 | 用途与限制 |
| --- | --- | --- |
| 5–17 | 本仓库 `content/40-performance-analysis.json`、`content/41-cyclesim-engineering.json`，基线提交 `5b4a07765d2c02eb5413a5f5659d1422d2e05940` | 复用已发布的测量契约、误差诊断、负载画像和验证层级；本场未重新执行工程测量或扩展历史校准结论。 |
| 17–18、28 | [Nsight Systems User Guide](https://docs.nvidia.com/nsight-systems/UserGuide/index.html)、[Nsight Compute Profiling Guide](https://docs.nvidia.com/nsight-compute/ProfilingGuide/index.html) | 2026-10-26 查阅官方文档；区分系统时间线、kernel 指标、采集扰动与正常计时，不声称本人使用过工具。 |
| 19 | [MLPerf Training](https://mlcommons.org/benchmarks/training/)、[Megatron-LM](https://arxiv.org/abs/1909.08053) | 训练质量目标与模型并行机制。硬件适配判断为条件化推演，不代表这些来源背书某款卡。 |
| 20 | [DistServe](https://arxiv.org/abs/2401.09670)、[MLPerf Inference 5.1 小模型指标说明](https://mlcommons.org/2025/09/small-llm-inference-5-1/) | prefill/decode 与服务时延指标。本文将 goodput 明确定义为同时达到质量及延迟门槛的完成请求数/时间；不混用请求吞吐与 token 吞吐。 |
| 21 | [Megatron Core MoE](https://docs.nvidia.com/megatron-core/developer-guide/latest/user-guide/features/moe.html)、[MegaBlocks](https://arxiv.org/abs/2211.15841) | 专家负载、Grouped GEMM、分派与通信机制。均匀路由只作消融，不冒充原模型语义。 |
| 22 | [NCCL Tests 性能口径](https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md)、[Megatron 大规模训练论文](https://people.eecs.berkeley.edu/~matei/papers/2021/sc_megatron_lm.pdf) | 强弱扩展、并行和通信分析；algbw/busbw 不当作物理链路计数器。 |
| 23–27 | 本站原创方法与显式教学算例 | 优化投入、成本和部署步骤是练习方案，不引用未发生的企业决策或性能成绩。 |

答案的现场表达和追问为本站原创。外部技术资料只支持相关机制，不证明面试曾发生，也不证明个人履历。

## 算例

- 第 23 题：固定工作量、其余工作不变、无重叠变化，独占原关键路径 30% 的算子加速两倍，总时间为 `0.7 + 0.3 / 2 = 0.85`，总加速 `1 / 0.85 ≈ 1.176`，总耗时减少 15%。
- 第 25 题：完整每节点运行成本比为 0.7，同质量与延迟门槛下有效吞吐比为 0.8，线性扩展假设下单位产出运行成本比 `0.7 / 0.8 = 0.875`，减少 12.5%。迁移成本、节点取整、容量余量等另算；不把卡价直接当作完整节点成本。
- 第 16、24 题：`max(F/P, Q/B)` 用峰值上界形成理想资源时间下界；P 的精度与 Q/B 的存储层级一致。使用微基准可持续能力时，只作为经验参照，不继续称严格下界。

## 页面与发布验收

- 技术正确性：独立审稿核对 30 个原题、官方 JD、经验边界、模型误差、Profiler、Roofline、MoE、多卡、Amdahl 和成本口径，未发现阻断问题；采纳建议补充 TTFT 起点、TPOT 公式及输出不足两个 token 的处理。
- 初学者可理解性：按经历、建模、新卡评估、瓶颈、成本及个人匹配六段阅读，技术题先给结论再展开例子；流程图注明输入、输出、箭头和非比例性质。个人框架与技术参考分开标注。
- 视觉可用性：查看桌面正文、放大后的流程图、390×844 手机正文及打印媒体下的答案截图；文字、箭头与阅读顺序可用，页面无横向溢出。打印事件展开全文 358 题，结束后恢复展开状态。
- 交互：从 `cyclesim.html#module/interviews` 的场次目录进入本场；展开/收起本场恰好影响 30 题；搜索“两周”场景直达第 12 题并展开；岗位卡、官方链接、回退导航均核验。实际下载完整 HTML 后通过 `file://` 阅读本场与题目深链接。
- 静态验收：`python3 scripts/build.py`、`python3 scripts/check.py`、`python3 scripts/check_public_artifact.py`、`node scripts/check_interviews.js`、`git diff --check` 通过。现有 328 个题目锚点保留，总计 44 个场次/材料分组、358 题；历史链接和 v1/v2 笔记、已读及练习迁移检查通过。
- 集成期间保留上游提交 `044a679a1a497cca64f6fd963353a34b37d6e50e` 的公司按场次数排序规则；本场并入字节公司组后重新执行构建及上述检查。
- 边界：未做硬件或 RTL 实验，未重新运行指南中引用的历史项目；未模拟真实招聘面试，也未替本人确认履历。本轮浏览器检查使用 Chromium，未执行其他浏览器或真实打印机测试。发布后的状态与线上核验在交付时另行确认。
