# LLVM / MLIR 两篇教程重写验收

日期：2026-10-26。范围：编译器主题、两篇独立 HTML、旧链接迁移及岗位关联链接。

## 技术正确性

- 基础篇 18 节、后端篇 24 节，新增 7 张原创 SVG；拆开 LLVM New PM、MLIR PM、传统 CodeGen PM 的接口和作用域。
- 共享 LLVM 22.0.0git 的关键 37 个文件用 SHA256 固定。没有可用 Git revision，明确未知；具体出处见 `compiler-guides-sources.md`。
- 实际运行 opt、mlir-opt、llc；保存 ISel 后及 RA 后 MIR、最终汇编和对象反汇编；机器 verifier 通过。没有执行生成的函数或做性能测量。
- DAG 图明确 load 同时产生数据和 chain，chain 箭头为 EntryToken → load → store；没有把结果反向画成 load 的输入。
- SelectionDAG 内部 combine/legalize/select 与顶层 Pass 区分，GlobalISel 是替代路径，RegBankSelect 不等于 RA。

## 读者可理解性

- 组件篇先定义对象和语义，再讲执行、缓存、重写；后端篇用同一个 5*x+y 贯穿到 LEA + ADD。
- 全图按表示和约束下降，各模块说明职责、输入输出、源码入口及调试方法；RA 分成活跃性、Greedy、spill 三节，后续可以原位扩展。
- 历史博客只作为模块划分和阅读线索，当前机制由共享源码和官方文档核对。

## 视觉与功能

- Playwright / Chromium，1440×1000 桌面、390×844 手机；两独立入口、模块目录、可点击总图、图示放大、搜索 VirtRegRewriter、HTML 下载和 file:// 离线阅读通过。
- 全部旧 7 章的 section 锚点逐一解析成功，readingVersion 2 的旧笔记和已读记录迁移保留；新两篇不会被旧已读状态直接标记完成。
- 两篇的所有 SVG 文本边界检查通过，并逐张截图检查连线和文案。手机文档宽度为 390，未出现整页横向溢出；复杂图可横向查看和放大。
- 打印生成 A4 PDF，检查总图页面完整、侧栏隐藏、各 section 保留。
- 构建、scripts/check.py、全部 JS 语法、现有五组教学模型检查、9 个 Python coding 测试、C++ sanitizer 检查通过。
- 发布前用当前 check_public_artifact 对完整候选 dist 执行检查，包含岗位 HTML 和两篇新 HTML；未发现私人文档或联系信息模式。

## 发布边界

本轮用户在获知规范冲突和仓库仍为 public 后，明确回复“按本轮授权，直接发布到现有公开仓库”。本次只提交教程相关修改；不修改仓库可见性，不发布简历或浏览器产物。GitHub Actions 是否完成及线上产物是否一致须以实际部署后的核验为准。
