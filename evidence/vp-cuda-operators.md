# VP 实际算子：CUDA 对照的公开源码证据

采集日期：2026-10-25（Asia/Shanghai）。用途：为 TopK、sigmoid、RMSNorm 的 518 VP 数据流补充可复核的 CUDA 实现对照。本文不提供 GPU / 518 性能倍率。

<a id="cuda-scope"></a>
<a id="cu-scope"></a>

## 版本与验证范围

| 来源 | 固定版本 | 核验方式 |
| --- | --- | --- |
| `pytorch/pytorch` | `v2.8.0` → `ba56102387ef21a3b04b357e5b183d48f0afefc7` | GitHub 官方仓库 API 将 tag 解析为 commit，再按完整 SHA 读取源码 |
| `vllm-project/vllm` | `v0.10.2` → `01efc7ef781391e744ed08c3292817a773d654e6` | 同上 |
| NVIDIA CUDA 文档 | CUDA 12.8.1 archive；PTX ISA 8.7 | 浏览 NVIDIA 官方归档文档，避免随当前版变化 |
| PyTorch API 文档 | 2.8 | 官方 `torch.topk` 参数与 tie 合同 |

这些是**固定版本源码静态核验与官方接口文档核验**，并非最新版本选型建议。本轮未编译这些 CUDA kernel，未生成或反汇编 PTX / cubin，未执行 GPU、CycleSim、VCS 或真芯片基准。源码中的局部数组体现驻留与复用意图；没有寄存器分配和 spill 证据时，不能断言实际构建一定全在寄存器。CUB 具体实现依赖工具链版本，本文只把明确写出的调用、共享存储与同步作为事实。

