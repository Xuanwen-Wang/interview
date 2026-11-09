# 数学基础篇：初学者逐节复审（2026-11-09）

基线：`41b9c3ded1f108ba951bb7839686c203a76ffac4`；审读原 28 节全文，保留 chapter、原 section、原 question ID 与笔记/已读归属。结果扩为 32 节、29 张原创 SVG、7 个教学实验。仅改指南；无业务源码修改、模型运行或硬件性能实验。

## 发现的问题与改法

| 原有范围 | 读者可能卡住的位置 | 本轮处理 |
| --- | --- | --- |
| learning-map / notation | 缩写很多；下标、集合、转置、导数记号混杂 | 给必读与扩展顺序；先区分数据/参数/索引，补集合求和、帽子/撇号与转置 |
| tensor-axes / reduce-broadcast | token、batch、head 未解释；mean 的来源和广播没有直接手算 | 补定义、负轴索引、均值公式和逐行减均值矩阵 |
| vectors / linear | 两个行向量却把外积写成 qkᵀ；未定义行列朝向；误以为输出矩阵就等于外积 | 改为行向量约定下 qᵀk；增加输入朝向矩阵图、不同长度外积；补 transpose 与 one-hot 手算 |
| 新 attention-products | 生成 QKV、QKᵀ、PV、KᵀV 容易混为“QKV 外积” | 给每步输入/输出/被消去的轴；完整 2×3 score 手算；解释逐格点积与按特征累加外积是同一 GEMM 的两种视角 |
| exp-log / 新 lse / probability / softmax | LSE 很快进入稳定技巧，标量输出与概率没区分；交叉熵跳步 | 另设 LSE 独立小节，先 exp→sum→log；提因子与取 log 推导，±1000 实验；对数概率与分块质量手算；补 one-hot 与交叉熵两种计算 |
| mask-online / sampling | −∞/NaN 未解释；在线 α 换基准很抽象；Top-K 只报结果 | 补全掩码与比例换基准；保留值/原索引的 Top-K 图，比较正分数除和与 logits Softmax，新增 K/分数实验、负分数/并列/边界自测 |
| activations / 新 sigmoid-softplus / swiglu | Sigmoid/Softplus 只有表格，缺少范围和路由比值对照；“门”容易被误解成概率 | 两张公式采样曲线（分别明确纵轴），与 ReLU 对照；五组数值，四种权重合同；导数关系列为选读；补 FFN 三投影名称 |
| norm-statistics / normalization / 新 norm-choice | 方差与均方关系直接给结论；除法为何产生单位尺度不明；主流选择无解释 | 展开平方的推导；同条件两路径图和数轴图；推导无 ε/有 ε 的统计量，γ 例子、常数/零输入；按来源讲 RMSNorm 简化、取舍与不能直接替换 |
| residual / rope / attention | F 的含义、矩阵旋转恒等式、PV 每分量算术仍有跳步 | 补 F 定义、旋转乘积两步推导和输出各分量手算 |
| low-rank / moe-routing / gather-scatter | “独立方向”抽象，I/ρ/slot 定义不足，前缀和只报答案 | 秩 1 因子化明确例子；补集合与路由缩放；inclusive/exclusive 直接手算 |
| recurrent / sinkhorn | 递推下标、φ、预测帽子、冒号切片不明；Delta 单位长度条件难追 | 加扩展阅读标记与变量词义；Delta 代入抵消推导，切片/流轴说明 |
| precision / model-map / worked-block / atlas / practice-route | dtype、cast、clamp、atol/rtol、单位矩阵与 dropout 可能形成门槛 | 补常见操作定义、综合例首两步分母与投影手算；原模型对照保持 2026-10-30 的固定边界，速查/自测沿用，新增小节列入连续学习阶段 |

## 本轮新增来源

