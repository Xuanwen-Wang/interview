# FlashAttention-2 扩展核验记录

采集日期：2026-10-28。范围：Attention 连续教程新增 `flash-attention-2` section。证据为固定论文、作者说明、CUDA 归档文档与独立教学推导；本次没有运行 GPU kernel、设备性能测试或模型端到端实验。

## 原始依据

| 来源 | 核对位置 | 支撑内容 |
| --- | --- | --- |
| [FlashAttention-2，arXiv 2307.08691v1](https://arxiv.org/html/2307.08691v1) | §3.1 前向、Algorithm 1 | 未归一化输出累计、最后归一化；LSE 的用途 |
| 同上 | §3.2 | 沿 query 行块分配前向 CTA；不同输出行无需跨 CTA 合并 |
| 同上 | §3.3、Figure 3、Tuning block sizes | sliced-K 与 sliced-Q 的 warp 所有权、片上通信和 tile 资源取舍 |
| [作者发布说明，2023-07-17](https://crfm.stanford.edu/2023/07/17/flash2.html) | Fewer non-matmul FLOPs、Better Parallelism、Better Work Partitioning | 分开解释非矩阵运算、CTA 数与跨 warp 部分输出通信 |
| [CUDA C++ Programming Guide 12.3](https://docs.nvidia.com/cuda/archive/12.3.0/cuda-c-programming-guide/index.html#device-memory-accesses) | Device Memory Accesses / Local Memory | register spilling 与 local memory 的设备内存及缓存边界 |

arXiv v1 的 HTML 转换展示含若干不一致公式/文字，未照抄：正文直接由 softmax 定义推导并检验 `u′=αu+EV`、`l′=αl+sum(E)`，因果合法条件使用 `key_position ≤ query_position`。

## 教学配置与图示边界

固定 Qwen3-8B 的 B=1、Hq=32、Hkv=8、d=128，完整 prefill 的 Qlen=KVlen=4096；Bᵣ=B꜀=64 为教学 tile 配置。三个原创 SVG 分别解释：

1. query 行块 CTA 所有权与因果工作量：32×64=2048 个逻辑任务；没有声称实际 kernel 固定采用该映射，更没有把任务总数等同同时驻留数。
2. 归一化退出历史扫描循环：最后一个 Q 块最多 64 轮；前面的因果 Q 块轮数更少。最终归一化次数的变化不等于总运算或耗时减少 64 倍。
3. 同一 CTA 内 warp 的 sliced-K / sliced-Q：前者的四份 `[64,128]` 部分输出覆盖相同坐标，后者的四份 `[16,128]` 输出覆盖不同行。图形均非按元素/字节/时间比例绘制，不承诺实际寄存器 lane 布局。

GQA KV head 映射使用 `floor(q_head/4)`，每个 Q head 的 softmax 和输出保持独立；不把逻辑共享直接视为测得的 HBM 流量。CTA 内 sliced-K 的归约与 Flash-Decoding 跨 CTA 的 split-KV、workspace 及 merge 分开。正文没有把 sliced-Q 宣称为完全无同步。

## 本项自检

- 技术正确性：用独立 dense softmax 加权求和作 oracle，与每轮归一化形式、末尾归一化形式比较。N∈{1,3,17,64,129}，d∈{2,7,128}，chunk∈{1,4,64}，共45组；随机 logits∈[-30,30]，value∈[-5,5]。最大两种路径绝对误差之和 5.329070518200751e-15。该 FP64 教学检验不认证 BF16 GPU 实现。
- 初学者可理解性：首次定义 CTA/SM/warp，明确切分的是 query 行或 KV 历史位置而非 head dimension；每项优化均写出收益与保留成本，前节已采用 FA2 数据流的事实显式说明。
- 视觉可用性：在 Chromium 141 桌面视口 1280×1000 实际渲染并逐张查看三图；SVG 文本无 viewBox 越界，三图 XML 解析通过。sliced-K 部分结果改成四个明确独立的小矩阵，避免被误读为一个输出的四个列分片。截图为 `output/playwright/fa2-figure-1.png` 至 `fa2-figure-3.png`（本机忽略产物，不提交）。
- 本项没有单独认证站内搜索、旧路由、手机放大、打印分页或离线入口；这些由整篇集成与发布验收记录覆盖。