API 解析入口：[PyTorch tag](https://api.github.com/repos/pytorch/pytorch/commits/v2.8.0)、[vLLM tag](https://api.github.com/repos/vllm-project/vllm/commits/v0.10.2)。下列正文源码链接均绑定解析出的完整 commit，不把 Git blob SHA 误写为仓库 commit。

<a id="cuda-topk"></a>
<a id="cu-topk"></a>

## 1. 通用 TopK：PyTorch 的 radix selection 与输出排序

固定版本入口：[TensorTopK.cpp:22–98](https://github.com/pytorch/pytorch/blob/ba56102387ef21a3b04b357e5b183d48f0afefc7/aten/src/ATen/native/cuda/TensorTopK.cpp#L22-L98)。该实现存在全排序后截取的条件路径，也有 selection 路径；不能把某条路径泛化成所有 shape 与 CUDA 工具链的行为。

在 selection 路径中：

1. **找第 k 阈值**：single-block `gatherTopK` 调用 `radixSelect`，见 [TensorTopK.cu:78–89](https://github.com/pytorch/pytorch/blob/ba56102387ef21a3b04b357e5b183d48f0afefc7/aten/src/ATen/native/cuda/TensorTopK.cu#L78-L89)。FP32 先转换成保持排序关系的整数表示，NaN 有显式处理，见 [SortingRadixSelect.cuh:13–38](https://github.com/pytorch/pytorch/blob/ba56102387ef21a3b04b357e5b183d48f0afefc7/aten/src/ATen/native/cuda/SortingRadixSelect.cuh#L13-L38)。
2. **逐 radix digit 缩小候选范围**：single-block 版每次取 2 bit，即 4 个桶；各 warp 用 ballot + popcount 计数，warp leader 将计数汇入 shared memory，block 同步后决定下一轮位前缀，见 [SortingRadixSelect.cuh:180–250](https://github.com/pytorch/pytorch/blob/ba56102387ef21a3b04b357e5b183d48f0afefc7/aten/src/ATen/native/cuda/SortingRadixSelect.cuh#L180-L250) 与 [303–426](https://github.com/pytorch/pytorch/blob/ba56102387ef21a3b04b357e5b183d48f0afefc7/aten/src/ATen/native/cuda/SortingRadixSelect.cuh#L303-L426)。这里仍有多轮扫描，不是读一次即完成。
3. **压紧胜出项**：重新扫描输入，对严格大于阈值的元素做 exclusive prefix scan，得到互不冲突的输出地址；再扫描与阈值相等的元素，只补足剩余名额，见 [TensorTopK.cu:91–175](https://github.com/pytorch/pytorch/blob/ba56102387ef21a3b04b357e5b183d48f0afefc7/aten/src/ATen/native/cuda/TensorTopK.cu#L91-L175)。`ScanUtils` 的实际实现是 warp ballot/popcount 加 shared memory 的跨 warp 进位，不应把这段具体代码改述成“全部通过 shuffle”，见 [ScanUtils.cuh:12–75](https://github.com/pytorch/pytorch/blob/ba56102387ef21a3b04b357e5b183d48f0afefc7/aten/src/ATen/cuda/ScanUtils.cuh#L12-L75)。
4. **按需排序结果**：`sorted=True` 且结果有多个元素时，对选出的 K 项另行排序。小结果可原地排序；另一分支另分配临时 tensor，再排序和 gather，见 [TensorTopK.cpp:74–98](https://github.com/pytorch/pytorch/blob/ba56102387ef21a3b04b357e5b183d48f0afefc7/aten/src/ATen/native/cuda/TensorTopK.cpp#L74-L98)。`sorted=False` 表示不要求有序，不表示保证乱序。

multi-block 路径另有 256 threads/block、每轮 8 radix bits 的实现，使用工作区和多次 kernel launch；分派依据 slice 数量与长度，见 [TensorTopK.cu:227–233](https://github.com/pytorch/pytorch/blob/ba56102387ef21a3b04b357e5b183d48f0afefc7/aten/src/ATen/native/cuda/TensorTopK.cu#L227-L233)、[629–754](https://github.com/pytorch/pytorch/blob/ba56102387ef21a3b04b357e5b183d48f0afefc7/aten/src/ATen/native/cuda/TensorTopK.cu#L629-L754)、[761–778](https://github.com/pytorch/pytorch/blob/ba56102387ef21a3b04b357e5b183d48f0afefc7/aten/src/ATen/native/cuda/TensorTopK.cu#L761-L778)。不能把 single-block 的“2 bit/轮”推广给整个 PyTorch CUDA TopK。

官方 [torch.topk 2.8 文档](https://docs.pytorch.org/docs/2.8/generated/torch.topk.html) 不保证并列元素的 indices 稳定。某个源码分支按扫描次序补 tie，不等于 API 对所有设备、shape、算法分派承诺“总选小 index”。

<a id="cuda-moe-topk"></a>
<a id="cu-moe-topk"></a>

## 2. 小 K 路由：vLLM 也反复 argmax，差别在候选如何留住

更接近 MoE router 的实例是 [topk_softmax_kernels.cu:183–393](https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/csrc/moe/topk_softmax_kernels.cu#L183-L393)。`topkGatingSoftmax` 将 Softmax、argmax 和 TopK 融合在一个 kernel 中，优化目标是较小的 expert 数与小 K；并非所有 CUDA TopK 都必须 radix selection。

| 阶段 | 实际数据流 | 固定源码 |
| --- | --- | --- |
| 输入分配 | 一行分到一个 warp 的 subgroup；每线程持有 `row_chunk[VPT]`，按向量化形式加载自己的元素 | [197–269](https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/csrc/moe/topk_softmax_kernels.cu#L197-L269) |
| Softmax | 线程内最大值 → shuffle-xor 归约 → 局部 `expf(x-max)` → shuffle-xor 求和 → 局部归一化 | [272–316](https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/csrc/moe/topk_softmax_kernels.cu#L272-L316) |
| 第 j 个 winner | 每线程扫描自己的局部候选，shuffle-xor 同步比较 `(value, index)`，同值时小 index 胜 | [323–361](https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/csrc/moe/topk_softmax_kernels.cu#L323-L361) |
| 输出与失效 | subgroup leader 写该名次的值与 index；持有 winner 的线程修改自己的局部数组元素，进入下一轮 | [363–390](https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/csrc/moe/topk_softmax_kernels.cu#L363-L390) |

CUDA 分支的 `WARP_SIZE=32`，上述宏实际落到 `__shfl_xor_sync`，见 [cuda_compat.h:35–50](https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/csrc/cuda_compat.h#L35-L50)。该专用路径不需要将完整 Softmax 行写到全局工作区再读回 TopK；一般路径仍可能使用两个 kernel 与 Softmax 工作区，见 [449–524](https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/csrc/moe/topk_softmax_kernels.cu#L449-L524)。

**E=288 不走这里的专用路径**：该版本 switch 明确列举 power-of-two 1–512，以及 CUDA 的 192、320、384、448、576，没有 288。E=288 落入 default，先 `moeSoftmax<TPB=256>` 写工作区，再 `moeTopK<TPB=256>` 读工作区；其 TopK 循环会重扫输入，并检查此前选择的 indices，见 [114–178](https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/csrc/moe/topk_softmax_kernels.cu#L114-L178)。因此不能把 E=256 的候选复用结论直接套到 E=288；也不能把报错字符串“power of 2 or multiple of 64”理解为所有满足该描述的整数都有专用实例。

由该固定版本模板参数可手推一个具体映射：`E=256` 选择 16-byte 载入配置，`VPT=8`、`THREADS_PER_ROW=32`、每 CTA 4 个 warp。lane `l` 负责 `4l+[0,1,2,3]` 和 `128+4l+[0,1,2,3]`；一个 warp 处理一行。每个 winner 的跨 lane 比较需要 5 个 butterfly stage，每 stage 交换 value 和 index。模板常量和分派证据见 [395–423](https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/csrc/moe/topk_softmax_kernels.cu#L395-L423)、[459–491](https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/csrc/moe/topk_softmax_kernels.cu#L459-L491)。**这是源码映射与循环次数的手推，不是已测延迟**；5 stage 也不等于 5 个 GPU cycle。

这一路 CUDA shuffle 的参加 mask 是 `uint32_t(-1)`，宽度参数是 `THREADS_PER_ROW`；width 切分交换寻址范围，不替代参加 mask。模板要求行宽线程数是 2 的幂、整除 warp size 且不超过 warp size。E=256 时 width=32，一整 warp 处理同一行；尾部 `thread_row >= num_rows` 使整个越界 warp 退出，合法行的 32 个线程共同参与归约。该函数的 launch bound 是 128 threads，不能把它误读成 GPU `sm_128` 或特定型号；本次没有固定编译目标或实测寄存器数量。

这提供一个公平的比较方向：两端都可能用 K 轮 argmax，差异应追到候选状态的位置、winner index 的传播方式、失效操作是否要求重新流经向量通路，以及能否融合上游激活。不应把差距解释成“CUDA 有一条硬件 TopK 指令”。此例是 Softmax 路由，不直接等价于带 bias、group routing、Sigmoid 分数或后置权重归一化的其他业务合同。

<a id="cuda-sigmoid"></a>
<a id="cu-sigmoid"></a>

## 3. Sigmoid：PyTorch 的源码表达、运算精度与数学库边界

固定版本实数路径位于 [UnarySpecialOpsKernel.cu:151–158](https://github.com/pytorch/pytorch/blob/ba56102387ef21a3b04b357e5b183d48f0afefc7/aten/src/ATen/native/cuda/UnarySpecialOpsKernel.cu#L151-L158)：`gpu_kernel` 的每元素 lambda 在 `opmath_t` 中计算 `1 / (1 + std::exp(-a))`，再转换为输出类型。[OpMathType.h:14–26](https://github.com/pytorch/pytorch/blob/ba56102387ef21a3b04b357e5b183d48f0afefc7/aten/src/ATen/OpMathType.h#L14-L26) 明确 Half、BFloat16 的内部运算类型为 float。

该算子没有跨元素归约：输入值进入线程的局部标量计算链，neg / exp / add / divide 的中间量不需要在源码中分配成独立全局 tensor。不能把 `torch.sigmoid(x)` 理解为每个算术步骤必然各 launch 一个 kernel。反过来，这不证明后续 `torch.topk` 会自动与它融合。

必须区分三层：

- **固定 PyTorch C++ 源码事实**：这里写的是 `std::exp`，不是 `__expf`。
- **CUDA 数学 API 合同**：[普通单精度数学函数](https://docs.nvidia.com/cuda/archive/12.8.1/cuda-math-api/cuda_math_api/group__CUDA__MATH__SINGLE.html) 定义 `expf`；[单精度 intrinsic](https://docs.nvidia.com/cuda/archive/12.8.1/cuda-math-api/cuda_math_api/group__CUDA__MATH__INTRINSIC__SINGLE.html) 将 `__expf` 定义为快速近似。`--use_fast_math` 可以改变受影响函数的映射与精度/特殊值处理，见 [CUDA 12.8.1 Intrinsic Functions](https://docs.nvidia.com/cuda/archive/12.8.1/cuda-c-programming-guide/index.html#intrinsic-functions)。
- **最终指令事实**：[PTX 8.7 的 `ex2.approx.f32`](https://docs.nvidia.com/cuda/archive/12.8.1/parallel-thread-execution/index.html#floating-point-instructions-ex2) 是近似 `2^x`；数学上可以用 `exp(x)=2^(x·log2(e))` 构造 exp 路径，但这不证明当前 PyTorch binary 的 exp 只含一条 EX2，更不证明完整 sigmoid 是“一条 SFU 指令”。判断实际序列必须绑定 GPU target、nvcc / libdevice、编译 flags 与反汇编。

对 518 的有效追问是：PRG 参数和表项准备是否可复用、完整 sigmoid 拆了几段流、哪些段产生 L2 中间结果、精度边界允许哪些融合。不能仅凭两端都有 exp/倒数功能就认为实现成本等价，也不能以不同精度或不同输入范围的近似结果直接比较。

<a id="cuda-rmsnorm"></a>
<a id="cu-rms"></a>

## 4. RMSNorm：同一 kernel 内归约与输出，仍可能重读 input

固定 vLLM basic kernel 在 [layernorm_kernels.cu:15–44](https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/csrc/layernorm_kernels.cu#L15-L44)。数学目标为 `r = rsqrt(sum(x_i²)/D + ε)`，`y_i = x_i · r · w_i`。

实际执行顺序：

1. `grid(num_tokens)`、`block(min(hidden_size,1024))`，即每 token 一 block，见 [350–370](https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/csrc/layernorm_kernels.cu#L350-L370)。每线程按 `threadIdx.x + n·blockDim.x` 遍历自己的列。
2. 第一轮循环将输入转换为 float，在线程内累计平方和；调用 `cub::BlockReduce<float,1024>` 与 shared `TempStorage` 合并 partial sums。
3. thread 0 计算 `rsqrtf(variance/hidden_size+epsilon)`，写 shared `s_variance`，随后全 block `__syncthreads()`。
4. 第二轮循环**再次读取 input**，计算缩放与权重乘法并写结果。源码没有保存整行输入的局部数组；不能描述成“这个 vLLM RMSNorm 整行只读一次、全部驻留寄存器”。

一条真实的数值细节是输出表达式先做 `((scalar_t)(x * s_variance))`，再乘 `weight[idx]`。当 `scalar_t` 是低精度类型时，这个显式 cast 是舍入边界，不能静默替换成“全部 FP32 乘完、仅最终输出 cast”后仍宣称与这段源码位级等价。

归约可用的典型 CUDA 教学结构是线程局部累加 → warp shuffle 树 → 各 warp leader 写 shared partial → block barrier → 最终归约。官方 [warp primitives 说明](https://developer.nvidia.com/blog/using-cuda-warp-level-primitives/) 展示了 32-lane shuffle reduction 和寄存器间交换；本文件中 vLLM 的 CUB 调用并未固定工具链内 CUB 的所有内部步骤，不把该教学树直接冒充它的已编译实现。

[CUDA Math API 的 `rsqrtf`](https://docs.nvidia.com/cuda/archive/12.8.1/cuda-math-api/cuda_math_api/group__CUDA__MATH__SINGLE.html) 定义倒数平方根，[PTX `rsqrt.approx.f32`](https://docs.nvidia.com/cuda/archive/12.8.1/parallel-thread-execution/index.html#floating-point-instructions-rsqrt) 提供相应近似指令。API 名称本身不确定最终指令数和吞吐。

`fused_add_rms_norm` 还有 FP16/BF16 packed vector 路径，先合并 residual，再归约和归一化，见 [47–104](https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/csrc/layernorm_kernels.cu#L47-L104)。其向量宽度、对齐条件与 token 数相关 block size 分派见 [383–425](https://github.com/vllm-project/vllm/blob/01efc7ef781391e744ed08c3292817a773d654e6/csrc/layernorm_kernels.cu#L383-L425)。它仍将 residual 写出再读入；这是输出合同和实现选择，不能宣称“融合意味着零中间访存”。

<a id="cuda-comparison"></a>
<a id="cu-execution"></a>

## 5. 对比可以证明什么

| 维度 | 公开 CUDA 材料能证明的内容 | 不应据此宣称 |
| --- | --- | --- |
| 状态与通信 | CUDA warp 为 32 threads；shuffle 支持 warp 内交换；局部变量、shared memory、barrier 可被算子代码组合使用 | 一个 warp 等于一个 VP，或一个 VP 等于一个 SM |
| TopK | 同时存在通用 radix 路径和小 K 重复 argmax 专用路径 | CUDA 全部用同一算法；TopK 一条指令完成 |
| Sigmoid | 一个每元素 kernel 可表达完整数学链；普通 exp 与近似 intrinsic 合同不同 | 任意源码 `exp` 都是一条 EX2；任意精度可互换 |
| RMSNorm | 一个 block 内完成局部平方和、block 归约、标量变换、广播与输出 | 所有实现都只读一次 x；所有中间值必然在寄存器 |
| 性能 | 可以据状态复用、阶段数、同步和访问位置提出瓶颈假设 | 未经匹配测试给出 VP 与整颗 GPU 的倍数或绝对延迟 |

CUDA 执行与资源依据：[SIMT Architecture](https://docs.nvidia.com/cuda/archive/12.8.1/cuda-c-programming-guide/index.html#simt-architecture)、[Hardware Multithreading](https://docs.nvidia.com/cuda/archive/12.8.1/cuda-c-programming-guide/index.html#hardware-multithreading)、[Warp Shuffle Functions](https://docs.nvidia.com/cuda/archive/12.8.1/cuda-c-programming-guide/index.html#warp-shuffle-functions)。资源容量和 warp 调度约束依 GPU 架构而定；更多局部状态也可能增加寄存器压力、降低 occupancy 或 spill。

如制作教学流量账本，必须标注为**源码层逻辑请求量**：未融合 sigmoid 的最低输入/输出净 payload 是 `2·N·sizeof(dtype)`；本 vLLM basic RMSNorm 每行显式请求 `2D` 个 x、`D` 个 weight、`D` 个输出，共 `4D·sizeof(dtype)`。这些式子没有计入 cache 复用、事务粒度、元数据、spill、工作区或并发干扰，不能当 HBM/DDR 实测流量；更不能把 518 L2 中间搬运与 GPU HBM 数直接作带宽倍率。

一次可用于性能结论的匹配实验至少绑定：输入 shape/stride、dtype 与累加精度、NaN/Inf 与 TopK tie/sorted 合同、ε、融合边界、编译版本与 flags、GPU 型号/频率、518 资源范围、输入分布和计时范围。GPU kernel 时间与 518 CycleSim/VCS 时间分别报告；单 VP、四 VP、单芯片与整 GPU 的资源边界分别说明。
