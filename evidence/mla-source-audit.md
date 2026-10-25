# MLA 教学改写：固定来源与维度复核

核查日期：2026-10-25。范围是公开论文、公开配置和公开源码的静态核对，以及可复算的教学代数；没有运行模型或设备性能测试。下文的字节数均是单请求、单层、BF16 的逻辑容量，不是显存实测或 HBM 事务统计。

## 固定来源

- [DeepSeek-V2 论文 v5，§2.1、§3.1.2、附录 C](https://arxiv.org/html/2405.04434v5)：低秩 KV 联合表示、解耦 RoPE、吸收等价式和模型维度。
- [DeepSeek-V2 官方配置，commit 4461458f186c35188585855f28f77af5661ad489](https://huggingface.co/deepseek-ai/DeepSeek-V2/blob/4461458f186c35188585855f28f77af5661ad489/config.json#L17-L57)：H=5120、128 heads、Q rank=1536、KV rank=512、内容 Q/K=128、位置 Q/K=64、V=128、YaRN 参数。
- [DeepSeek-V2 官方 HF 参考实现，同一 commit](https://huggingface.co/deepseek-ai/DeepSeek-V2/blob/4461458f186c35188585855f28f77af5661ad489/modeling_deepseek.py)：本文所称行号均指原文件行号，不是网页抽取器的行号。
- [DeepSeek-V3 官方推理实现，commit 9b4e9788e4a3a731f7567338ed15d3ec549ce03b](https://github.com/deepseek-ai/DeepSeek-V3/blob/9b4e9788e4a3a731f7567338ed15d3ec549ce03b/inference/model.py#L396-L496)：用来佐证紧凑缓存执行方式确有公开实现。它是 V3 的源码示例，不冒充 V2 的 HF 参考路径，也不混用两个模型的 H 或层数。

## 一次 decode 的完整维度

采用 B=1、当前 Q 长度=1；表中省略这些大小为 1 的前缀。N 表示当前 token 写入后可见的 KV 总长度。此处 x 已经过 block 的输入 RMSNorm；V2 代码在 L1237–1242 先保存 residual，再对 H=5120 归一化并调用 attention。

| 分支 | 步骤 | 结果 shape | V2 源码 |
| --- | --- | --- | --- |
| Q | x5120 → Q down projection | [1536] | L711–717、L816 |
| Q | 对 1536 做 RMSNorm，再 Q up projection | [128,192] | L714–717、L816–819 |
| Q | 拆内容与位置分支 | Qcontent [128,128]；Qposition [128,64] | L818–819 |
| KV | x5120 → 联合投影，拆两部分 | raw latent [512]；raw Kposition [64] | L719–724、L822–826 |
| KV | 只对 latent512 做 RMSNorm | C [512] | L828 |
| KV 展开式 | C → 各 head 的 Kcontent 与 V | Kcontent [128,128]；V [128,128] | L725–729、L827–834 |
| 位置 | Qposition 和 Kposition 各按当前逻辑位置做 RoPE | [128,64] 与 [1,64] | L845–855 |
| score | 内容点积 + 位置点积，统一乘 checkpoint scale | [128,N] | L849–863 |
| output | 每 head 加权 V128，拼接后 O projection | [128,128] → [16384] → [5120] | L886–898 |

关键边界：KV 的 64 维位置分支直接来自 x，经 RoPE 后跨 heads 共享；它没有经过 latent512 的 RMSNorm。Q 的 64 维位置分支来自归一化后的 Q latent1536 的上投影，因而每个 head 可以不同。V 不做 RoPE。Q latent 是当前计算的中间值，不像 KV latent 那样每个历史位置都要留一条。

这里没有 H=head_count×head_dim 的要求：Q 上投影输出 128×192=24576，V 拼接宽度为 16384，最后投影回 H5120。1536、512、128、64 分别承担不同职责，不能统称一个 head_dim。

## 紧凑 decode 的吸收

以下使用列向量。每个 head 的 K 上投影 A_i 为 [128,512]。原本先从历史 C_n[512] 还原 Kcontent_i,n[128]，再与 Qcontent_i[128] 点积；结合律允许先算 Qlatent_i=A_iᵀQcontent_i，得到 [512]，然后直接与每条 C_n 点积。位置分支单独用 [64] 点积后相加。

因此紧凑核的逻辑 Q/K 点积宽度是 512+64=576；模型原始 Q/K 宽度仍是 128+64=192。加权聚合得到每 head 的 [512] latent 输出，再乘 V 上投影 [128,512] 得到 [128]，最后 O projection 回到 H。也可以进一步合并相邻线性权重，但不需要预先物化庞大的合并权重才能获得不展开历史的收益。

V3 官方推理源码直接展示了这一路径：L443–444 分配两份紧凑缓存；L483 做 Qcontent128→512；L484 写入归一化后的 latent；L485 写入 RoPE 后的位置 K；L486–487 计算两种 score；L494 聚合 latent；L495 映射回 V128；L496 做 O projection。相同权重下的两种求值方式在实数代数上等价，有限精度不承诺逐位一致。

不能跨越 RMSNorm 随意合并矩阵，也不能把任意 MHA checkpoint 的 KV 无损压成512后仍宣称模型不变。MLA 的低秩参数化需要对应训练，吸收等价只针对同一个 MLA 模型。

## 为什么完整 RoPE 会破坏这种简单吸收

若在内容 K 上直接套位置旋转，score 是 qᵀR_pᵀR_n A c_n。要移动 A 到 query 侧，得到的 query 变换 AᵀR_nᵀR_pq 依赖每个历史位置 n；不能再只为当前 query 计算一次。一般学习矩阵与旋转矩阵不能交换。

可复算的 2×2 教学反例（不是模型参数）：

```text
A = [[2,0],[0,1]]        R = [[0,-1],[1,0]]  # +90 degrees
q = [1,1]               c = [1,0]           # query rotation is identity

正确：A c = [2,0]；R A c = [0,2]；q·(R A c) = 2
错误：Aᵀ q = [2,1]；R c = [0,1]；(Aᵀq)·(R c) = 1
```

该反例只说明不能把一般上投影与同一个 RoPE 任意换序，不证明所有可能的位置编码或结构化投影都无法设计。DeepSeek-V2 的解决方案是把位置移到独立的 64 维分支，让可吸收的内容分支不做 RoPE。它仍保留位置信息，并不是删除 RoPE。

V2 的 `apply_rotary_pos_emb`（L363–370）先把相邻元素对重排为两半，再调用 `rotate_half`。教学图可以画二维旋转，但实现时必须保留 checkpoint 的配对布局；不能直接照搬另一模型的 split-half 布局。

## scale 与 YaRN

V2 L739–745 的基础 scale 是 1/√192，然后按 checkpoint 的 YaRN `mscale_all_dim` 再调整。固定配置 `factor=40`、`mscale_all_dim=0.707`；L247–250 给出 m=1+0.1×0.707×ln40。因此源码使用的 score scale 为 m²/√192≈0.11472138679292612，基础值 1/√192≈0.07216878364870323。

L289–310 还对 RoPE 频率插值；L316–326 的 cos/sin 幅度修正是两个 mscale 的比值。这个固定配置中 `mscale=mscale_all_dim=0.707`，所以该比值为1。吸收只重排同一数学计算，不能把 scale 改为1/√576；示意图若省略 YaRN，必须标为基础缩放示意。

## 缓存容量与参考实现的区别

下表是按已核实维度推导的 BF16 逻辑张量容量，均为单请求、单层、N=4096，忽略 allocator、分页元数据、padding之外的额外开销。

| 存储方案 | 每位置元素数 | 容量 |
| --- | --- | --- |
| 紧凑 MLA，C512 + 共享位置 K64 | 576 | 4.5 MiB |
| 展开内容 K/V，位置 K 仍共享 | 128×(128+128)+64=32832 | 256.5 MiB |
| V2 HF eager 展开形式，位置 K 复制进每个 head | 128×(192+128)=40960 | 320 MiB |
| V2 HF Flash2 兼容形式，V 还补齐到192 | 128×(192+192)=49152 | 384 MiB |

V2 HF eager 在 L853–859 将展开的 K/V 交给 cache.update；Flash2 在 L981–991 先拼 K、将 V 从128补零到192，再交给 cache.update。**该固定版本的官方 HF 参考实现不能用来证明已经采用512+64的紧凑缓存。** V3 的 naive/absorb 双分支才是本审计所核验的公开紧凑执行例。

“256.5 MiB→4.5 MiB，57倍”是同一组维度下展开内容与紧凑表示的容量比较，不是端到端速度或论文的跨模型93.3%结论。MLA 每个位置仍保留一条记录，dense MLA 每个 query 仍遍历所有 N 个可见位置；它压缩的是每条记录宽度，不是位置数量。实际带宽还取决于跨 head 复用、缓存层级与核实现。MLA 也不保证比任何 MQA 都小，必须比较各自 rank、head 数、维度与精度。

## 演进关系应画成分支，不画成所有方案都继承 MLA

- [MQA（2019）](https://arxiv.org/abs/1911.02150v1) 与 [GQA（2023）](https://arxiv.org/abs/2305.13245v3)：通过共享 KV heads 降低每位置的存储数量；时间上先于 MLA。
- [FlashAttention（2022）](https://arxiv.org/abs/2205.14135v2)：通过分块、融合和在线 softmax 改变 IO，属于执行策略，可与不同 attention 结构组合。
- [Linear Attention（2020）](https://arxiv.org/abs/2006.16236v3)：利用特征映射和结合律走递归状态路线，早于 MLA；不是 MLA 的后代。
- [DeepSeek-V3.2 DSA（v1，§2.1）](https://arxiv.org/html/2512.02556v1#S2.SS1)：这一具体模型在 MLA 的紧凑共享表示上增加 indexer 和 Top-k，是“压缩每条历史 + 选择部分历史”的组合。indexer 自身扫描与 cache 留存需要另算；不能把所有 sparse attention 都说成 MLA 衍生。
- [Kimi Linear（v2，§3–4）](https://arxiv.org/html/2510.26692v2#S4)：KDA 属于 Delta/门控递归状态路线；模型把 KDA 层与 full MLA 层按3:1混合，且其 MLA 层使用 NoPE。混合使用不是算法血缘，也不能把 DeepSeek-V2 的64维位置分支硬套到全部 MLA 变体。

推荐主线：上下文增长使历史读取变贵；不同方法分别改变“存几套”“每套多宽”“读哪些位置”“是否保留逐位置历史”“中间结果怎样搬运”。这是共同目标，而不是单一的 MLA 继承树。
