# 518 Lowering：真实 GEMM 重写验收

日期：2026-10-26。本次改写 `lowering.html`，以同一次实际编译的 GEMM 贯穿正文；同步长文保留，通过主例中的 MAIL 返回边连接。业务源码未修改，工具链未重建。

## 成品与阅读主线

- Lowering 保持一个连续 HTML：33 节、8 个阅读阶段、8 张案例图和 8 阶段真实 IR 检查台。
- 起点是仓库中的 `gemm_mkn_loop_f32acc_kernel`：单核，BM/BK/BN=128，BF16 输入、FP32 跨 K 块累加、BF16 输出，M/K/N 动态。
- 顺序为计算与硬件约束 → TTIR/Linalg → fmap/weight 描述 → 布局与尾块 → SRAM 地址和循环同步 → CFG/VP → 寄存器分配与汇编。
- M=130、K=260、N=130 仅作统一参数代入。沿末块解释 LD 的 2×4、PE/VP 的 2×128、ST 的 2×2；不把这些尺寸写成已执行的测试。
- 另一份历史双核 GEMM 的 63 列重叠写，以及独立地址分配 fixture，作为反例分别标明来源，未拼入当前编译链。
- 保留原 32 个节 ID、旧 stage 别名、10 个旧章 ID 和 70 个旧正文/内嵌锚点；新增 `gemm-sync-bridge`。

## 技术正确性

中端、后端、同步与历史反例分别审稿，再对集成正文复核；未发现未解决的阻断问题。主要校正如下：

1. **PE 和 VP 的分工来自实际 IR。** TTIR 中 `tt.dot` 的初值为零，之后独立 `addf` 更新 FP32 acc。实际产物保留 PE partial 和 VP add；正文讨论消除临时块需要的等价性证明，未凭公式直接声称可以融合。
2. **地址单位和物理布局不能混同。** 此阶段 fmap 的 `dynamic_byte_offset` 仍待后端按 dtype 换算，weight 的 `blocked_offset` 已是字节。本例 BF16/WBS128 路径 K=260 补成 320，n_start=128 时为 81920 B；说明公式的格式条件。
3. **边界存在多个访问域。** 固定 SRAM 几何、当前有效窗口、全局边界和每核所有权分别解释。PE/VP 当前仍计算 128 个 N 通道，不夸称已消除尾列计算。
4. **控制流不止展开一次。** SCF 循环展开后，标量 min/max 的下降仍可产生菱形 CFG；block argument、signed compare 的溢出语义、flags 保护分别追到实际汇编。
5. **物理地址复用产生反向依赖。** 主例的 LD 等待 PE、PE 等待 VP 保护下一轮覆盖；给出 K 循环 seed/drain 原句和计数。没有用单条 RAW 链替代完整同步协议证明。
6. **两种分配管理不同资源。** 实际 M 块数 spill/reload 是控制标量寄存器压力处理，不是 tensor SRAM 分配；第 0 块 spill scratch 固定映射 VR3 是当前后端约定，选择 M 块数及 lane 0 才是本例决策。
7. **直接生成目标代码仍有后端职责。** 保留目标方言并不消除合法化、选择、phi 复制、RA、编码和取指约束。历史 SelectionDAG 讨论仅按本人回忆标注，未虚构当时的决策记录。
8. **CUDA 对比按职责解释。** 明确 GPU 也有异步访问、tensor map 和完成协议；比较谁负责表达和落实这些合同，不概括成 CUDA 没有相关问题。

正文全部 43 个代码块另作逐块核验：37 块主例 IR/汇编匹配同次产物，4 块历史案例/独立夹具匹配其标注来源；Python 摘录只调整换行，余下 1 块为编译命令。省略片段未跨阶段或跨 GEMM 拼接。

本轮调用现成工具链，成功取得 TTIR、中端逐 pass 日志、ZeusHigh、后端逐 pass 日志和汇编。终点为 Assembly，**没有生成并运行 zbin，没有新功能、CycleSim、VCS 或性能测试**。

源码解释绑定 `triton_shared@82613bc2eb30feb9ef7f57aef20584df0ef9e28a`，所引实现文件无本地修改，全仓有无关改动。工具二进制 SHA256 在采集前后相同，但构建提交未独立证明，不能将源码 HEAD 当成工具的构建身份。详见 [中端审计](gemm-midend-audit.md)、[后端审计](gemm-backend-audit.md)、[历史反例](gemm-decision-cases.md) 和 [交互摘录](gemm-lowering-excerpts.json)。

## 初学者可理解性

先给运算、精度、轴和一个尾块，再展开硬件表示。每个阶段回答“还保留什么、补上什么、为何不能直接下降、另一个方案付出什么”，代码前后解释实际 SSA 值与矩阵语义；不要求读者靠 pass 名猜设计。

fmap 的硬件 W/C 与算法 M/K/N、weight 的硬件 K/C 与算法 N/K 明确映射。存储 pitch 和有效窗口、BR 状态和内存别名、GPR spill 和 L2 tensor allocation 分开叙述。八个面试追问均可回到同一个例子或明确独立的反例。

## 视觉与交互

- Chromium 实际检查 8 张新图的文字、箭头与阅读顺序；最后修正累加块到最终转型的数据方向、128/130 刻度挤压和 spill 图注。SVG 文本包围盒均在画布内。
- 桌面 1720×1050 和手机 390×844；手机无页面横向溢出，宽图表在容器内查看。修复展开来源中的长路径溢出后再次检查。
- 8 阶段 IR 切换、Home/End 键和边界按钮通过；每个面板仅出现一次来源标签。检查台展示固定摘录，不在浏览器执行编译器。
- 实测图示 150% 放大，搜索 81920 并跳到权重偏移，下载独立 HTML。断网后从本地文件打开，真实 IR 切换和来源展开正常。无浏览器脚本错误。
- A4 打印 52 页，技术来源与面试问答展开、8 个交互面板全部可见；检查全部页面文字边界，未发现页外文字，并查看首页、IR/描述符正文页、末页及关键图。
- 旧链接映射在浏览器逐项检查，共 70 项；旧 `compiler-triton-pipeline/high-order` 实际跳到新正文，`attention.html#module/hardware` 仍提供两个完整阅读入口。已有学习记录迁移检查通过；本轮未改变存储格式。

## 本地检查

```text
python3 scripts/build.py
python3 scripts/check.py
python3 scripts/check_public_artifact.py
node --check web/lowering-explorer.js
node scripts/check_moe_model.js
git diff --check
```

构建为 8 个知识域、28 章、409 节、253 个追问、141 张正文 SVG，保留 9 个岗位；Pages 仅发布 14 个允许文件。已有其它指南、岗位资料和用户未提交工作未混入本次修改。

## 交付边界

从远端 `d234018` 的隔离工作树集成，沿用已有 GitHub 发布设置和用户发布授权。没有改仓库可见性、创建仓库或接触简历。提交、CI 与部署状态由对应 GitHub 提交及 Actions 记录确认；本文件记录的是上述本地采集与验收，不用推送成功代替线上核验。
