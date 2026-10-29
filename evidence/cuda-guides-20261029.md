# CUDA 与 GPU 通信两篇指南：来源与验证边界

资料采集：2026-10-29（Asia/Shanghai）。本记录覆盖 `content/24-cuda-hopper.json`、`content/25-cuda-communication.json` 和 `web/cuda-guide.js`。

## 资料层级

- H200 产品页用于容量、标称带宽与 SKU 脚注；Hopper 通用机制参考 CUDA 12.8 归档 Programming / Tuning / Best Practices Guide 和 PTX ISA 8.7。H100 产品数字与 FA3 论文性能不迁移为 H200 结果。
- NCCL 文档在采集时显示 2.32.3。基础 collective 合同与较新 device API 分开；当前 API 中已存在 AlltoAll。链接会随官网更新，部署时须复查已安装头文件、动态库和框架包装。
- FA3 论文、作者解释与固定源码分开。论文优化不声称覆盖当前源码所有 dtype、shape 或 dispatch 分支。
- 所有 SVG 为原创逻辑图，不复刻芯片物理版图。结构图不按容量或时长比例；通信成本条形图按明确的教学模型时间比例绘制。
- CTA 驻留、sector、Shared bank、GEMM tile、softmax、TP/EP、Ring 与通信成本均为原创教学推导。没有采集 GPU、NCCL 集群或模型 E2E 的性能结果。

## 公开源码固定点

通过公开 Git refs 固定 SHA，再读取相同 SHA 的文件。来源是远端只读文件，无本地修改；未构建源仓库。下列 SHA256 是本次保存的 UTF-8 阅读副本（不宣称是完整源码仓库）。

| 仓库 / revision | 相对文件 | 阅读副本 SHA256 | 支撑结论 |
| --- | --- | --- | --- |
| Dao-AILab/flash-attention `98c1cee0ed59307833841cdbf567fe336ceec13a` | `hopper/flash_fwd_launch_template.h` | `da9b659a6fb926d393ff4c64571003a4482ad87be7241975eecfcda772f0704c` | tile / RS / overlap 选择，此快照 SM90 stages=2，scheduler 分支 |
| 同上 | `hopper/flash_fwd_kernel_sm90.h` | `0267f2b7b889d1f46338f69e9e17458873f6b3a8cab8b504a7c80862edd9e201` | producer/consumer、寄存器再分配、SharedStorage 生命周期复用 |
| 同上 | `hopper/mainloop_fwd_sm90_tma_gmma_ws.hpp` | `de619337c4cbd222489b0d719dda9180b61774488fae834f86ec4f9fb6e606aa` | TMA/非 TMA 分支，consumer wait / WGMMA wait / release 合同 |
| deepseek-ai/DeepEP `f6aa38fe06cd4a0489e7730365d4e0114970a2f3` | `README.md` | `a5df6f4f117774c60f3a2d70ba5996ef56ea32b12b42c25366fd7ba45f67fa3c` | V2.5 移除 V1/NVSHMEM、NCCL GIN、EPBuffer、依赖与 SM 使用边界 |

## 可复算模型

- Occupancy：64 warps、2048 threads、65536 个 32-bit registers、32 CTA、228 KiB Shared 的教学上界；不模拟分配粒度、动态寄存器、cluster 或真实设备 launch 可行性。
- Ring：p ranks、p scalar chunks；每轮先快照全部发送，再更新接收；ReduceScatter 末态 rank r 持有 chunk r，AllGather 后全部 rank 等于直接按列求和的 oracle。
- 通信：标准双阶段 Ring，单 rank 输入 S，发送量 `2(p-1)S/p`；步骤项 `2(p-1)alpha`；带宽为显式有效单向 payload 假设。没有模拟 NCCL 自动算法、协议与争用。
- 在线 softmax：分块递推与一次完整稳定 softmax 独立对照；覆盖不同块边界、大偏移、尾部及全 mask 教学约定（输出零）。不替代 GPU dtype 舍入验证。
- 反例：ReLU 不与 SUM 交换；分片 softmax 输出不能直接平均；bank 与 sector 采用独立地址枚举。

检查入口：`node scripts/check_cuda_model.js`。浏览器演示使用同一纯模型，但测试通过枚举约束、贡献守恒和完整 softmax oracle 检查，不照抄模型的调度公式。

## 验收记录

验收日期：2026-10-30（Asia/Shanghai）。两篇共 41 节、17 张原创 SVG、3 个交互模型；保留既有 Attention / MoE 章节 ID 和深链接。

| 审查维度 | 实际检查与结论 |
| --- | --- |
| 技术正确性 | 逐段核对官方文档及上述源码快照；检查 shape、归约轴、输入输出与字节方向。220 组模型参数案例通过，另含资源非法输入、sector/bank 枚举和非线性反例。正文所用 16 个 NVIDIA 文档页面及其锚点可访问。 |
| 初学者可理解性 | 按线程协作 → 存储 → GEMM → 异步流水 → FA3，以及 rank → collective → 物理路径 → TP/EP → 部署的顺序复读；关键名词首次定义，教学数字标明条件，矩阵两路输入与中间状态明确。此项为作者复核，未进行外部读者测试。 |
| 视觉可用性 | 在 Chromium 中逐张查看 17 张图，修正输入箭头、拓扑连线与文字留白；最终 SVG 文字越界检测无告警。桌面与 390×844 手机布局无整页横向溢出；图示可放大，Ring 表格可横向滚动。 |

- 构建、内容/链接检查、公开产物边界检查、JS 语法检查、模型检查与 `git diff --check` 通过；CI 加入 CUDA 模型检查。
- 浏览器验证模块入口、全文搜索、图示放大与缩放、41 个正文锚点和 12 个学习阶段锚点、旧 Attention/FA3 与 MoE 深链接、笔记和已读持久化。
- 实际操作 occupancy 参数、Ring 前进/后退/重置/跳步与通信成本参数；Ring 最终 16 格均包含全部贡献，值为 `[64,68,72,76]`；未出现脚本异常。
- 实际下载两篇独立 HTML，使用 `file://` 打开并断网重载，确认硬件篇和通信篇的交互可运行。离线内容不依赖外部图片或脚本；外部参考链接仍需网络。
- 生成两篇 A4 打印 PDF，检查图表、参数假设和 Ring 完整末态；操作控件在打印时隐藏，补充末态表保留。复核代表性图表页面，未逐页进行打印纸张实测。

设备编译、GPU 数值测试、Nsight profile、NCCL benchmark 和完整模型性能不在本次执行范围。源码阅读与教学模型验证不构成这些层级的验收。部署状态以对应提交的 GitHub Actions 和 Pages 线上回读为准，不由本记录提前宣称。
