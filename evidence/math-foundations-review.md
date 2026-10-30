# 大模型数学与算子基础：来源与验收

采集日期：2026-10-30。新增独立 chapter `llm-math-foundations`、模块 `math-foundations`、连续离线入口 `math.html`。原有章节 ID、笔记键与深链接不变。

## 教学范围

28 节，6 个学习阶段，21 张原创 SVG，5 个参数可调实验。从符号、张量轴、广播、矩阵与概率开始，到 Softmax、激活、Norm、RoPE、Attention、MoE、递推状态、多流残差和数值精度。所有小维度数值均为显式教学假设，不是模型权重、设备执行或性能测量。

最后的综合算例给出全部所需输入、缓存和权重约定。Python 独立计算得到最终概率 `[0.24848062999667062, 0.4862942996396594, 0.26522507036366993]`，再由 JavaScript 教学模型核对。原始 SVG 由 `scripts/math_figures.py` 的图形函数生成并嵌入正文 JSON，曲线按公式采样。

## 公开来源

- PyTorch 2.9 官方 API 定义：Softmax、LayerNorm、RMSNorm、GELU、topk。使用固定文档版本；不是声称本地安装了该版本。
- Transformer、Online normalizer、GLU Variants、RoFormer、mHC 原论文；URL 在正文及 sources 中。解释数学机制，未重跑论文性能/质量实验。
- DeepSeek-V3 报告 `arXiv:2412.19437v2` §2.1.2，公式 12–16：Sigmoid、选中分数重归一化与选择偏置的边界。
- GLM-5 公开模型 revision `c183ef8c61faee82855eca1ed9bb3a9a7ce3b0b2`，`config.json`：SHA256 `308d3ceebe7bd9c2246d20550d5b793098dd03838d1e504f8236063ae152bcae`。固定版本下载复核 hidden_act、hidden_size、rms_norm_eps、scoring_func、专家数、norm_topk_prob。报告 `arXiv:2602.15763v1` 仅用于 MLA/DSA 架构映射。公开 GLM-5 不等同站内 GLM-5.3-Flash 部署配置。
- DeepSeek-V4-Flash revision `60d8d70770c6776ff598c94bb586a859a38244f1`：
  - `inference/model.py`，`Gate.forward` / `Expert.forward` / `MoE`，SHA256 `ce962f1face79d4f633d36436576214057a7e11443c9789935e1deb5c6cd1d71`。
  - `inference/config.json`，SHA256 `6cc6f816ca73a8d38750194e330398e4f6955b4b45f674f7d29c96da14ccb733`。
  - `inference/kernel.py`，`hc_split_sinkhorn_kernel`，SHA256 `59b325083d7103975cba025bd0d60ea343bb82d8fff53088afb7c04bd380c0c2`。
  - 只读公开原始文件，没有模型运行或业务仓库修改。核对 √Softplus、Hash 查表、原始 affinity 归一化、route_scale、非对称 gate/up clamp、多流与有限轮 Sinkhorn。

## 数学与功能验收

`node scripts/check_math_foundations.js` 包含 100 次数值断言及边界/反例断言：闭式 Softmax 比例、±1000 稳定性、Mask 空行拒绝、温度熵、Norm 平移与尺度、RMS 与 L2 的差别、路由 bias 与合并权重分离、Top-P 边界、Attention 常值保持与置换不变性、凸组合范围、在线结果与直接指数 oracle、RoPE 正交性及相对位置、有限轮 Sinkhorn 的反例和收敛，以及完整小例。不是复写生产 kernel，也不是设备验收。

基础检查：`scripts/build.py`、`scripts/check.py`、`scripts/check_public_artifact.py`、`git diff --check` 通过。新增 JavaScript 的语法检查与数学检查通过；既有 Attention/Decode 数学检查通过。CI 加入新数学检查。

## 三项审查与浏览器验收

- 技术正确性：按上述固定来源核实模型差异；独立数值参考与不变量通过。保留全掩码、零分母、并列排序、有限 ε、有限轮 Sinkhorn 等条件。没有将数学教学测试称为 GPU/模型性能验证。
- 初学者可理解性：由四则运算与一行数开始，每个小节先给目标；说明符号首次含义、shape 轴、输入来源与输出消费者。手算维度明确标记为教学，不与模型配置混写。含 28 节自测/案例、综合前向和速查表。
- 视觉可用性：1280 与 1440 像素桌面；逐张检查 21 图的正文截图和原尺寸汇览，无 SVG 文字视窗越界，无页面横向溢出。核对曲线坐标、图例、矩阵行列与流程箭头。只验收桌面，遵循当前项目约定。
- 实际交互：5 个实验均由键盘改变滑块并恢复默认；Attention mask 开关有效。发现通用 SVG 放大器在首次挂载时给实验图追加按钮、更新后按钮消失，已让 `.math-lab` 与其他动态实验一样排除该包装；静态图的放大和 Escape 关闭仍通过。
- 导航与数据：新模块入口、全站 RMSNorm 搜索与结果跳转、新章笔记持久化/清除、下载目标、原 `mla-dsa/latent` 链接及 FFN 入口通过。
- 打印与离线：生成 43 页 A4 PDF，折叠答案全部展开；抽检 Softmax、Norm 与综合算例页的公式、图与分页表格。`file://` 且浏览器离线状态下，新章及五个实验加载，Softmax 参数变化可计算。无 pageerror。

未执行 GPU、整模型或性能实验；本任务不需要这些验证。发布与线上 readback 状态按最终提交实际结果报告。
