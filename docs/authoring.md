# 如何扩展知识库

导航分成三层：**知识域（module）→ 专题（group）→ 章节（chapter）**。目录关系由 `config/navigation.json` 管理，正文文件不决定菜单结构。新增几十篇文章也不需要在侧边栏平铺几十个链接。

## 添加章节

1. 在 `content/` 的现有 JSON 或一个新 JSON 数组中添加章节。参考相邻章节的 schema：`id/title/part/order/subtitle/minutes/level/tags/lead/sections/questions/sources/takeaways`。
2. `id` 与 section `id` 使用稳定的英文短横线名称。标题和归类可以改变，已有 ID 尽量保留。URL 为 `#chapter/<id>/<section-id>`；笔记和已读状态以 chapter ID 保存。
3. 把 chapter ID 加进 `config/navigation.json` 的一个专题。每章只能有一个主目录位置，其他专题用正文链接交叉引用。`order` 控制构建与索引顺序，专题内阅读顺序以配置数组为准。
4. 为项目事实添加 `evidence/` 记录，至少说明仓库、commit 或非 Git 文件 SHA256、文件位置、采集日期、验证层级。正文区分算法事实、源码实现、历史观测和教学推导。
5. 添加原创 SVG 时使用 `figure.diagram`、`viewBox`、`role="img"`、`aria-label` 和 `figcaption`。图会自动支持放大；较密的机制图不要只依赖缩小后的字号。HTML 内不要写脚本或事件处理器。
6. 构建、检查，并在桌面/手机查看新章、专题目录和打印预览。

`part` 是章节的语义标签，继续用于部分问答和检索显示；它不再驱动侧边栏。学习记录仍使用原 `interview-field-notes-v1` 存储键与备份格式，无需迁移旧笔记。

## 未来专题怎么放

| 新需求 | 建议位置 |
| --- | --- |
| 中端核心 Pass 逐个拆解 | `compiler` 下新增 `middle-end-passes` 专题；按分析前提、合法性、变换、失效、反例组织章节 |
| GLM5Next KDA 真实部署 | `algorithms` 的算子数据流或新建模型部署专题；交叉链接硬件和编译映射，明确模型版本 |
| 更多公司面经 | 先添加来源记录和公司映射，再根据内容量添加叙事章节 |
| LLVM 后端专题 | `compiler` 下新建专题；不要把所有细节挤进一篇总览 |
| 新 Coding 题型 | `coding` 下按通用算法、数据流、kernel、pass 分类扩章；代码和题源分开 |
| 新硬件代际 | 新知识域或 `hardware` 下独立专题；不改写旧代际的来源范围 |

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
python3 -m unittest discover -s practice -v
TMPDIR=/data/wangxw/tmp g++ -std=c++17 -Wall -Wextra -Werror \
  -fsanitize=address,undefined practice/coding.cpp \
  -o /data/wangxw/tmp/interview-coding-check
/data/wangxw/tmp/interview-coding-check
```

浏览器验收包括主题/专题、旧深链接、目录筛选、公司来源筛选、全文搜索、图示放大、实验计算、笔记、问答、移动端与打印。构建产物 `dist/` 不提交；push 到 `main` 后由 GitHub Actions 构建并发布，发布完成再核验线上内容。
