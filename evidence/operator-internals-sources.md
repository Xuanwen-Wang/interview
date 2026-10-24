# 算子数据流与上游编译器内部机制：来源和验证

核验日期：2026-10-24（Asia/Shanghai）。本轮新增 `content/16-operator-dataflow.json` 和 `content/50-compiler-internals.json`，共 8 章、59 节、42 道问答、14 张原创 SVG。图中的流程与数值为教学重绘，不是性能截图。

## 版本边界

| 来源 | 本轮绑定版本 | 用途 |
| --- | --- | --- |
| 官方 `triton-lang/triton` | `1d503a35275625d2c236605a42855bfd81267047` | ASTSource、AST lowering、NVIDIA backend stages |
| 官方 `llvm/llvm-project` | `5916210dbe10049c264ecf0a0ad685d101c392d9` | MLIR 对象、pass、pattern、conversion；LLVM 中端与 codegen |
| `zeus_dev` | `05ee10f9cc25d19fca0a144ae095c79b3a888976` | 内部 next 模型配置、DSA/KDA runner 与独立参考 |
| `torch_zeus` | `68f19fa0a159b8ff861dc9cf736d9c0ae64906ba` | DSA 三阶段融合内核与 payload |
| 本地 518 Triton fork | `7df590e44739a6da641d3402ed9d33892746a53d` | 只用于提醒版本不同，不以它证明当前上游阶段 |
| `triton_shared` | `82613bc2eb30feb9ef7f57aef20584df0ef9e28a` | 与既有 ZeusLow / 自定义后端章节的边界一致性 |

前两项通过官方 GitHub API 解析当时 main 的 SHA，并读取该 SHA 的官方源码/文档；网页入口为阅读便利，不替代固定 SHA。上述业务库只读。GitHub 业务源码链接的可访问权限由原仓库独立控制；本指南公开不改变原仓库权限。内部 GLM5Next 的 shape、状态、融合边界不等同于公开 GLM-5，也不等同于 Kimi Linear/DeepSeek 的所有实现。

## 算子数据流来源

