# 岗位收藏来源与核验

整理与核验日期：2026-10-25（Asia/Shanghai）。包含用户提供的 J01–J04 和此前调研的 5 项官方 JD，共 9 个岗位。

## 口径

- 要求使用中文概述，职责、基本要求和加分项分列；关联分析与准备建议为本站解读，不是雇主评价。
- “官方可见”表示核验时官方发布状态在线，不代表保证仍有名额。HTTP 403 或无法提取正文记为“待复核”，不等同于已下线。
- NVIDIA 的可读搜索快照与当前申请状态分开；未核定的发布日期留空，不沿用抓取日期。
- 旧面经来源保留原核验日期，岗位页使用本次复核；个人面经没有转化成新的在招岗位。
- 不收集简历、联系方式或投递信息。本地关注保存在当前浏览器，与公开岗位数据分离。

## 页面验收

- 2026-10-25 追加 J02/J03/J04 后：9 条清单构建通过；逐项复核官方 API 的学历、年限、全部城市及任职/加分分界。浏览器验证新增岗位的多词搜索、详情、官方链接、关联章节、手机和打印布局、离线访问；PE/MoE 教学交互模型检查通过。
- 2026-10-25：构建、内容与路由检查、新增 JavaScript 语法、`git diff --check` 通过。
- 独立审查核对了官方 API/调研记录与字段、必需/优先语义、状态、HTML 转义和关注存储逻辑。
- Chromium 验证 6 个详情入口；多词搜索、岗位编号搜索、公司/方向/状态组合筛选、空结果与重置、关注筛选和刷新保存、全站岗位搜索、要求锚点及学习章节跳转。
- 桌面 1440×1000 与手机 390×844 检查，无横向溢出；打印显示要求和来源 URL；生成 A4 PDF。`file://` 打开独立 `jobs.html` 可查看清单与要求。
- 原有 Roofline 参数响应、KV 公式及拓扑 rank 交互回归通过；PE 教学模型检查通过。这些是网页验收，不是芯片性能验证。

## 岗位证据

