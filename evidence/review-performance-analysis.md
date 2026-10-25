# 性能分析独立长文：来源与验收

核对日期：2026-10-25。

## 交付与范围

- 正文：`content/40-performance-analysis.json`，章节 `performance-analysis`。
- 独立入口：运行 `python3 scripts/build.py` 生成 `dist/performance.html`；正文、样式、脚本均内嵌，可通过 `file://` 离线打开。
- 27节、6个阅读阶段、15道追问、21条来源、2张正文示意图、3个交互实验。
- 沿业务目标与测量契约 → PyTorch Profiler / Nsight Systems / Nsight Compute → 算子画像 → Roofline → 通信 → 模型负载 → 实验与面试表达组织。
- 纳入现有“性能与推理系统”目录、全文搜索、打印与个人笔记功能。

本次没有采集 CUDA / NVIDIA 硬件计数器，没有运行 NCCL 基准，也没有运行 518、CycleSim、VCS 或硅上测试。命令是教学操作模板，Python/Bash 示例只检查语法。所有示意时间、算力、带宽和模型参数均是教学构造；不冒充真实部署、公开 GLM-5 或内部 GLM5Next。

## 来源边界

完整直接链接及说明保存在章节 `sources` 与正文中。

- PyTorch 示例依据固定的 **2.9** `torch.profiler`、CUDA semantics、CUDA Event 文档；Profiler recipe 是滚动教程。
- Nsight Systems / Compute、CUDA Best Practices 使用 2026-10-25 核对的官方在线文档。没有把文档页面版本当成本机安装版本；正文要求结合本机 `--version`、`--help` 与可用 section/metric。
- NCCL 页面核对时显示 **2.32.3**；`nccl-tests` 的带宽定义和 AllToAll 实现固定到 `afd59abab774a6a4b492eb344bd0c845a0b7bb4d`。
- Roofline 引用 UCB/EECS-2008-134 原始技术报告；GEMM 复用/分块解释参照 NVIDIA 官方指南，不搬用其中旧硬件性能作为当前结果。
- GQA、FlashAttention、PagedAttention、Megatron-LM、DistServe 引用原论文；只使用结构与方法，不外推论文的测试加速比。

## 交互模型审查

数学实现位于 `web/performance-explorer.js`，样式位于 `web/performance-explorer.css`。

| 实验 | 默认条件 | 独立复算 |
| --- | --- | --- |
| Roofline | M=64，N=K=4096，BF16 A/W/C，β=0；200 TFLOP/s、2 TB/s、5 μs串行附加开销 | F=2,147,483,648 FLOP；Q=34,603,008 B；AI≈62.0606 FLOP/B；条件时间22.301504 μs |
| 通信重叠 | C=8 ms、D=6 ms、可重叠比例50%、额外罚时0 | 重叠3 ms；总时间11 ms；相对14 ms串行基线缩短21.4286% |
| Decode负载 | B=8、S=2048；32层、H=4096、Q/KV heads=32/8、d=128、FFN=11008、BF16 | 估算参数5,670,699,008；已有KV为2 GiB；本步流量13.48993024 GB；总资源下界6.74496512 ms |

明确保留的限制：

- Roofline 的 Q 是冷读与理想复用下的最小逻辑流量，不是实际 DRAM 字节；预算点不是测量点。
- 计算/搬运取 max 是资源下界；固定开销串行相加是附加假设。
- Decode 的 S 表示已有上下文，算量采用 S 个位置，忽略当前 token 自注意的 `+1`；标准 GQA，未考虑其他缓存结构。
- Decode 不计词表、norm、softmax、其他激活流量、通信、调度和采样等，不能视为端到端延迟或真实吞吐。
- 全模型 `max(ΣF/P, ΣQ/BW)` 比严格串行阶段的 `Σ max(Fᵢ/P, Qᵢ/BW)` 更松；正文显式解释。
- 通信重叠比例与罚时是条件参数，不能据此推断真实数据依赖、资源争用或网络时间。
- ring收发量分别记账；algbw/busbw按collective定义，AllToAll不套用AllReduce因子；MoE按远端路由与发送方向计算。

## 验证结果

通过以下检查：

```bash
python3 scripts/build.py
python3 scripts/check.py
node --check web/performance-explorer.js
node --check web/app.js
node --check web/catalog.js
node --check web/reading.js
node scripts/check_performance_model.js
git diff --check
```

`check_performance_model.js` 已加入现有工作流，检查独立手算值、Roofline瓶颈切换、重叠端点/负收益、batch/context缩放与GQA的KV/attention关系。

使用独立 Playwright 浏览器会话验证：

- 直接打开独立页面默认进入本章，27个正文锚点和6个阶段锚点可解析。
- 搜索 `Nsight` 能找到新章节。
- Roofline 的 M=1/64/1024 能切换预算与主导项；改变参数后放大图使用当前数据。
- 通信重叠比例100%得到8 ms；附加8 ms罚时得到16 ms。
- B=128、S=32768显示已有KV为512 GiB，并明确没有设备容量保证。
- 桌面1440px、手机390px正常阅读；手机横向页面无溢出，菜单导航可跳至通信阶段。
- 浏览器离线且以 `file://` 打开时，全文、图表、参数切换均正常；没有外部脚本依赖。
- 打印生成A4 PDF；图表、问答答案与来源保留，导航隐藏。
- 浏览器控制台0 error、0 warning。

浏览器状态、截图与检查用PDF仅放在任务临时目录，不纳入仓库。网页通过不意味着上述GPU示例已执行。
