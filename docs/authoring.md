# 如何扩展知识库

导航分成三层：**知识域（module）→ 专题（group）→ 章节（chapter）**。目录关系由 `config/navigation.json` 管理，正文文件不决定菜单结构。新增几十篇文章也不需要在侧边栏平铺几十个链接。

## 添加章节

1. 在 `content/` 的现有 JSON 或一个新 JSON 数组中添加章节。参考相邻章节的 schema：`id/title/part/order/subtitle/minutes/level/tags/lead/sections/questions/sources/takeaways`。
2. `id` 与 section `id` 使用稳定的英文短横线名称。标题和归类可以改变，已有 ID 尽量保留。URL 为 `#chapter/<id>/<section-id>`；笔记和已读状态以 chapter ID 保存。
3. 把 chapter ID 加进 `config/navigation.json` 的一个专题。每章只能有一个主目录位置，其他专题用正文链接交叉引用。`order` 控制构建与索引顺序，专题内阅读顺序以配置数组为准。
4. 为项目事实添加 `evidence/` 记录，至少说明仓库、commit 或非 Git 文件 SHA256、文件位置、采集日期、验证层级。正文区分算法事实、源码实现、历史观测和教学推导。
5. 添加原创 SVG 时使用 `figure.diagram`、`viewBox`、`role="img"`、`aria-label` 和 `figcaption`。图会自动支持放大；较密的机制图不要只依赖缩小后的字号。HTML 内不要写脚本或事件处理器。
6. 构建、检查，并在桌面/手机查看新章、专题目录和打印预览。

`part` 是章节的语义标签，继续用于部分问答和检索显示；它不再驱动侧边栏。学习记录仍使用原 `interview-field-notes-v1` 存储键与 version 1 备份格式；合并章节时由下述兼容元数据迁移记录。

## 连续长文与旧链接

PE 使用一个 chapter、一个完整 HTML，按六个阅读层次组织。`readingStages` 的每项包含 `id/title/summary/sections`；所有 `sections` 展平后必须与章内 section 顺序完全相同。侧边栏、页首路径和右侧目录都跳到同一篇文章的锚点，页面不拆载、不重新初始化交互。阶段标题用 h2，小节用 h3，小节内部标题从 h3 转为 h4。

正文的硬件字节映射、credit 等补充推导可放在 `<details class="pe-deep-dive">` 中。直接访问其内部锚点会展开对应内容；打印时所有技术补充自动展开，结束后恢复原状态。

合并已有章节时，使用 `legacyChapters` 保存原 chapter ID、`title`、入口 `section`、全部旧 `anchors` 和可选 `noteKey`。旧 hash 路由映射到长文；旧笔记单独保留，不能用旧章的完成状态代替整篇长文的完成状态。当前 PE 的原总览笔记使用 `legacy-pe-overview`，避免覆盖同 ID 新长文笔记。问答的 `legacyKeys` 只映射语义相同的原题，改题后不要沿用已有熟练度。

首次迁移先备份旧存储原文，再写入 `readingVersion: 2`。旧版备份导入、JSON/Markdown 导出、多标签合并和取消已读都须验证。`scripts/check.py` 检查阶段覆盖、旧锚点与重名 ID；浏览器验证实际跳转及历史笔记定位。

`scripts/build.py` 同时生成 `dist/index.html` 和直接打开 PE 长文的 `dist/pe.html`。两者内嵌同一份内容和应用，仅默认路由不同；`pe.html` 可保存后独立离线阅读。它们在同一来源共享浏览器笔记，文件离线副本则需导出/导入来转移笔记。

## 未来专题怎么放

| 新需求 | 建议位置 |
| --- | --- |
| 中端核心 Pass 逐个拆解 | `compiler` 下新增 `middle-end-passes` 专题；按分析前提、合法性、变换、失效、反例组织章节 |
| GLM5Next KDA 真实部署 | `moe`（显示名 GLM5Next 300B 真实部署）的 Attention 部署专题；区分模型wrapper与kernel版本，交叉链接算法与硬件 |
| 更多公司面经 | 先添加来源记录和公司映射，再根据内容量添加叙事章节 |
| LLVM 后端专题 | `compiler` 下新建专题；不要把所有细节挤进一篇总览 |
| 新 Coding 题型 | `coding` 下按通用算法、数据流、kernel、pass 分类扩章；代码和题源分开 |
| 新硬件代际 | 新知识域或 `hardware` 下独立专题；不改写旧代际的来源范围 |

