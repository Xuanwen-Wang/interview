# MoE 通信与优化版重构审查

日期：2026-10-28（Asia/Shanghai）。正文仍为一个chapter与`moe.html`，保留原34个section ID、15个历史章节映射与问答熟练度ID；新增7个边界/通信小节，总41节。旧module/moe不恢复。

## 内容审查

- 技术：以固定官方配置和torch_zeus优化快照为主；区分Attention C0/DSA D1–D3、MoE C1/C2/C3、local Reduce。逐次定义组、张量、SUM/拼接/分行与下游消费者。
- 阅读顺序：问题→模型与权重→完整往返→Attention/mHC交接→四kernel→TP/EP归还→替代方案与验证。旧两版本对照移出主线，历史数值与FLAT16折叠保留。
- 真实shape：H4096/I2048/E288/K8、45层3+42；T24为实现支持的全局容量，均分与路由数据明确为构造。DSA B6 wire按raw-score8192与LSE padding计算；物理flat分片不误作逐token列分片。
- 图示：新增完整往返、KDA交接、输入AG、四kernel依赖、EP归还五张图；重画Router、Shared、Routed三张图，复查拓扑图。颜色只辅助，框内保留文字语义。
- 交互：七步追踪token、切换lane、前后/直达/重置；构造通道值明确标记，主文静态图覆盖完整流程。当前状态打印可读，控制器打印隐藏。
- 数值边界：保留clamp配置到caller未传递的真实缺口；没有声称写网页完成了业务代码修复或模型联调。

## 验证记录

- `python3 scripts/build.py`、`python3 scripts/check.py`、`python3 scripts/check_public_artifact.py`、`python3 scripts/check_glm53_model.py`、`node --check web/moe-explorer.js`、`node scripts/check_moe_model.js`、`git diff --check` 均通过。未改公开产物检查器；其既有单测由发布CI继续执行。
- 独立所有权模型：T8/16/24/32的不均匀Top8、完整专家参考与分片求和一致；Shared一次、返回行身份正确；重复Shared、重复world SUM、错误owner顺序反例可识别；24个token×4lane×7步均检查。
- Playwright桌面1440×1000、手机390×844；文档无横向溢出。token0/7/23、lane0/3逐步直达、前后按钮与重置可用。原权重/拓扑交互的计算模型与迁移检查继续通过。
- 查看本篇9张SVG，所有text bbox均在viewBox内；人工检查文字、依赖、分支与阅读顺序。修正完整往返图中一条穿字的残差线及Shared分支连接。手机图示放大与关闭可用。
- 旧`moe-topology/topology-map`、`glm-parallel-communication/flat16`、`moe-router-internals/padding`分别跳转到正确新节；FLAT16直达自动展开。全文搜索能找到KDA交接新节，当前章节笔记刷新后保留。
- 实际下载文件名`glm53-flash-moe.html`；最终下载字节与`dist/moe.html`一致。下载副本以`file://`打开，通信步骤交互正常。
- 生成完整44页A4 PDF，所有技术补充展开；人工查看完整往返图所在第10页及DSA通信表所在第13页，文字与图未截断。打印隐藏交互控制器，保留完整静态图与当前交互状态。
- 上述浏览器运行没有pageerror。本地验证不等于发布；提交、CI、Pages部署和线上字节核验由交付消息分别报告。
- 本轮未执行业务kernel、设备、Graph、多rank、CycleSim、VCS或完整模型；没有新增性能测量。各历史案例仍保留原证据边界。
