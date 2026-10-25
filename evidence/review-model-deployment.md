# 从完整模型到真实部署：重构审查

日期：2026-10-25。基线为 `3996be3`，保留同日已完成的PE连续阅读改版。任务在独立工作树完成，不覆盖原工作区的并行修改。

## 内容与结构

- 算法域先读Qwen3-8B的GQA + Dense SwiGLU，再看内部GLM5Next完整结构，随后沿Attention与FFN两条线拆解；实际rank、collectives与kernel ABI移入部署域。
- 原MoE主题显示名改为“GLM5Next 300B真实部署”，保留`#module/moe`地址。增加整层地图、通信窗口、KDA/DSA真实实现及MoE算子内部章节。
- 两个主题均提供四步阅读路径。每章仍有唯一主目录位置，后续可添加模型、Attention、kernel或优化专题。
- 原有算法、算子、MoE章节和全部旧section ID保留，已有链接和笔记不需要迁移。PE旧链接、连续阅读与本地笔记机制沿用基线。

## 版本与技术交叉审查

使用三个并行内容作者及独立交叉复核，分别负责算法演进、Attention部署、MoE实现；主线程负责整层通信、FFN算例、导航与网页验收。

复核并修正的关键点：

1. 基础模型采用官方Qwen3-8B，不凭近似参数量虚构Qwen3-7B/13B配置。
2. 内部Next与公开GLM-5分开；34KDA+11DSA和3Dense+42MoE是同一45层的两个分类。
3. 当前MoE baseline由外层gather输入、TP求和与EP ReduceScatter包住四个本地kernel；Router计算TopK，Routed/Reduce按owner筛选，不虚构kernel内部token AllToAll。
4. CrossEPLayout是显式启用的load-time专家重排；默认模型caller未传映射，不将可选代码写成默认生产部署。
5. FLAT16改变token和collective窗口，专家权重仍按EP4×TP4分片。DSA完整复制结果切行，不能再次SUM；进入窗口前先取所属DP的完整输出。
6. DSA P3的`[C,1024]`是展平完整输出的连续片段，不总是每token固定列片。P3合并softmax须按LSE质量加权，最后AG16拼接。
7. 模型KDA caller仍显式请求v3.1，最新torch wrapper拒绝旧版本而采用v4家族；明确记为源码发现的集成断点，未声称新组合运行通过。
8. MoE选择bias与原始混合权重分离；TopK packet不是纯索引数组；Shared只贡献一次；未定义route必须在算术前屏蔽，不能用乘零替代。
9. 区分逻辑payload、load请求、物理返回流量、collective字节和端到端时间。历史VCS/CycleSim数字保持原计时边界。

## 已完成验证

- Python构建与内容检查：目录唯一归属、旧section保留、源码链接与证据锚点、SVG标签、无外部脚本资源、便携HTML与PE入口一致。
- JavaScript语法检查通过；既有PE模型的16,384字节映射、256个点积与带宽/驻留检查通过。
- 第一轮Playwright浏览器检查197/197通过：全部63章桌面/手机布局、8个知识域、4步阅读入口、公司与目录筛选、全文搜索、放大、笔记、多标签页、已读进度、问答、三个交互实验和打印。
- 重建后全63章SVG文字边界检查无viewBox越界。修复了mHC状态图一个节点被逐字符展开的问题。
- 数学独立复核：Qwen3-8B 4K逻辑KV 576MiB；Dense每token301,989,888 FLOPs；路由bias示例；MoE M4/M3工作量、TP/EP求和及逻辑字节账。

最终内容冻结后，另完成36/36项增量浏览器检查：12篇算法章与两篇整层部署章在1440px/390px下的布局、section数和SVG文字边界；模型阅读顺序与卡片编号；算法/部署归类；新通信图的打印；file://独立打开与PE便携入口。桌面模型图、FLAT16图和手机目录截图经人工查看。

本版共8个知识域、19个专题、63章、457节、348道问答、106张正文SVG。全部新增/改写内容在三个作者间交叉复核，最后由根任务集成。GitHub发布状态以对应提交的Actions与线上HTML校验为准。所有网页检查均不表示重新完成业务kernel、设备、RTL或全模型运行验证。