- RMSNorm 原论文 `arXiv:1910.07467v1` §4：去除中心化、保留尺度控制；这是论文动机和实验证据，未外推历史速度为现代整网加速。
- Layer Normalization `arXiv:1607.06450`：行内统计与归一化机制。
- Llama 2 `arXiv:2307.09288v2` §2.2：明确 Pre-Norm 使用 RMSNorm。
- PyTorch 2.9 官方 Sigmoid、Softplus、logsumexp 定义；Softplus 图固定 β=1。曲线、手算与推导为独立教学。
- Qwen3-8B 官方 `config.json` revision `b968826d9c46dd6066d109eabc6255188de91218`；SHA256 `f7c4eadfbbf522470667b797a3c89be2524832d2d599797248dc304fff447c30`；`rms_norm_eps=1e-6`。
- Transformers `v4.51.3`，`src/transformers/models/qwen3/modeling_qwen3.py`，文件 SHA256 `704c914530530a1acb0b443add1f520404e3ac2c28c0ab7e16f80f86cfe8ccb2`。`Qwen3RMSNorm` L62；block 的两处实例 L262–263；最终 Norm L484。该 tag 的文件 hash 绑定本次只读证据，不代表本地安装或部署该版本。
- DeepSeek-V3 官方 `config.json` revision `e815299b0bcbac849fa540c768ef21845365c9eb`；SHA256 `cbf0b95dc614de208a109bb5fd4e7eed11385e9c68411d2c17db5319443035d9`；`rms_norm_eps=1e-6`。GLM-5 / V4 继续沿用原证据中固定版本，未把本轮选择讨论冒称全模型普查。

## 数学验证

扩展 `check_math_foundations.js` 为 165 次数值断言及边界断言。新增闭式 LSE、±1000 偏移、exp(z−LSE) 恢复概率、分块 LSE 质量合并；全部 K 的过滤条件概率一致性、负 logits、并列与非法 K；Softplus 反对称差恒等式及独立有限差分导数；有限 ε 的 Norm 统计量、零分母拒绝；QKᵀ 点积表与特征外积累加两视角一致。

教学模型对 ε=0 且分母为零改为明确拒绝，避免原来静默输出 0 与正文“未定义”冲突。常见 ε>0 例子与原有测试继续通过。

## 三项审查与交付

- 技术正确性：新增 165 次数值断言及边界测试通过；原测试继续通过。公式、手算、轴、模型采用依据逐项核对。
- 初学者可理解性：按上表审读原 28 节，补 4 个独立小节。先定义符号和比较条件，再逐步手算。导数/分解等补充标为选读；原稳定 ID 与阅读顺序覆盖检查通过。`docs/authoring.md` 记录可复用的数学基础篇编写要求。
- 视觉可用性：在 1280、1440 桌面检查；新增/修改的 9 张图逐张查看正文与原尺寸汇览。初版点积/外积图的标题和输入标签重叠，已调整纵向间隔并重新截图；最终图无文字视窗越界或文字重叠，页面无横向溢出。检查了 Norm 的两条路径/数轴，曲线各自的纵轴，Top-K 原索引映射及 QKᵀ 的矩阵行列。
- 交互：七个实验均能键盘改变参数并重置；LSE 的 −1000/0/1000 偏移和 Top-K 的 K=1…4 均验证。搜索 LSE、新旧 8 个重点锚点跳转、静态图放大/Escape 关闭、实际 HTML 下载通过。
- 打印/离线：A4 PDF 61 页，打印时折叠答案展开；抽检点积、LSE、Norm、曲线页。网络离线且通过 file:// 打开 math.html 时七个实验可用，LSE 改变参数后结果正确。无 pageerror。
- 桌面为本任务验收范围；无移动设备模拟。未执行 GPU、整模型或性能实验。本地完成与最终 CI/Pages/readback 分开报告。

基础构建、内容/链接/阶段覆盖、JavaScript 语法、数学和公开产物检查均按最终构建执行。
