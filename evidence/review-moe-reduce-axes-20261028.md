# MoE 本地 Reduce、TP 与 EP 求和的讲解复核

核对日期：2026-10-28（Asia/Shanghai）。用户反馈：总流程虽然列出了通信，但未明确本地 Reduce 与 TP AllReduce 的差别，也难以看出每次通信到底计算什么。

## 实现依据

沿用并复核 `moe-communication-20261028.md` 的版本边界：

- torch_zeus `58e71d46629677b43e797deaae02d1a50eb72e57` 的 `sgl-kernel-zeus-triton/python/glm53_flash/moe/sgl_moe_reduce_sparse_fast.py`：先由 Shared 双 core 初始化，再按当前有效路由逐项加权累加；不调用跨 rank collective。文件 SHA256 为 `70ae7ea696788927449a83348cc430006825584b3fad61bde89c719b6fa887b9`，与上次固定来源一致。
- zeus_dev `05ee10f9cc25d19fca0a144ae095c79b3a888976` 的 `model_state_dev/backup/dev_glm5next_model_decode_modular_test.py:412–427`：外层依次 AG → rank-local MoE → TP SUM → EP RS。文件 SHA256 为 `94c6e7658a59082cf5e379bcc74852dab9e8fdd1af733a5e87f0739821ab88e5`；工作区该文件无修改。
- `model_state_dev/glm5next_modules/_support/_comm.py:67–148`：BoardReplicated collective 的逻辑同 lane 分组与 world16 调用约束。它不能被描述成四次独立普通 collective。

四 kernel 来自优化实现；外层通信采用归档的 TP4×EP4 decode 基线。本文没有据此断言所有部署都使用 AG/RS，也没有核实 AF AllToAll 方案的最新落地状态。

## 内容修改

- 在既有 `dep-t24` 入口直接加入四步对照，不要求读者先跳到后半篇找 Reduce 定义。
- 保留所有原 section ID，新增紧邻总流程的 `dep-reduce-axes`，纳入同一阅读阶段、同一 HTML。
- 新图固定 token7 的同一个输出特征，依次展示本 rank 专家加权、卡内四个 TP 分片求和、跨卡专家求和。总图也改为标明每一步的求和对象。
- 明确通信 payload 是 Down 之后的 P/B `[24,4096]`；I512 是计算通道范围，TP SUM 不会拼接列，也不再乘 α 或除以4。
- 交互每张卡显示当前步骤的加法，区分本地 Reduce、C2、C3；在 AllGather 步只解释拼接，不提前显示尚未计算的最终答案。
- 补充 Shared 只贡献一次、C2 后不能对16份副本做普通 world SUM、C3 不能用纯 Scatter 代替等反例。

## 数值与技术复核

真实模型维度仍为 H4096、I2048、E288、Top8、Shared1、TP4/EP4。T24 与按卡均分六行是已声明的布局算例；IDs、α与 partial 为构造数据，未声称来自真实请求。

沿用现有交互的构造：slot k / TP p 的单特征贡献是 `(k+1)(p+1)(token+1)/8`；各 α=0.3125；EP0 Shared 为 `(p+1)(token+1)/8`。图中将 Shared 示意均分给两个 core，不推断真实两份值相等。

- token7、rank0：`0.5 + 0.5 + 0.3125×1 + 0.3125×2 = 1.9375`。
- 卡0 TP：`1.9375 + 3.875 + 5.8125 + 7.75 = 19.375`。
- 跨卡 EP：`19.375 + 21.875 + 34.375 + 46.875 = 122.5`，归还卡1本地行1。
- 原有独立数学检查覆盖不均匀专家归属、完整专家参考、Shared 一次、错误行归属与重复 SUM。既有模型没有更改，此次不另加与实现同构的测试。

## 可理解性与视觉复核

- 入口先说明“收输入 / 合本 rank 专家 / 合 TP 分片 / 合各卡专家并分行”，再展开公式。解释公式中的 token、输出特征、中间通道和 TP 编号。
- 人工查看两张修改图的截图：文字、输入箭头、输出和阅读顺序清晰；新图全部文字 bbox 在 viewBox 内。
- 浏览器验证桌面 1440×1000、手机 390×844 无页面横向溢出；手机加法文字为12px，可换行。图示支持放大查看。
- 交互检查 `(token,lane)=(7,0),(7,3),(23,1),(0,2)` 的 C1、本地 Reduce、C2、C3 共16个状态；逐卡结果与所有权模型一致，重置有效。
- 生成完整47页 A4 PDF，人工查看第13页：新图完整，公式与图注没有截断。
- 验证新锚点、搜索“ 三个求和 ”命中、旧 topology 深链接迁移、图示放大关闭；实际下载完整 HTML 后，通过 `file://` 打开并操作本地 Reduce，显示1.9375。

## 验证边界

已通过 build、内容/路径/SVG检查、公开产物检查、JS语法检查、现有 MoE 数学与迁移检查及 diff 空白检查。未执行业务 kernel、Graph、多 rank、CycleSim、VCS、设备或模型性能实验。

发布与线上核验结果由交付消息记录，不能由本地检查结果推断。
