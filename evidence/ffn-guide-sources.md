# FFN / MoE decode 连续教程：来源与算术核验

采集日期：2026-10-25。对应 `content/14-ffn-guide.json` / `ffn-inference-guide`。本轮只读取官方配置、固定版本参考源码与论文，以及本站已有 GLM5Next 证据；没有运行模型权重、设备、CycleSim、VCS 或完整服务性能测试。没有修改业务源码库。

## 1. 两个真实公开配置

| 模型 | 固定 revision | 本篇使用字段 | config.json SHA256 |
|---|---|---|---|
| [Qwen3-8B](https://huggingface.co/Qwen/Qwen3-8B/blob/b968826d9c46dd6066d109eabc6255188de91218/config.json) | `b968826d9c46dd6066d109eabc6255188de91218` | H4096、I12288、hidden_act=silu、BF16 | `f7c4eadfbbf522470667b797a3c89be2524832d2d599797248dc304fff447c30` |
| [Qwen3-30B-A3B](https://huggingface.co/Qwen/Qwen3-30B-A3B/blob/ad44e777bcd18fa416d9da3bd8f70d33ebb85d39/config.json) | `ad44e777bcd18fa416d9da3bd8f70d33ebb85d39` | H2048、moe_intermediate_size=768、E128、K8、norm_topk_prob=true、BF16 | `2850ddb3bf7aecad20b611e2d44f3077fc8193f4827c93beddd4c02ad63c2297` |

该 MoE 配置另有 `intermediate_size=6144`，不能当成单专家宽度；`decoder_sparse_step=1`、`mlp_only_layers=[]`。本篇没有使用 2507、Thinking/Instruct 变体或拼接其他模型参数。BF16 是本文主要账本精度；量化节另立假设。

## 2. 固定参考实现

- [Transformers v4.51.3 / modeling_qwen3.py](https://github.com/huggingface/transformers/blob/v4.51.3/src/transformers/models/qwen3/modeling_qwen3.py)：`Qwen3MLP` 从第 82 行开始，三个无 bias 的 Linear 与 SiLU×Up；`Qwen3DecoderLayer` 从第 256 行开始，303–306 行为 post-attention residual/norm/MLP/add。文件 SHA256：`704c914530530a1acb0b443add1f520404e3ac2c28c0ab7e16f80f86cfe8ccb2`。
- [Transformers v4.51.3 / modeling_qwen3_moe.py](https://github.com/huggingface/transformers/blob/v4.51.3/src/transformers/models/qwen3_moe/modeling_qwen3_moe.py)：223 行为单专家 MLP，239 行为 sparse block，249 行把 `moe_intermediate_size` 传给专家；259–264 行是 FP32 softmax、TopK、按 `norm_topk_prob` 对所选再归一化、转回输入 dtype；后续 expert mask、gather 与加权 index_add 说明参考数据流。文件 SHA256：`3af43d01f9f902c8009b6dd7d7b8b563561b53dd0aa54175f585ae90d049fdb8`。

这些是固定版本参考语义，不宣称所有线上 kernel 都采用其逐专家 Python 循环。图采用逻辑右乘矩阵；`nn.Linear` 存储 `[out,in]`，forward 右乘其转置。

## 3. 可复算账本

约定：乘加=2 FLOPs；MiB=2²⁰ bytes；GFLOPs=10⁹ operations；BF16=2 bytes。唯一权重 payload 不是 profiler 测得的 HBM 事务，假设相关权重没有片上常驻且理想只读取一次。

| 项目 | 算式 | 结果 |
|---|---|---|
| Dense 每矩阵参数 | 4096×12288 | 50,331,648 |
| Dense 三矩阵参数 | 3×4096×12288 | 150,994,944 |
| Dense 三矩阵 BF16 | 3×4096×12288×2 | 288 MiB |
| Dense 单 token 主矩阵 FLOPs | 6×4096×12288 | 0.301989888 GFLOPs |
| Dense B16 / B32 主矩阵 FLOPs | 上项×16 / ×32 | 4.831838208 / 9.663676416 GFLOPs |
| Dense 每份 B16 中间激活 | 16×12288×2 | 384 KiB |
| G/U/A 都完整写读一次 | 6×16×12288×2 | 2.25 MiB |
| 仅 A 完整写读一次 | 2×16×12288×2 | 0.75 MiB |
| 一个 MoE 专家参数 | 3×2048×768 | 4,718,592 |
| 一个 MoE 专家 BF16 | 上项×2 | 9 MiB |
| 128 个专家 BF16 | 128×9 MiB | 1152 MiB = 1.125 GiB |
| 单 token 8 个专家 BF16 | 8×9 MiB | 72 MiB |
| 单 token 专家 FLOPs | 8×6×2048×768 | 75.497472 MFLOPs |
| Router 权重 BF16 | 2048×128×2 | 0.5 MiB |
| Router 单 token 投影 FLOPs | 2×2048×128 | 0.524288 MFLOPs |
| B16 route-expanded BF16 输出 | 16×8×2048×2 | 512 KiB |
| B16 combine BF16 输出 | 16×2048×2 | 64 KiB |
| Dense 假设 INT4 纯权重 | 150994944÷2 bytes | 72 MiB |
| 假设每 128 权重一个 BF16 scale | 150994944÷128×2 bytes | 2.25 MiB |

Dense 三矩阵算术强度仅计权重字节时等于 B FLOPs/byte。实际载入可能因缓存驻留更少，也可能因分块重读、padding、事务或量化元数据更多。

MoE 每行无放回选择 K8、各行独立均匀的教学概率模型：预期专家并集为 `128×(1−(1−8/128)^B)`，B16=82.42251130217052、B32=111.77103534374396；乘每专家 9 MiB，分别为 741.8026017195347 与 1005.9393180936956 MiB。均匀平均组长为 `B×K/E`，包含零行专家；不代表真实 Qwen 路由。

在固定 H 的示意比较中，`E64/K4/I1536` 与 `E128/K8/I768` 的 E×I、K×I、K/E 均相等，因此总专家参数、单 token 专家主矩阵 FLOPs 和均匀平均组长都不变；问题数量、矩阵宽度、元数据和调度开销可以改变。前一组不是虚构的 Qwen 前身，而是明确标注的预算对照。

## 4. 设计来源及使用边界

- [GLU Variants Improve Transformer](https://arxiv.org/abs/2002.05202)：门控与普通 FFN 的函数设计；本文的同预算 I8192 比较是算术推导。
- [Sparsely-Gated MoE](https://arxiv.org/abs/1701.06538)、[Qwen3 Technical Report](https://arxiv.org/abs/2505.09388)：条件计算与公开模型家族背景。
- [DeepSeekMoE](https://arxiv.org/abs/2401.06066)：细粒度与 Shared 分支思想；没有添加进 Qwen3-30B-A3B 主例。
- [CUTLASS Grouped Kernel Schedulers](https://docs.nvidia.com/cutlass/latest/media/docs/cpp/grouped_scheduler.html)：2026-10-25 读取 grouped 多问题 tile 调度机制；此官方文档使用 latest URL，不声称内容永久固定。
- [MegaBlocks](https://arxiv.org/abs/2211.15841)：块稀疏、padding 与不丢 token 的取舍；论文是训练系统，本文不迁移其性能数字到 decode。
- [AWQ](https://arxiv.org/abs/2306.00978)：weight-only 量化与激活统计背景。本文 INT4+BF16 group128 scale 是自定义预算示例，不宣称是 AWQ 或该 checkpoint 的固定编码。
- [Megatron-LM](https://arxiv.org/abs/1909.08053)：TP 的矩阵轴切分思想；本文 TP2 和 EP4 为独立教学部署示意，不宣称 Qwen 默认采用该拓扑。

内部部署桥接只复用 [已有 GLM5Next 固定证据](moe-deployment-current.md)：H4096/E288/I2048/K8+Shared，配合本站 `moe-deployment-walkthrough` 阅读。内部 GLM5Next 不等同公开 GLM-5；源码存在、CPU 合同测试、功能验收、CycleSim、VCS、设备与完整服务各属不同证据层。

## 5. 本轮内容检查

- 18 节、6 个连续阅读阶段、14 张 SVG；每张图有 `figure.diagram`、`viewBox`、`role=img` 与 `aria-label`。
- 原 `ffn-to-moe` 7 个 section 与 `ffn-routing-dataflow` 7 个 section 均提供语义对应 `anchorMap`；这两章未包含额外内嵌 HTML ID。
- Python 复算上述 Dense、MoE、fusion、scale 与随机并集数字；JSON、章节分组覆盖、legacy 目标存在、SVG 标注检查通过。
- 完整网站构建、浏览器布局、交互、搜索、移动与打印由根任务集成检查；本页不提前声称通过。