- GQA/FlashAttention 的数学与 IO 思想：[GQA](https://arxiv.org/abs/2305.13245)、[FlashAttention](https://arxiv.org/abs/2205.14135)、[官方 Triton attention 教程](https://triton-lang.org/main/getting-started/tutorials/06-fused-attention.html)。本章 B2/H4096/hq32/hkv8/d128/N4096 是原创教学配置，非某产品性能规格。
- 内部 DSA 调用图、工作区和独立 CPU 参考：[dev_dsa_deepfused_cp4_dp4.py](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_dsa_deepfused_cp4_dp4.py)。重点核对投影权重形状、`wire_bytes=out_bytes+4096`、BF16 transport 的字节 view、三计算阶段/三 collective、pool 组展开与 live tail。
- DSA P1：[sgl_dsa_proj_indexer_topk1.py](https://github.com/DarronTam/torch_zeus/blob/68f19fa0a159b8ff861dc9cf736d9c0ae64906ba/sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_proj_indexer_topk1.py)。CP owned query heads 为 16，合并后主 attention 为 64 heads；不能将前一边的 shape 直接套到后一边。
- DSA P2/P3：[sgl_dsa_topk2_gather_attn.py](https://github.com/DarronTam/torch_zeus/blob/68f19fa0a159b8ff861dc9cf736d9c0ae64906ba/sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_topk2_gather_attn.py)、[sgl_dsa_absorb_proj.py](https://github.com/DarronTam/torch_zeus/blob/68f19fa0a159b8ff861dc9cf736d9c0ae64906ba/sgl-kernel-zeus-triton/python/glm53_flash/dsa/sgl_dsa_absorb_proj.py)。核对 latent value、O/LSE 合并和最终投影，不把它概括为普通 TP all_reduce。
- DSA 公开算法背景：[DeepSeek-V3.2](https://arxiv.org/abs/2512.02556)，2025-12-02 提交。公开报告只解释 indexer/稀疏主 attention 的方向，内部 kpool、尾部规则和 wire ABI 由上述固定源码证明。
- 内部 KDA：[dev_linear_attn_fused_tp4_dp4.py](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/dev_linear_attn_fused_tp4_dp4.py)、[config_next.json](https://github.com/bjxx-algo/zeus_dev/blob/05ee10f9cc25d19fca0a144ae095c79b3a888976/model_state_dev/glm5next_modules/configs/config_next.json)。核对 TP4 后 16 heads、6144 宽 QKV、tap-major conv 池、递归状态物理转置、safe_gate、BF16 舍入和最后 SUM。
- KDA 公开背景：[Kimi Linear](https://arxiv.org/abs/2510.26692)，v1 为 2025-10-30，v2 为 2025-11-01。safe_gate 的具体公式、当前状态精度和 runner 布局是内部实现事实，不泛化成所有 KDA 的唯一数学实现。

## Triton 与 MLIR 官方材料

官方 Triton 的 [compiler.py](https://github.com/triton-lang/triton/blob/1d503a35275625d2c236605a42855bfd81267047/python/triton/compiler/compiler.py)、[code_generator.py](https://github.com/triton-lang/triton/blob/1d503a35275625d2c236605a42855bfd81267047/python/triton/compiler/code_generator.py)、[NVIDIA compiler.py](https://github.com/triton-lang/triton/blob/1d503a35275625d2c236605a42855bfd81267047/third_party/nvidia/backend/compiler.py) 是阶段与入口的固定证据。`make_ttir`、`make_ttgir`、`make_llir`、`make_ptx`、`make_cubin` 和 `add_stages` 在该版本成立；Gluon 分支有自己的入口。另核对 [vector add 教程](https://triton-lang.org/main/getting-started/tutorials/01-vector-add.html) 和 [dialect 目录](https://triton-lang.org/main/dialects/dialects.html)。教材将 TTGIR layout 描述为目标/版本相关，未把 NVIDIA CTA/warp/lane 编码当成 518 必经对象。

下列固定源码均来自 `llvm/llvm-project@5916210dbe10049c264ecf0a0ad685d101c392d9`：

| 相对路径 | 核验内容 |
| --- | --- |
| `mlir/docs/LangRef.md` | Operation、Block、Region、SSA、SSACFG/graph region |
| `mlir/docs/DefiningDialects/Operations.md` | ODS、约束、trait/interface、生成与自定义 verifier |
| `mlir/docs/DefiningDialects/_index.md` | dialect/context 注册与加载职责 |
| `mlir/docs/Interfaces.md` | interface 的通用算法合同与实现 |
| `mlir/docs/PassManagement.md` | OperationPass 并发限制、嵌套 PM、分析缓存/失效、failure |
| `mlir/docs/PatternRewriter.md` | 匹配成功前不变更、rewriter 通知、driver、递归边界 |
| `mlir/docs/Canonicalization.md` | best effort、预算、fold 范围、不能依赖 canonicalizer 修正确性 |
| `mlir/docs/DialectConversion.md` | legal/illegal/dynamic/recursive、full/partial/analysis、TypeConverter、materialization |

各章 sources 已给出以上每份文档的精确 GitHub SHA 链接。在线入口也已浏览核对。ODS、C++ pattern 片段注明为省略工程定义的教学片段，不能直接拿孤立片段当完整可编译工程；完整 `choose` MLIR 示例与 pair 类型转换例子是原创手推材料。

## LLVM 官方材料

同一固定 SHA 的 `llvm/docs/LangRef.md`、`NewPassManager.md`、`AliasAnalysis.md`、`MemorySSA.md`、`Vectorizers.md`、`CodeGenerator.md`、`LoopTerminology.md`。注意当前该版本使用 `.md` 文件名，不沿用旧版 `.rst` 路径。

重点核对：模整数与 poison/overflow flags；opaque ptr；Module/CGSCC/Function/Loop adaptor；分析缓存失效；AA 与 MemorySSA 分工；循环 header 支配回边源块；LICM 的内存与执行安全；Loop Vectorizer/SLP；机器选择、legalization、调度、RA、MC 的职责。LLVM dialect、LLVM IR、Machine IR、PTX 与 ZeusLow/zbin 分开解释。没有宣称所有机器后端都已经改用新 PM，也没有把自研 ZeusLow CodeGen 说成自动复用 LLVM target 后端。

## 数学与静态核验范围

- GQA 投影权重 80 MiB；四投影 167,772,160 FLOPs；QK/PV 134,217,728 FLOPs。B2 的 K/V 各 16 MiB。N 包含当前新 token，旧缓存 N−1，避免 off-by-one。
- GQA group=4/R128/d128 的双缓冲教学片上净数据为 133.03125 KiB；每 tile 核心 262,144 FLOPs，唯一 KV 64 KiB，AI=4 FLOP/B。另明确布局 padding、元数据、其他临时量未计。
- DSA packed row 为 512 FP8 + 4×FP32 scale = 528 bytes；2048 行为 1.03125 MiB，65536 行为 33 MiB。该比例只比较主 latent 的逻辑读取，未计 indexer、事务放大与重复加载。
- DSA O/LSE wire：capacity1 为 68 KiB，capacity6 为 388 KiB；LSE 有效 payload 每请求 256 bytes，但当前预留区域为 4096 bytes。分配字节不等于实际链路总字节。
- KDA 本地 QKV BF16 权重 48 MiB、输出投影 16 MiB；两项每请求 67,108,864 FLOPs。16×128×128 BF16 递归 state 为 512 KiB，完整读写为 1 MiB；3×6144 BF16 conv state 为 36 KiB。
- KDA 非对称 2×2 状态手算得到 `S_new=[[0.875,2],[3,4]]`、`o=[3,4]`；刻意让当前输出可能相同但状态错误仍影响未来，说明必须双验 output/state。
- 合成 IR、教学数学与图是作者推演；本轮未运行这些新片段的 MLIR/LLVM parser，未编译上游 Triton GPU kernel，未新增 CUDA/518/CycleSim/VCS/RTL/硅上性能测量。正文明确这些层级，不把读源码与手算写成设备验收。

本轮没有新增读取 Codex 历史记忆来证明事实；业务事实均回到固定当前源码，早期算法六章的历史线索记录仍见 `algorithms-sources.md`。

静态验证结果：全站 chapter ID 无重复；本轮每章 6–9 节且至少 5 问；所有 14 个 SVG 可由 XML parser 解析；HTML 未引入脚本、事件属性或个人绝对目录；上述字节、FLOPs、tile 账本与 KDA 2×2 更新经独立 Python 算术断言通过。另只读交叉检查 `practice/*` 和 `content/70-coding-workshops.json`，复算 diamond φ 边活跃集、u32 溢出后保留 observe、TopK tie/第 k 小；源码与正文一致，未发现需修复的算法/SSA/调度合同问题。CUDA 示例仅静态审查，未升级其原有“未 GPU 验证”标识。

独立复核闭环：修正两张流程图原先串联箭头造成的假依赖。FlashAttention 的下一块预取改为与当前块计算独立的支路；KDA 短卷积改为“旧 3 tap”和“当前 QKV”两输入共同供给卷积与移位更新。另对照 DSA runner 的 `logits = q[tok] @ kv.T * (256 ** -.5)`，补上吸收后 latent 维变为 512 仍保留原始 256 维缩放因子的说明。两图重新通过 SVG XML 解析；未改变数学算例与性能账本。

编译专题独立复核闭环：依据固定版 `DialectConversion.md` 的 Type Safety 小节，限定 adaptor 的合法化类型保证仅适用于构造时绑定 TypeConverter 的 conversion pattern；未绑定时只传最近映射值，并排除 materializations。正文、图注与问答同步补全条件，避免把条件性框架合同泛化到所有 pattern。DSA 中 512→256 的 per-head value 操作统一称“投影”，删除可能误解为维度增加的“升维”措辞。
