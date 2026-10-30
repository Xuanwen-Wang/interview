# MLA：补齐 Q/K/V 的完整计算图

日期：2026-10-30。范围：Attention 连续 HTML 的 `mla-cache` 与 `mla-absorption`；既有 section、readingStage、legacyChapters ID 保留。这里只做公开源码与配置核对、教学数学检查、页面验收，没有加载 checkpoint 或运行 GPU 性能实验。

## 修订原因与组织

旧正文先讲 c 与缓存，Q 的两级投影和完整输入输出细节位于后文折叠内容中，读者容易将 MLA 误解为“取消 QKV、直接用一个低维向量做 Attention”。新开头先对应普通 MHA 的 Q/K/V，再用同一 DeepSeek-V2 参数画两张完整图：

1. 内容投影关系总览：Q 独立分支、KV 共享下投影 c、各 head 不同的 K/V 上投影；显式注明位置/Norm 在完整图补齐。
2. 计算图一：固定 V2 HF 显式实现，从 x 到 Q/K/V、Norm、解耦 RoPE、展开历史、softmax、PV、O 投影。
3. 计算图二：同模型的紧凑吸收求值；K 上投影移到当前 Q，V 上投影移到 C 加权之后。保留原模型 scale/位置/Norm 边界。

投影小例子与 head 分组局部图移至补充；完整图默认展开。删除原来在吸收节末尾但省略 Q 分支细节的总图，避免两份不同完整度的“完整图”。现有动画保留作逐步放大；正文解释它展示的历史展开步骤是语义对照，不是吸收 decode 必须执行的操作。

## 本轮重新取得的固定来源

- [V2 配置](https://huggingface.co/deepseek-ai/DeepSeek-V2/blob/4461458f186c35188585855f28f77af5661ad489/config.json)，revision `4461458f186c35188585855f28f77af5661ad489`，SHA256 `36f572d2909bd108d73a814c585fd61afd56266960a13eb67c713e229d3435d1`。
- [V2 modeling_deepseek.py](https://huggingface.co/deepseek-ai/DeepSeek-V2/blob/4461458f186c35188585855f28f77af5661ad489/modeling_deepseek.py)，同 revision，SHA256 `82f8aa5e64d53a7f378719798fac763749cff92a6cea8437b9a8d7f37193bb90`。`DeepseekV2Attention` 构造 L711–736、forward L816–898；block 的输入 Norm 见 L1237–1242。
- [DeepSeek-V2 论文 v5](https://arxiv.org/html/2405.04434v5#S2.SS1)，§2.1 与附录 C：低秩参数化、解耦 RoPE、吸收求值。
- [V3 inference/model.py](https://github.com/deepseek-ai/DeepSeek-V3/blob/9b4e9788e4a3a731f7567338ed15d3ec549ce03b/inference/model.py#L439-L496)，revision `9b4e9788e4a3a731f7567338ed15d3ec549ce03b`，SHA256 `fdb7995bc234badbf0011b5af8cf391be94343abc51305428cb9a04452116f02`。只用于核对公开 `naive`/`absorb` 双路径确实保留 Q 与 K/V 上投影作用，不将其模型配置用作 V2 数值。

## 维度、布局与比较边界

固定 V2：H5120、Q rank1536、KV rank512、128 heads、内容 Q/K128、位置64、V128；教学条件 B1 / Qlen1 / N4096，N 包含本步当前位置。

- Q：x → 1536 → RMSNorm → 24576 → reshape [128,192] → 内容 [128,128] 与位置 [128,64]。只有 Q 位置部分做 RoPE。
- KV：一次 Linear 产出 576，拆为 512 内容与 64 位置；只归一化 512 内容。内容上投影合计产出 128×256=32768，拆成 K 内容和 V。位置 key 不经 c 的 Norm，所有 head 共享；V 不做 RoPE。
- 计算图一 沿固定 HF 实现的展开 cache：K [128,4096,192]、V [128,4096,128]，省略 batch；该 cache 会复制共享位置 K，不能把它称为论文的紧凑缓存。
- 计算图二 的历史 C [4096,512]、位置 K [4096,64] 没有 head 轴。每头 Q 经过自己的 A_K 转置映射；每头的 P 加权 C 后，再经自己的 A_V 映射。
- 两图输出均 [128,128] → [1,16384] → [1,5120]。不同省略轴在图注定义；向量 [512] 等省略单 token 轴。
- 原有容量图中的“展开内容 K/V + 一份共享位置 K”是另一种用于隔离存储对象的教学表示，并非计算图一 的 HF 实际 cache；原有 256.5 MiB / 4.5 MiB 口径保持，HF 的 320 MiB 边界在正文补充中保留。
- 数值等价是同一 MLA 参数化内部的线性重排；不是任意 MHA 到 MLA 的无损改造，也不等价于量化或浮点次序逐 bit 不变。

## 验证

待完成本轮实际验收后填写。图中箭头是数据依赖，不是 launch 时间线；计算图二 中 C 同时作为 score 和 value 聚合输入。所有大小均为逻辑 shape，不宣称实际分配或 HBM 流量。
