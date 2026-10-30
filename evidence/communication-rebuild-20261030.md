# GPU 通信课程重构记录

采集与实现日期：2026-10-30。正文仍为 `content/25-cuda-communication.json`，独立入口仍为 `cuda-communication.html`。

## 范围与来源

将原 20 个 section 合并为 8 个较大的学习单元，保留全部 20 个旧 section 锚点、原 stage 入口、chapter ID 与个人记录键。新增 7 张原创静态 SVG、6 个新交互实验；继续使用原 Ring 数学模型与通信成本模型。

参考用户提供图的前后对照与紧凑数据块表达，所有图重新绘制；不嵌入带水印截图，不复制上游界面或动画代码。

| Repository | Fixed commit | Role |
| --- | --- | --- |
| mpitutorial/mpitutorial | `10b191f3f84fc0b7089840fde038d1e2a9d0b324` | 从数据问题推导集合操作 |
| NVIDIA/hoti-gpu-comms-tutorial | `02f0200c79f9329dd74d34313a96561d0217d69b` | 完成、通知与单整数交接 |
| NVIDIA/nccl | `3e46c089f4ae4732722a419eb6096aead7e47a30` | 实际 Ring / 设备 API / 融合实现 |
| microsoft/mscclpp | `c226cc99f5e999e06c5b03779f6f77ad995f4653` | 内存通道、代理通道与信号 |
| huggingface/picotron_tutorial | `8c14c925e2069ec2756cdf1510ed2b8bb56a098e` | TP / DP / bucket 调度 |
| devinjeon/gpu-comm-visualizer | `9799f3da379f909950fafb3d93dd047272c68ff2` | 状态与渲染分离的设计参考 |
| NVIDIA/nccl-tests | `afd59abab774a6a4b492eb344bd0c845a0b7bb4d` | 计时与带宽口径 |

完整路径、raw URL 和 SHA256 见 [source manifest](communication-learning-sources.json)。Qwen3-8B 公开配置核对 H4096/I12288；TP 数、token 数、BF16 通信口径均为明确的教学部署假设。MPI 完成语义按 MPI 4.1 node114 核对，不沿用“所有 collective 都相当于 barrier”的概括。

## 实现与正确性边界

- `scripts/communication_figures.py` 保存原创 SVG 可编辑源；正文嵌入矢量，不依赖远端图片。
- `web/communication-lab.js` 为确定性状态模型，六类实验由元素来源、路由记录或显式时长生成；不模拟 GPU 内存系统或实际网络性能。
- `practice/communication/cpu_reference.py` 是独立的直接计算 oracle；PyTorch/Gloo、PyTorch/NCCL 与原生 CUDA/NCCL 程序分别保留运行入口。
- Ring 模型沿用 `web/cuda-guide.js` 并继续运行原检查，避免改变另一篇 CUDA 指南的模型。
- 所有旧锚点保留为主 section 或内部标题/入口，chapter ID 不变，因此笔记与已读不需要搬迁。

## 已执行检查

- `node scripts/check_communication_model.js`：56 组配置通过，覆盖坐标对应、交换可逆、归约分散、路由唯一性、打包逆映射、热点与零远端流量、通信量、调度依赖和非线性反例。
- `node scripts/check_cuda_model.js`：220 组原模型检查通过，包含 Ring 贡献来源、发送量、softmax oracle 等。
- `python3 practice/communication/cpu_reference.py`：通过，四卡结果 `[64,68,72,76]`；不等样本数均值反例通过。
- `allreduce.py` 已通过 AST 语法检查。

## 尚未作为结果声明的项目

GPU 示例尚未在硬件上编译或运行；没有 NCCL 带宽、H200 kernel 或模型端到端性能结论。本文件固定记录发布前的本地验收；提交、CI 与部署结果以对应提交的 [GitHub Actions 记录](https://github.com/Xuanwen-Wang/interview/actions/workflows/pages.yml) 为准。

## 桌面、交互与离线验收

- Chromium 1440×1000 与 1280×900 桌面布局：无横向溢出；逐张查看 7 张 SVG，并检查六类新交互与既有成本实验。
- 第一组 82 项浏览器检查通过：五种 collective 的输出/来源、Ring 前后步与键盘、TP shape/字节、MoE 热点/本地路径、bucket 排队、信号轮次、20 个旧 section + 6 个旧 stage 的实际跳转、图示放大、笔记/已读/练习状态。
- 第二组 13 项检查通过：搜索命中合并后的正文、独立 HTML 下载、断网后的交互/图示放大/跨章切换、原 CUDA occupancy 交互、打印展开与屏幕控制恢复。
- 后续针对性检查：ReduceScatter 只保留一个输出位置时，选择器同时复位为 0；原生 PDF 打印前后的折叠状态完全一致。
- 打印文件逐页布局抽查：集合操作总图、Ring 状态与阶段结果表；正文、技术补充、代码和练习答案均保留。打印中的阶段表按完整表格避免拆开。
- 离线范围：验证下载内容与构建产物逐字节一致，并在页面加载后禁用网络，检查本地数据/脚本完成交互与跨章重挂载；未用 file:// 冷启动作为证据。
- Python/Gloo 四进程实际运行通过，各 rank 输出 [64,68,72,76]。这是 CPU 分布式语义验证，不是 NCCL/GPU 验证。环境初始化时出现本机 CUDA driver 与 PyTorch 编译版本不匹配的警告，未用于 GPU 测试，也未变更环境。
- 新数学检查与 CPU oracle 已接入 `.github/workflows/pages.yml`；本节所列结果来自本地检查，远端 CI 与发布记录独立核对。

## 三项审阅结论

- 技术正确性：元素来源、数学公式、路由/字节守恒、依赖模型与非线性反例通过独立检查；真实配置和源文件绑定快照。硬件行为与性能仍需目标机器验证。
- 初学者可理解性：按数据归属→程序→算法→路径→依赖→模型→实现→验证串联；首次定义 rank、chunk、payload、T/H/I；每个主要单元提供检查题。结论来自作者按读者视角走读，尚无外部初学者试读结果。
- 视觉可用性：修正通知连线穿字、图中物理路径与映射概念混放、输入输出选择器状态和字体继承；桌面、缩放与打印抽查通过。按仓库约定未进行移动端验收。

## 最终产物标识

- 独立 HTML：`dist/cuda-communication.html`，5,213,481 bytes。
- SHA256：`ad9f62a8eb787549009c351cc1c7cd1d23675d934af3f65da97b7649682d5685`。
- 浏览器下载副本与上述构建产物逐字节一致。
- 最终 A4 打印检查为 40 页；ReduceScatter 阶段表完整保留在第 14 页，打印结束后的折叠状态与开始前一致。
- 构建与 `scripts/check.py` 已通过；SVG、内部锚点、源文件与 portable HTML 一致性已核对。模型与示例同步检查已通过；`git diff --check` 无格式错误。
- 最终 `scripts/check_public_artifact.py` 通过：27 个允许的 Pages 产物，无私人文档或联系方式模式。
