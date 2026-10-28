# FlashAttention 1 / 2 / 3 教学扩展与验收

采集与整理：2026-10-28。指南基线 `e90f846`。本轮范围为 `attention-inference-guide` 的 Flash 段，保持所有原 section/chapter ID、笔记与独立 HTML 入口；增加 `flash-hardware`、`flash-attention-2`、`flash-attention-3`，同一 readingStage 连续阅读。

## 来源与证据层级

- FA1：<https://arxiv.org/html/2205.14135v2>，2022 年论文修订稿，§3.1 Algorithm 1、§3.2 IO 分析。v2 是论文修订号，不是 FlashAttention-2。区分原始 KV 外循环 / O 与统计量回写和教程现代 Q 外循环 / 未归一化 u。
- FA2：见 [来源与独立数学核验](flashattention2-sources.md)。2023 年论文 §3.1–3.3，非 GEMM 运算、CTA 的 Q 并行和 warp 所有权分别解释。
- FA3：见 [固定版本来源与图示审查](flashattention3-sources.md)。2024 年论文 v1、CUDA 12.4.1 归档官方硬件规则。组内流水按 Algorithm 2：QK_next / PV_cur 异步提交，等 QK 后做下一块 softmax，等 PV 后才缩放 u。
- 线程层级：<https://docs.nvidia.com/cuda/archive/12.4.1/cuda-c-programming-guide/index.html#thread-hierarchy>。SM 是硬件单元，CTA 是软件协作组；warp 为 32 线程，WGMMA warpgroup 为 4 warp。没有将不同阶段的 Tensor Cores 框视为两套独占硬件。
- 模型 head 维度沿用正文固定的 Qwen3-8B 配置；Br=Bc=64、对照 Br=128、2048/1024 CTA、缓冲和时间线均是原创教学选择，不是模型运行时捕获、设备测量或官方最优参数。

没有修改业务仓库、运行模型 / CUDA kernel / H100 / H200 / RTL，也没有从论文性能数字推断本文模型的实际加速。

## 技术与读者审查

1. 先定义 Qlen / KVlen、B / head / d、Br / Bc 与 GPU 层级；N=4096 在 prefill 两轴相同，在 decode 仅表示历史轴。
2. FA1 保留在线 softmax 手算与动画，并补原始循环次序和 IO 模型的适用口径。FA2 sliced-K 的部分输出与 sliced-Q 不重叠输出行区分清楚，不能混同 Flash-Decoding 跨 CTA 的 split-KV。
3. FA3 的 ready 与 release、TMA 完成与 WGMMA 完成分开。图和动画均不允许 softmax 在本块 score ready 前执行，也不允许 pending PV 与 u 重缩放竞争。
4. FA3 FP16/BF16 主路径与可选 FP8 分开；Q/K 的同一正交变换在量化前保持点积，FP8 舍入仍有误差。P̃/E 接入低精度 PV 时的 dtype/layout 转换没有省略。
5. 独立审稿发现并修正旧图“先 exp、后更新 max”的阅读歧义；修正 online softmax 图箭头穿过文字；补充 E/P̃ 对应关系和矩阵阶段共享硬件资源的说明。
6. 每种优化分别列出减少的逻辑读写/等待、新增状态与计算、未减少的工作，并解释 prefill 与 decode 的并行轴差异。

## 数值与调度检查

- 原有 `scripts/check_attention_lab.js`：独立 dense softmax oracle、分块 / mask / 极端 logits / LSE merge 等覆盖继续通过。
- 新增 FA3 抽象依赖 DAG 与七类非法调度反例：TMA 未完成即消费、score 未就绪、权重未就绪、PV 未完成即缩放 u、共享槽过早覆盖、漏排空等；教学时间单位不作为设备时钟。
- 增加 delayed-u 的数值反例：正确重缩放必须包含上一块 PV 的贡献。测试结果只证明抽象合同及教学算术。
- FA2 45 组独立 FP64 dense 对照覆盖“每轮归一化”与“末尾归一化”，最大绝对误差 5.33e-15，见专项记录。
- 独立复算：S/P 单表 BF16 1 GiB、四次中间表写读 4 GiB，单层 GQA KV 16 MiB；无 mask 的 QK+PV 274,877,906,944 FLOPs。Br64/128 工作集 96.5/161 KiB，CTA 2048/1024，单 head 无跨 CTA 复用的 KV 请求 128/64 MiB。工作集跨 shared 与寄存器；逻辑请求不等于实测 HBM 流量。

## 浏览器与发布

最终集成检查：

- 构建、静态内容/链接检查、公开产物检查（22 个允许文件）、JS 语法、Attention 与 Decode 独立 oracle、`git diff --check` 全部通过。
- Chromium 141、1440×1000 桌面：逐张查看本段 14 张图（新增 9 张、修正 2 张旧图，其余复核），检查 SVG 文本边界无越界；阅读路线、Q/K/V 分支、warp 所有权、时间线依赖均人工复审。
- FA3 动画八步逐步截图；键盘 End、前后、重置、播放/暂停实际操作通过。当前步骤与数据状态一致；既有动画的数学检查保持通过。
- 390×844 手机整页 `scrollWidth=390`，无页面横向溢出。时间线保留局部横向滚动，当前列自动定位；桌面 150% 放大、手机图示放大均可用。
- 搜索 `FlashAttention-3` 可直接到新节；旧 `#chapter/flash-attention/worked-example` 正确迁移到 `online-softmax`。
- 实际 A4 PDF 抽出本阅读阶段共 30 页；打印包含动画八步与完整末帧。已查看 FA2 warp 图、FA3 依赖图、动画末帧所在页面，未截断；返回 screen 后交互继续工作。
- `file://` 打开完整 `attention.html`，新节与动画可离线使用；浏览器无 pageerror。页面切换与离屏停播也由动画专项检查覆盖。

截图与 PDF 位于忽略的 `output/playwright/`，不随源码提交。发布完成状态以本次提交对应的 GitHub Actions 结果和线上字节核验为准，不把本地通过称为已上线。所有教学图为原创 SVG；不包含源论文截图或私人资料。页面继续内嵌源内容和交互，支持原 URL、离线阅读与打印。构建产物只由 build 生成，Pages 只发布通过公开产物检查的 dist。