### J01 · AI异构硬件性能评估专家 - Seed Model · A54228
- 官方链接：[A54228](https://jobs.bytedance.com/experienced/position/7647081477118085429/detail)
- 地点：杭州；类型：社招 · 正式；经验：未注明年限或学历门槛。
- 来源身份：官方 API 实时核验。
- 状态核验：2026-10-26 重新读取官方职位接口，channel_online_status=1；标题、代码、地点、招聘类型及要求已复核。状态只代表核验时页面发布情况，投递以官网为准。
- 本次关联：[M01 原创模拟面试及边界](seed-hardware-mock.md)。其余岗位保持各自原核验日期。
- [核验来源](https://jobs.bytedance.com/api/v1/job/posts/7647081477118085429/)

### J02 · AI编译器专家（存算与AI） - 芯片研发 · A62538B
- 官方链接：[A62538B](https://jobs.bytedance.com/experienced/position/7694589927579699461/detail)
- 地点：北京 / 上海 / 杭州 / 西安；类型：社招 · 正式；经验：相关专业硕士及以上；3 年以上相关研发经验。
- 官方发布时间：2026-10-09；来源身份：官方 API 实时核验。
- 状态核验：2026-10-25 直接读取官方职位接口，channel_online_status=1；记录核验时发布状态，申请条件与招聘进度以官网为准。
- [核验来源](https://jobs.bytedance.com/api/v1/job/posts/7694589927579699461/)
- 学历与年限为明确门槛；编译系统要求至少一种，原文未单列加分项。

### J03 · 硬件加速算子编译器工程师（AI芯片） - 芯片研发 · A100321A
- 官方链接：[A100321A](https://jobs.bytedance.com/experienced/position/7457906937700796690/detail)
- 地点：北京 / 上海 / 杭州 / 西安 / 深圳；类型：社招 · 正式；经验：未注明年限或学历门槛。
- 官方发布时间：2025-01-09；来源身份：官方 API 实时核验。
- 状态核验：2026-10-25 直接读取官方职位接口，channel_online_status=1；记录核验时发布状态，申请条件与招聘进度以官网为准。
- [核验来源](https://jobs.bytedance.com/api/v1/job/posts/7457906937700796690/)
- LLVM 架构为任职要求；LLVM/GCC 社区参与及 HPC/AI 编译器、高性能库经验为加分项。架构要求保留原文的熟悉/精通区别，不概括成任选一种。

### J04 · 硬件加速编译器框架研发工程师（AI芯片） - 芯片研发 · JU1RP
- 官方链接：[JU1RP](https://jobs.bytedance.com/experienced/position/6925712424150747400/detail)
- 地点：北京 / 上海 / 深圳 / 杭州 / 西安；类型：社招 · 正式；经验：未注明年限或学历门槛。
- 官方发布时间：2021-02-05；来源身份：官方 API 实时核验。
- 状态核验：2026-10-25 直接读取官方职位接口，channel_online_status=1；记录核验时发布状态，申请条件与招聘进度以官网为准。
- [核验来源](https://jobs.bytedance.com/api/v1/job/posts/6925712424150747400/)
- 发布时间较早，但本次官方发布状态为在线；不能仅按发布时间认定已下线。具体 MLIR/LLVM/TVM/XLA、量化及硬件经历列在加分项。

### S01 · 机器学习编译优化工程师 - Seed Model · A122003
- 官方链接：[A122003](https://jobs.bytedance.com/experienced/position/7503827063050635538/detail)
- 地点：北京；类型：社招 · 正式；经验：未注明年限。
- 来源身份：官方 API 实时核验。
- 状态核验：本轮直接读取官方 API，channel_online_status=1。该字段反映核验时发布状态，投递前仍以官网为准。
- [核验来源](https://jobs.bytedance.com/api/v1/job/posts/7503827063050635538/)

### S02 · 硬件加速模型编译优化工程师 · A245845
- 官方链接：[A245845](https://jobs.bytedance.com/experienced/position/7404679843633334579/detail)
- 地点：上海；类型：社招 · 正式；经验：未注明年限。
- 来源身份：官方 API 实时核验的历史岗位。
- 状态核验：本轮直接读取官方 API，channel_online_status=0；仅保留为历史岗位要求参考。
- [核验来源](https://jobs.bytedance.com/api/v1/job/posts/7404679843633334579/)

### S10 · Deep Learning Performance Software Engineer · JR2013068
- 官方链接：[JR2013068](https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Deep-Learning-Performance-Software-Engineer_JR2013068)
- 地点：上海；类型：全职（未标校招/社招）；经验：3 年及以上相关工作经验。
- 来源身份：官方招聘页搜索快照。
- 状态核验：本轮读取到官方 Workday 页面搜索快照；直接页面未返回正文，官方 CXS API 为 HTTP 403，无法确认当前是否接受申请。
- [核验来源](https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Deep-Learning-Performance-Software-Engineer_JR2013068)

### S11 · Deep Learning Compiler Engineer - CUDA · JR2010731
- 官方链接：[JR2010731](https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/China-Shanghai/Deep-Learning-Compiler-Engineer---CUDA_JR2010731)
- 地点：上海 / 北京；类型：全职（未标校招/社招）；经验：2 年及以上相关工作经验。
- 来源身份：官方招聘页搜索快照。
- 状态核验：本轮官方 Workday 搜索快照列出上海与北京；直接页面未返回正文，CXS API 为 HTTP 403，无法确认当前申请状态。
- [核验来源](https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/China-Shanghai/Deep-Learning-Compiler-Engineer---CUDA_JR2010731?timeType=5509c0b5959810ac0029943377d47364)
- 与旧记录差异：官方索引列上海、北京；编译器背景措辞 desired，保留为优先项。

### S12 · Senior AI Compiler Engineer, MLIR · JR2016844
- 官方链接：[JR2016844](https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Senior-AI-Compiler-Engineer--MLIR_JR2016844)
- 地点：美国（历史快照，城市待复核）；类型：全职（历史发布）；经验：3 年及以上相关工作或研究经验。
- 来源身份：承接 S12 官方历史记录，并以 NVIDIA 雇主 LinkedIn 发布搜索快照核对要求。
- 状态核验：本轮 Workday 未取得正文且 CXS API 为 HTTP 403；对应 JR 编号的 NVIDIA LinkedIn 搜索快照写明不再接受申请，打开后跳转 expired_jd_redirect。只能确认该 LinkedIn 发布已过期，不能据此推断所有官方渠道状态。
- [核验来源](https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Senior-AI-Compiler-Engineer--MLIR_JR2016844)
- [核验来源](https://www.linkedin.com/jobs/view/senior-ai-compiler-engineer-mlir-at-nvidia-4404495566)
- 地点冲突：旧官网 URL 为 Santa Clara，同 JR 的雇主 LinkedIn 发布标 Seattle；仅列美国并要求复核，不把两地合并为当前可选地点。旧申请日期不证明今天仍接受申请。
