# CycleSim 工程长文验收

日期：2026-10-26。对象：`content/41-cyclesim-engineering.json`，30 节、8 个阅读阶段、17 张原创 SVG、5 个主问答，单一连续入口 `cyclesim.html`。内容 SHA256：`59e0d373bce1d2fd51af93ceba7c5dcffe5f5147b5d7288ee000fac5d0c2b8bb`。

## 技术正确性

结论：通过当前源码静态核验和教学算例复核。运行入口、时钟、队列、mailbox 与 LD/VP/PE/DT 分工交叉审阅，源码依据见 [证据索引](cyclesim-sources.md)。默认 LD/ST 解析路径、VP/DT 可选 live、限定 INT4 局部闭环分别交代，未推广为全芯片逐引脚模拟。默认公共 L2Bus 不计跨 master 竞争的边界已明确。

- LD：连续对齐的 128B / 4096B 原始解析成本为 108 / 139；明确它们不等于完整 timeline svc。逐行 64×64B、stride128B 的物理 beat 与连续4096B 的不同已经说明。
- PE：FP8×FP8 KC、N=H=1/W4/C512/K128、mtw4/mtk1/MTC0，独立核验四 mini-tile、W_a=R_a=A=4，stream50 + fill4 = array54，仍非整条 PE 时长。
- DT：BF16 N1/H16/W16，C24/C32/C1 的 block fill/drain 独立枚举为 572/580/293；命令头+3单列。
- mailbox：初始零令牌、仅尾部 MAIL 通知，教学 outbox32/33/34、35投递并拍末commit、36令牌可用。实际 DT 开始另受命令头和资源限制。
- 时钟：一般 ChipConfig 的400/500MHz与INT4局部固定400/400MHz分开。service、trace、retire及mail可见事件没有混同。

未执行：新 CycleSim 构建、模型运行、VCS/RTL 或硅上实验。历史记录保持历史口径，网页检查不形成新的性能认证。

## 初学者可理解性

结论：经过完整顺序阅读和交叉审稿，先给输入输出、事件与时钟，再解释供数、计算、排空及依赖。新增 KC/KW、mini-tile、credit、accept 层次定义；54拍例子给足shape条件。教学双缓冲图用数据块名区分硬件实例；历史偏差案例独立标明来源。工程章节需要按开篇顺序阅读，不能只凭单张图推断完整性能。

## 视觉与交互

结论：17图逐张人工查看；修正过的事件图、LD图、MAIL时间线和双缓冲图重新截图复核。图例、箭头、文字与比较条件可读。双缓冲权重箭头绕开ST，控制虚线不穿字。

- 1440px桌面与390px手机浏览；手机文档宽度390px，无页面横向溢出。复杂图通过放大框滚动阅读。
- 搜索CycleSim可找到章节与正文；搜索结果跳转正常。
- 从用户原入口 `attention.html#module/systems` 可看到新增专题；旧 `#chapter/kv-cache/heads` 正确转到 Attention 长文 `grouped-query`。
- 章节锚点、图示放大/关闭、HTML下载均验证；下载文件名为 `518-cyclesim-engineering.html`。
- 下载的 HTML 通过本地 file URL 打开，完整显示30节与17图，不需要服务器。
- A4打印生成39页PDF，技术补充全部展开；人工查看LD、MAIL、双缓冲所在页，图文未被页面边缘截断。未逐页审阅全部39页；原页面通用打印样式未修改。

## 构建与发布边界

`python3 scripts/build.py`、`python3 scripts/check.py`、`python3 scripts/check_public_artifact.py`、`git diff --check` 通过。公开检查接受17个Pages文件；来源记录另作人工路径与敏感内容检查。没有发布原始RTL、业务输入、个人目录或私人简历。

代码提交、CI和部署为独立状态。部署由该提交触发的 GitHub Actions 完成，仅上传 `dist/`。发布后的 SHA 与线上产物核对状态以本次交付和对应 Actions 记录为准。