## 算法与部署的内容边界

`algorithms`从完整模型进入Attention和FFN两条演进线，讲数学、shape、状态和逻辑读写；实际rank、collectives、kernel ABI与性能证据放入`moe`部署域。保留`moe`路由ID以兼容既有链接。专题可继续增加新模型部署或kernel内部章节。

主题可配置`learningPath`，每步包含`title`、`description`、`chapter`，页面自动生成有顺序的阅读入口。所有chapter引用由静态检查验证；它是推荐路线，不改变章节的唯一主目录位置。

## 公司与面经

- `config/interviews.json`：每条记录有稳定来源 ID、公司、题目、原文 URL、事件/帖子日期、身份与经验、主题、局限、整理核验日期。
- `category` 只能是 `report`、`job`、`takehome`、`reading`。官方 JD、个人面经、官方作业和第三方练习不能互相替代。
- `config/companies.json`：公司卡片、来源 ID 和关联章节 ID。公司组必须明确包含哪些公司，不把一个多家公司帖子里的所有题分配给每家公司。
- 不用搜索摘要生成面试事实；保留原始身份、不确定日期、历史岗位状态。一次面经不表示固定题库，也不能由样本数推出出题概率。

## Coding 与验证

原创 CPU 参考在 `practice/`。Python 正文示例用 `<pre data-reference="函数名"><code>…</code></pre>`，静态检查会与 `practice/reference.py` 的 AST 源码片段比较，避免正文代码漂移。C++、CUDA 示例另行检查。

测试优先验证不变量、边界、独立 oracle 与变换前后等价，不复制实现。CUDA 示例当前没有 GPU 编译或执行验收，增加实测时须记录设备、版本、数值标准、计时方法和 launch 合同。

```bash
python3 scripts/build.py
python3 scripts/check.py
node --check web/app.js
node --check web/catalog.js
node --check web/reading.js
node --check web/pe-explorer.js
node scripts/check_pe_model.js
python3 -m unittest discover -s practice -v
TMPDIR=/data/wangxw/tmp g++ -std=c++17 -Wall -Wextra -Werror \
  -fsanitize=address,undefined practice/coding.cpp \
  -o /data/wangxw/tmp/interview-coding-check
/data/wangxw/tmp/interview-coding-check
```

浏览器验收包括主题/专题、旧深链接、目录筛选、公司来源筛选、全文搜索、图示放大、实验计算、笔记、问答、移动端与打印。构建产物 `dist/` 不提交；push 到 `main` 后由 GitHub Actions 构建并发布，发布完成再核验线上内容。

## PE 交互演示

正文用 `<div data-pe-explorer="mapping"></div>` 或 `<div data-pe-explorer="budget"></div>` 声明挂载点。纯数学模型在 `web/pe-model.js`，展示与事件在 `web/pe-explorer.js`，样式在 `web/pe-explorer.css`，构建时一起内嵌。不要在章节 JSON 中加入脚本。

`mapping` 只适用于 normal KC FP8 权重布局。它按实际 pack/RTL 位切片解释坐标，但小整数归约例子没有模拟舍入或 RTL 时序。`budget` 中 R、频率和发射率是显式条件参数；它计算 weight 供数上界和 AL1 输入容量，不取代编译器代价模型。

修改映射需同时核对 pack 与硬件 slice，并运行 `scripts/check_pe_model.js` 的完整字节空间、独立反向映射与直接点积 oracle。修改界面需检查 C128/C256、最后一个字节、单/双 hub、w 改变造成的驻留翻转、当前状态放大与打印。新增其他格式时独立建立公式与证据，不能只换显示标签。
