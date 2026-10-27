# Roofline：算子与模型扩写核验

核验日期：2026-10-27。基线为指南仓库 `f50cae0`；修改正文 `content/40-performance-analysis.json`，保留全部旧 chapter/section ID，在原性能长文增加四个算例小节。配套修改仅涉及 Roofline 交互、样式与相应数学检查。

## 来源与边界

- Roofline 定义：[Williams / Waterman / Patterson 原始报告](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2008/EECS-2008-134.html)。线性示意图借鉴用户提供图片的教学布局，重新用明确数值绘制原创 SVG；拐点写作机器平衡点 I*，不误称最大算术强度。
- GEMM 的 FMA=2 FLOP、M/N/K 与复用：[NVIDIA Matrix Multiplication Background](https://docs.nvidia.com/deeplearning/performance/dl-performance-matrix-multiplication/index.html)。不复用文档中的旧设备测试数据。
- 测量点、峰值与层级匹配：[Nsight Compute Profiling Guide](https://docs.nvidia.com/nsight-compute/ProfilingGuide/index.html#roofline-charts)，2026-10-27 阅读官方滚动页面；未执行 ncu。
- Qwen3-8B：[官方 config.json](https://huggingface.co/Qwen/Qwen3-8B/blob/47719a242beab8f9aecc40ce3928b034dd5dd559/config.json)，固定 revision `47719a242beab8f9aecc40ce3928b034dd5dd559`。下载配置 SHA256：`f7c4eadfbbf522470667b797a3c89be2524832d2d599797248dc304fff447c30`。确认 H=4096、J=12288、Q/KV heads=32/8、head_dim=128、36层、无 Attention bias。只借用真实维度，没有运行模型。
- [GQA v3](https://arxiv.org/abs/2305.13245v3) 用于分组结构；MHA/MQA 是相同查询维度的反事实对照，不声称可直接替换 checkpoint。
- [FlashAttention v2](https://arxiv.org/abs/2205.14135v2) 用于 IO-aware 分块和在线计算原理；文中 128 MiB 是独立构造的 BF16 中间张量账本，不是论文实验值或实际 DRAM 计数器。

所有新增硬件参数固定为虚构单设备 P=200 TFLOP/s、BW=2 TB/s；数值点为条件上界，不是 H200、Zeus、CycleSim、VCS 或硅上结果。MoE 的 E64/Top-2/H4096/J2048 是明确标注的独立教学模型；没有读取或修改业务仓库，没有模型、RTL 或 GPU 性能实验。

## 独立算术核验

| 案例 | 核验结果 |
| --- | --- |
| 方阵 GEMM，K=N=4096 | I=4096M/(4096+2M)；M105 尚未跨越 I*=100，M106 跨越 |
| Qwen Gate，M8 | F=805,306,368 FLOP，Q=100,925,440 byte，Q/BW=50.46272 μs |
| Qwen Gate，M2048 | F=206,158,430,208 FLOP，Q=167,772,160 byte，I=1228.8 |
| Qwen 单层 FFN | 三矩阵 BF16 权重 288 MiB；36层仅 FFN 权重 10,368 MiB，非全模型容量 |
| 逐元素融合，M64、J12288 | 避免 SiLU 中间值 U 一写一读，逻辑节省 4MJ=3 MiB |
| GQA decode，B1/S8192/Q32/KV8/d128 | QKᵀ+PV 为 134,217,728 FLOP；KV 为 32 MiB；主导项 I≈4 |
| Flash 教学基线，单头 L4096/d128 | F=8,589,934,592 FLOP；两份 L² BF16 临时张量各写读一次共128 MiB；加 Q/K/V/O 理想4 MiB，I=2048/33≈62.06 |
| 虚构 MoE，T256/E64/Top-2 | 均匀路由 M_e8；单 Gate F=134,217,728，Q=16,875,520，I≈7.9534 |
| 严格串行阶段反例 | A 下界0.09/0.01 ms、B下界0.01/0.09 ms；Σmax=0.18 ms，整体max=0.10 ms |

FFN、GQA、Flash 与串行反例用独立整数/有理数账本复算。已有 `scripts/check_performance_model.js` 新增真实矩形 Gate/Down 的独立预期、交换 K/N 的记账不变量、拐点两侧反例以及两种 shape 的 M 扫描。测试不代表实际执行速度等价。

## 审查

- 技术正确性：区分逻辑冷读下界与实测流量、有效 FLOPs 与 padding 执行量、向量与矩阵峰值；GQA 不跳过历史；Flash 不假定 Q/K/V 仅读一次；整模型不将串行时间互相抵消。
- 初学者可理解性：先定义坐标、单位、拐点和时间下界，再以 shape 数据流解释权重与 KV 复用，之后进入 Flash 与 MoE；所有数值先交代真实配置或教学条件。
- 视觉可用性：8 张原创 SVG 逐张桌面截图检查，修正压线文字、过长标签及分类框之间可能暗示执行顺序的箭头；图注独立给出 shape、比例与证据口径。

## 验证记录

已通过构建、内容/旧链接静态检查、公开产物检查、JS 语法检查、性能模型检查和 `git diff --check`。浏览器已检查两种 shape × 七种 M 的 14 组交互，当前图放大与数值一致；8 张图文字均在 SVG 边界内。独立 file:// 页面在断网状态下仍显示全部图与 Qwen 参数计算。

浏览器进一步通过 390px 手机无整页横向溢出、图示放大、Qwen 参数切换、全文搜索直达新小节，以及用户原 interview-jobs.html 深链接。打印生成 87 页 A4 PDF，抽查 Roofline 正文页和图示完整性；控制台 0 error、0 warning。8 张正文图及交互均可打印，技术补充在打印中展开。手机大图可以横向查看及放大。

发布前仅暂存本次五个文件；提交、CI/Pages 与线上回读作为独立完成状态在最终交付报告。浏览器产物和第三方配置下载仅放任务临时目录，不提交截图、PDF或浏览器状态。
