# PagedAttention：分页 KV 管理与 decode 数据流

采集日期：2026-10-29。指南基线 `5488f291100fc84af2966c021e98f763702a7a8c`。本轮在既有 Attention HTML 中增加一个连续小节和阅读阶段，保留原章节、笔记及深链接 ID。

## 来源与版本

- [PagedAttention 原论文 v1](https://arxiv.org/html/2309.06180v1)：§4.2–4.4 的逻辑块/物理块、按需增长、共享与写时复制；§5 的缓存访问与拷贝；§7 的块大小与额外成本。原文性能是历史实验，本教程不移用其加速倍数。
- vLLM **v0.6.4** 固定到 `02dbf30e9a4389b41d95dd595bfe1224592dd404`，经 tag 查询和公开源码读取核验；属于历史实现，不声称是当前后端。
  - `csrc/attention/attention_kernels.cuh`：L89–139 参数、有效长度与分区范围；L156–160 GQA head映射；L257–281 K物理块地址；L394–445 V地址与尾块无效值处理；L566以后分区归约。`PARTITION_SIZE`按历史位置分区，不是TP设备数。
  - `csrc/cache_kernels.cu`：L153–193 `reshape_and_cache_kernel`，slot映射、块内偏移、K/V不同物理布局。
  - `vllm/attention/ops/paged_attn.py`：L89–183 `forward_decode` 的v1/v2选择、分区结果与归约。这里的v2不是FA2。
  - `vllm/attention/backends/flash_attn.py`：L932–953，decode调用同时传递`block_table`与`cache_seqlens`；L65–66有该后端块大小约束。教材S=4的逐格图只用于解释，真实shape例选择S=16。
- [vLLM v0.13.0 APC文档](https://docs.vllm.ai/en/v0.13.0/features/automatic_prefix_caching/)：仅佐证前缀prefill复用及其decode边界，不混为v0.6.4实现。当前`latest/design/paged_attention`页面已标记为历史文档，因此源码以固定commit为准。
- 本章Qwen3-8B已有固定配置来源继续作为32个query heads、8个KV heads、D128的依据。S、请求数量与长度是教学选择，不是模型固有属性。

按源码导航先只读检查了算子库的缓存写入入口；本节最终使用可公开追踪的vLLM实现讲解，不把项目特有布局或设备结果泛化。本轮没有修改业务源码、启动模型或运行GPU实验。

## 原创图示与计算范围

新增五张SVG：相同有效KV的预留/按需分配对照、逻辑位置到物理块、真实GQA decode输入输出、共享尾块COW、分页与Flash的组合。每张图标注比较条件、轴/编号含义与教学假设。新增七步动画：查表、全历史归一化、填满尾块、新块分配、完成后回收、另一请求复用。

真实shape算例：单层、BF16、B=2、N=[4097,2050]、Hq32/Hkv8/D128、S16；每token K+V为4KiB，每物理块64KiB。有效KV24588KiB，分配24704KiB，尾部116KiB；核心QK+PV为100712448FLOPs。所有容量是逻辑计算，不是实测HBM流量。预留8192槽/请求仅是显式指定的对照。

## 审查与验证范围

技术审查区分分配容量、有效数据、核心算量、单核延迟和服务吞吐；分页不改变全量Attention可见集合。先定义S、逻辑块、块表、物理槽，再代入模型数值。共享尾块案例明确复制完成、引用解除和GPU完成的生命周期前提；APC与decode读历史分开。

`check_attention_lab.js`新增物理置换、非2次幂块大小、精确跨块边界、带毒尾槽、请求隔离、错误独立归一化反例及容量/FLOPs校验。它们检查CPU教学模型和独立稠密oracle，不是生产kernel验收。

初学者审查按“分配问题→逻辑/物理地址→一次decode→共享→成本→实现”的顺序逐段复读；通用维度先定义，真实模型数字另列。面试问答是原创练习，不作为公司真实题目来源。

视觉审查逐张查看五张SVG、七个动画状态及390px手机末帧。修正了COW图的线穿文字和对比图的卡片标题越界，并使用逻辑位置2到物理槽22的例子避免数值偶合。检查1440px桌面与390px手机、150%图示放大、前后/重置/播放暂停/Home/End、PagedAttention搜索、原MLA旧链接迁移，以及独立Attention HTML的离线操作；无页面错误，手机scrollWidth为390。动画打印保留七步说明和完整末帧、隐藏控件；生成本阅读阶段十页A4 PDF，查看第6页末帧与第9页组合图，未截断。

构建、静态检查、Attention数值oracle、Decode账本、JS语法和公开产物检查通过。截图、PDF和浏览器临时状态仅放在忽略目录，不进入公开产物。未做设备性能或checkpoint精度测试。部署与线上文件一致性在提交后单独核验。
