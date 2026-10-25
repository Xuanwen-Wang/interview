# MLA 完整图解与动画验收

日期：2026-10-25。范围：Attention 单篇中 `mla-cache`、`mla-absorption` 两节，保留既有锚点、阅读阶段与独立 `attention.html` 入口。本文只验证教学内容与网页交互，不宣称运行模型、GPU kernel 或测得设备性能。

## 教学变化

- 两节包含 6 张原创 SVG，依次解释缓存行宽、展开模型的完整双分支、各类维度、K/V 吸收、解耦 RoPE、不同优化路线；MLA 动画从 5 步扩为 10 步。
- DeepSeek-V2 固定 H5120、128 heads、Q rank1536、KV rank512、内容128、位置64、V128。1536 的临时 Q 表示与512的历史内容分别说明。
- 正文区分展开 Q/K192 与吸收后有效宽576，保留模型 scale/YaRN；两个 score 相加后使用同一次 softmax。
- 256.5 MiB 与4.5 MiB 是同一 MLA 两种逻辑表示的 BF16 容量对照；固定官方 HF eager 实际缓存展开形式，320 MiB。源码边界见 [来源审计](mla-source-audit.md)。
- 明确全量 MLA 仍访问全部历史、跨 head 复用需要 kernel 实现、点积与累加变宽、固定状态和稀疏路径并非全部源于 MLA。
- 增加3道理解题；原两位置数值例保留，解耦 RoPE 另用二维非交换例说明。

## 验证范围

- `python3 scripts/build.py`、`python3 scripts/check.py`、JS 语法、`git diff --check` 均通过；章节及来源链接、独立 HTML、SVG 标签与 XML 完整性通过。
- `node scripts/check_attention_lab.js` 通过。新增 MLA 教学 oracle 使用缩小的4:2:16:4维度比例、3 heads、7位置及3种mask，对照展开路径与吸收/流式聚合路径，包含RoPE、checkpoint scale、AV与O映射。另验证错误scale、分开softmax、旋转换序会改变结果，并复算正文toy与容量/FLOPs。未运行真实checkpoint。
- 浏览器主检查49项中48项通过；唯一失败是验收脚本点击SVG本身，而网页放大入口是“放大图示”按钮。改用实际按钮的6项定向复验全部通过，包括打开、Escape关闭、动画前后步及搜索开关。此前两次脚本中断来自搜索框未关闭与同URL未刷新导致的弹窗残留，已修正脚本会话初始化与显式关闭步骤，没有据此修改网页交互。
- 10步均检查桌面、390px和768px宽度，无整页横向溢出、NaN或JS异常；检查Home/End、播放/暂停、reduced-motion、搜索及原FFN入口。
- 6张静态图文本均在viewBox内；截图人工检查完整Q/K/V分支、RoPE双路合流以及动画桌面/手机打分页。query512与历史C512在维度图中明确标为同宽但不同来源。
- 生成69页A4全篇打印PDF，确认MLA两节与10步完整文本存在；打印隐藏控制器并展示静态结果。离线HTML最终步骤可用且无外部资源请求。
- 页面是教学逻辑图与可复算代数；并非设备执行时序、显存实测或速度承诺。
