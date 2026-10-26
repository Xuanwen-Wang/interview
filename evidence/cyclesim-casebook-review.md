# CycleSim案例版审查与验收

本轮由源码审查、教学审查、浏览器可用性检查分别把关。未执行新的CycleSim、VCS或硅上实验；所有硬件数值来自具名历史记录，浏览器只重算限定公式或显示已有采样。

## 技术审查

两轮独立复核并回看修正：GEMM没有LD/DT/PE三者同时活动；2271是所选queue trace区间并集而非datapath busy；PE工作路径末9拍为写响应；BF16累加器为FP32；独立DT的beat为32B/256bit；MTC_count与MTC_raw明确区分；macro按16B字交错不等于容量16B；LD请求接收计数不等于响应完成；11pin不含credit或trace done。

六档BF16纯公式、四组INT4共40个控制锚点、七段GEMM区间、LD/ST事件差分、partial byte-enable与DT尾块反例均独立复算。保留PE平台区残差及历史INT4异常，不把事件重建当零误差预测。

## 教学审查

顺序固定为场景QA、真实硬件/模型状态、整体时间、逐单元真实shape、依赖、误差评估和两分钟口述。补全PE span=10/18/42的推导及KC/MTW/MTK/MTC/II/SQT/PSMO定义，LD/ST短标签与INT4中文事件说明。提供约15分钟速读路径，原30节详细参考折叠保留。

## 视觉与交互

浏览器逐步检查21案例/141步骤，专用图额外验证64状态；播放、暂停、前后步进、重置、案例切换和图示放大均检查。逐图查看硬件连接、GEMM、LD/ST、PE比较、VP流水，以及INT4等待/反压、DT尾块、partial读旧/合并、多DT统计尺。图中文字未越出viewBox，四类专用图中文字互叠检查通过。

390px手机布局页面无横向溢出；宽图在图内滚动并可放大。打印展开当前案例的完整账本并隐藏控件；离线HTML可切换/播放，无外部脚本依赖。旧30节/8阶段ID和5个原练习题保留，旧深链接能自动展开参考节。源代码与证据链接转向GitHub，离线正文与动画可读，远端源码链接仍需联网。

## 可重复检查

- `python3 scripts/build.py`
- `python3 scripts/check.py`
- `python3 scripts/test_public_artifact.py`：20项，包括新内嵌案例payload的编码/标签重组反例。
- `python3 scripts/check_public_artifact.py`：只允许dist中的17个Pages文件。
- `node scripts/check_cyclesim_model.js`：PE固定期望/信用取整、DT逐块max反例、trace区间并集、4KiB拆分与RMW字节几何。
- `node scripts/check_interviews.js`及受影响JS语法检查。
- `git diff --check`

网页版计算器有明确profile边界：PE仅提供六档受控BF16案例，DT图仅展示固定8×20尾块。不会把任意新shape标成已测。技术审查与浏览器验证不替代新硬件测量；提交/CI/线上部署由发布流程另行核验。
