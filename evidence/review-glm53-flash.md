# GLM-5.3-Flash 五专题更新审查

日期：2026-10-28，Asia/Shanghai。来源固定与文件 SHA256 见 [架构依据](glm53-flash-architecture.md)。

## 更新范围

- 新入口 #module/glm53-flash，使用正式命名与五篇完整教程目录；按用户最新要求，不新增旧module/moe路由兼容。
- 整网概览10节：完整网络图、45层展开、单层mHC包裹、两类Attention状态和world16分工。
- Attention原四章合为34节连续长文，补充当前v3.1执行边界；历史v4折叠对照。
- mHC独立9节：用途、四流shape、24系数、Sinkhorn、非对称矩阵手算、norm/contract、当前API与验证。
- 其余组件独立8节：Embedding、前三层Dense、LM Head、采样、视觉、MTP和请求状态推进。
- MoE保留技术正文，只调整标题、身份说明、导航与下载命名。
- 新绘13张图（其中两处复用Attention状态对照），没有修改业务源码。
- 所有修改在独立工作树完成，原共享目录已有改动不覆盖、不夹带提交。

## 技术正确性

结论：通过本次配置、源码和独立数学层审查。

- 正式多模态模型320B/18B与历史300B开发称呼分别标明；视觉分支与语言部署证据分开。
- 45层按34KDA/11DSA与3Dense/42MoE两条轴展开；nextn不计入45主层。
- mHC的C行是输入流、列是输出流，使用CᵀX；pre/post门与comb的约束分开。
- 用非对称循环置换证明转置方向，用100个置换矩阵凸组合验证残差混合总和与凸界，另有仅行随机的反例。
- 本地KDA当前为唯一v3.1、decay-first、BF16中间舍入；旧v4的decay-last只作为历史对照。
- Dense Gate只作上界clamp，Up作双侧clamp；TP Down partial与完整hidden分开。
- Embedding full-table开发caller不与masked接口能力混淆；Head返回token不等于省略跨TP协调。

## 初学者可理解性

结论：按完整输入到输出顺序审读通过。

- 先解释T、H、流轴与层号，再给图、shape和源码。
- 先完整网络，再单层，再各组件；KDA与DSA按两种层类型并列。
- mHC从普通残差的用途进入，依次解释pre、主计算、post、final均值与norm。
- 数值例子明确为单坐标教学假设，不伪装成真实Attention数值或设备golden。
- 参数、状态容量、逻辑payload与实测性能分开。

## 视觉与浏览器

结论：桌面、390px手机与A4打印抽查通过。

- 逐张查看本次新图，检查文字、连线、shape和输入/输出；修正采样反馈箭头与mHC示例缺失连线。
- 1440px桌面：五篇教程占完整宽度，各篇提供完整HTML、保存入口和阅读阶段。
- 390×844手机：新四篇文档scrollWidth均为390，无页面水平溢出；宽图内部可横向滚动并可打开缩放。
- 实际验证图示放大、搜索mHC/Sinkhorn、同页阶段跳转、折叠历史小节自动展开、笔记保存。
- Attention旧四章已读/笔记经过已有通用机制保留；旧已读不误标整篇新长文已读。
- 实际下载文件名为glm53-attention.html；file协议离线打开34节并可跳转当前KDA阶段。
- mHC导出9页A4 PDF，并查看包含公式与非对称矩阵示例的打印页面。
- 模板回归：compiler模块仍为原有两篇教程；GLM模块为五篇。
- 浏览器验收未发现pageerror。

## 已执行检查

- python3 scripts/build.py
- python3 scripts/check.py
- python3 scripts/check_glm53_model.py
- python3 scripts/check_public_artifact.py
- python3 -m unittest discover -s scripts -p 'test_public_artifact.py' -q：20项通过
- node --check web/catalog.js
- node --check web/reading.js
- node scripts/check_moe_model.js
- node scripts/check_decode_model.js
- node scripts/check_attention_lab.js
- git diff --check

本次未执行checkpoint加载、多模态模型推理、设备kernel、Graph、CycleSim、VCS或硅上端到端实验。本文记录本地验收；提交、CI、部署和线上文件比对以本次对应的发布记录为准。
