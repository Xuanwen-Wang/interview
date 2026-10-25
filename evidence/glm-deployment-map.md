# GLM5Next 部署地图：整层所有权与通信窗口

核验日期：2026-10-25，Asia/Shanghai。范围是源码阅读、模型推导与网页验收，未执行新的设备、CycleSim、VCS、Graph或全模型测试。业务源码仓库只读；不采用未跟踪的流程文档作为版本证据。

## 固定版本

- `bjxx-algo/zeus_dev` 默认分支 `main`：`05ee10f9cc25d19fca0a144ae095c79b3a888976`。
- `DarronTam/torch_zeus` 默认分支 `master`：`3656952bfee88b1d5f7b68d0e724e54a7a5353d7`。
- 默认分支通过已授权 GitHub CLI 的 API 读取；不对业务 checkout 执行 fetch、pull 或改动。
- KDA caller/callee存在明确版本断点，详见 [Attention当前证据](attention-deployment-current.md)。最新kernel不能因同为默认分支而被描述为已经与模型wrapper联调完成。

## 整层证据定位

以下路径均相对于 zeus_dev 的 `model_state_dev/`，源码链接固定到上述SHA。

| 路径 / 位置 | 支持的结论 | 边界 |
| --- | --- | --- |
| `glm5next_modules/configs/config_next.json` | H4096、45主层、34KDA/11DSA、前3Dense/后42MoE、288/Top8/shared1、mHC4 | 内部配置，不是公开GLM-5；nextn另计 |
| `backup/dev_glm5next_model_decode_modular_test.py:399-436` | mHC pre/post与MoE输入gather、本地kernel、TP AllReduce、EP ReduceScatter的边界 | backup入口；不证明外部生产runtime采用相同串联 |
| `glm5next_modules/tests/test_modular_moe_contract.py:108-166` | 检查gather→kernel→TP reduce→EP scatter顺序；Dense没有MoE的EP collectives | 测试源码，不是本次测试执行结果 |
| `glm5next_modules/_support/_comm.py` | world16与board4验证、同lane跨board分组、board-replicated与flat16算法 | 算法合同，不推断芯片封装或链路实测 |
| `glm5next_modules/integration/comm_token_shard.py:16-52` | TokenLayout、T16分片、显式Batch8 duplication、residual侧张量统一切行 | Batch8额外canonicalization不能忽略 |
| 同文件 `:60-175` | FlatTokenWindow的RS4→Norm→AG16→外部MoE→RS16→Norm→AG4 | 专家计算仍EP4×TP4；DSA完整复制值切行，不再次SUM |
| 同文件 `:178-237` | MhcTokenWindow的hc_post→fused hc_pre/mix/RMSNorm与next-state交接 | 不能用普通AddNorm代替真实mHC |
| 同文件 `:240-268` | 16rank在capture前通过固定控制AG共同确认capacity/flags/hidden | 不允许不同rank各自fallback |
| `glm5next_modules/tests/test_comm_two_layer_device.py` | 两层KDA→FLAT→真实MoE，tied fixture、不同state/residual窗口与Graph检查 | 不等于45层真实权重或本次设备验收 |

## 文件指纹

```text
1d7f3567e84516a4465ae6fa9e0cb0424acfa059c12e75e93beea2ca07da37dc  configs/config_next.json
f8673f281fe2d0078eb7a69698d6ccc56f9b9484663062f80cebc1de8ed24dea  _support/_comm.py
3bf448960c572c5303a8c7eabcedbd0e0c38829977adeb840817dd92cbc38640  integration/comm_token_shard.py
94c6e7658a59082cf5e379bcc74852dab9e8fdd1af733a5e87f0739821ab88e5  backup/dev_glm5next_model_decode_modular_test.py
2646b594ddfab6db0a7c9e79252c9b3d4c30175c576869ce30d2e51b03ce799e  tests/test_comm_two_layer_device.py
```

## 教学推导

T16、H4096、BF16，每条hidden row为8192 bytes。baseline每board4token、每rank输入32KiB；输入gather形成128KiB，TP AllReduce同形，EP ReduceScatter留下32KiB。

FLAT每rank依次为32→8→128→128→8→32KiB，分别对应Attention partial、RS4后、AG16后、MoE partial、RS16后、AG4后。这里只统计逻辑tensor大小，不是wire bytes、算法bus bandwidth或物理链路时延。

DSA的P3输出 `[C,1024]` 表示 `flatten([C,4096])` 的连续四分之一；C4时每CP持有一个完整token，不能一律解释成每token1024列。最终AG16收集不同board/CP片段。细节与源码位置由Attention证据覆盖。

MoE中local Reduce是route weighting和slot/shared合并；TP/EP通信在外部。选择性AllToAll是比较方案，不画成当前四kernel默认内部调用。CrossEPLayout是load-time expert permutation，详见 [MoE当前证据](moe-deployment-current.md)。

## 原创数学例

`ffn-routing-dataflow`的四专家分数 `[0.8,0.6,0.4,0.2]` 与选择偏置 `[0,0,0.3,0]` 独立构造。Top2选择0和2，原分数归一化后乘2.5得到 `[5/3,5/6]`；错误地使用偏置分数得到 `[4/3,7/6]`。该例只说明选人与加权的区别，没有声称复现某一次真实输入。
