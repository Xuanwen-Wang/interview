# CycleSim全篇重写：审查与验证记录

日期：2026-10-27。基线 `f50cae0`；源文件以同提交 Git diff 为准。本轮由主代理完成两遍内容复核及浏览器验收，没有将自审称为独立外部评审。

## 技术正确性

16个主章节全部按“输入合同、硬件状态、周期贡献与重叠、真实shape代入、反例、验证边界”重写。历史参考保持稳定ID，并非将新增核心内容藏入折叠附录。

第一遍沿当前C++及RTL核对：LD/ST descriptor合并不同；LD长run priming；ST partial beat与partial burst区别；latency/occupancy/hold/depth分开；PE mini-tile与两阶段；VP逐元素、两尾槽和标量到达；DT按块sum(max)；共享请求与有序通知。

第二遍修正/补充：

- LD全局源连续不代表离散L2目标没有额外priming，当前global-run计数仍有覆盖边界。
- PE第二阶段可约束done，但array-bound START仍有已知偏早例，不能合称完全对齐。
- VP两个张量共享单读口；普通窄化输出不一定按目标dtype装满lane。
- DT pass分支直接用R且Wout=R，未与转角或reshape混用。
- 参数76/17、67/22、2.48均保留校准/残差层级，不伪装为全部物理级数独立测量。
- 新LD/ST公式预测与局部slave历史68/102分开；日志轴改0→68/0→102，保留原16→84/14→116。

独立算术检查通过：原PE六档、DT控制与sum(max)反例；新增LSU逐字节地址oracle、全页平移不变性、source/destination非对称合并、16B padding、st_15/st_16的P/Q、4KiB合法burst、四槽容量与串行资源互斥。测试不执行业务模拟器。

## 初学者可理解性

逐章检查首次定义、公式量纲与原点：先解释run/beat/burst、tile与allocation、L/O/H/D，再引入公式；先说明每个模型分支和参数，后代入真实shape。主文从约1.2万增加到约3.3万可见字符（字符量不是质量判据）；每单元均能沿控制变量推导变化，额外说明不支持的外推。

贯穿反例包括：同4KiB三种stride成本；两个partial beat只占一个partial burst；PE工作量不变而MTC周转改变；VP87与17.5；规约第一操作数65拍才到；DT433与错误369；DT0几乎不变而邻居吞吐下降；MAIL不能越过长计算。面试QA与复述同步围绕模型重写。

## 视觉与交互

Playwright Chromium检查12组、31案例、191步骤，脚本错误0、SVG文字越界0。实际查看新增贡献图、地址覆盖图、资源预约图、归零日志图；连线/文字和比例说明可读。新计算器具有前后、拖动、重置、播放/暂停、放大以及完整计算账。

390px移动端页面无横向整体溢出；长公式可换行。旧pe-credit深链接自动展开；搜索MTC有结果；笔记及已读保留。`file://`离线初始化12组并可交互，来源链接指向GitHub。

打印12个完整账本自动展开，交互控制隐藏；生成99页完整PDF，并检查LD贡献表、DT推导/图、依赖推导/图等分页，没有图内截断。未逐页人工检查全部99页的旧附录。

## 实际执行的检查

- `node scripts/check_cyclesim_model.js`
- `node --check web/cyclesim-model.js`
- `node --check web/cyclesim-diagrams.js`
- `node --check web/cyclesim-explorer.js`
- `python3 scripts/build.py`
- `python3 scripts/check.py`
- `python3 scripts/check_public_artifact.py`
- 20项public artifact保护测试
- `git diff --check`

源码与历史证据见 [本轮来源](cyclesim-model-first-sources.md)。未构建/运行新CycleSim、VCS或硬件业务；没有以网页测试代替模型数值或RTL验收。CI与实际Pages部署状态另由对应提交记录，不在预发布审查中提前宣称完成。
