# 518 lowering 架构总览与地址案例

采集日期：2026-10-26。业务源码只读。源码版本 triton_shared@82613bc2eb30feb9ef7f57aef20584df0ef9e28a。以下引用文件相对该版本无改动；tracked dirty 仅 ci/test_job_vcs_case.txt。未执行编译器/模型/仿真测试。

架构分析不是历史会议记录。教学尾块不是实际编译输出；两份中端/后端回归分别引用，不拼成伪造完整执行链。AddressAllocation性能偏好与InjectSync正确性合同分责，PE复用选项默认false。

- `test/ZeusV3Midend/Unit/Transforms/address_allocation_pe_inflight_reuse.mlir` SHA256 `c14d89f609d5ee2d0396de034c8bea48e6dbb311e68768976851888adb9e0d70`
- `test/ZeusV3Backend/Unit/Transforms/inject_sync_same_unit_linear_war.mlir` SHA256 `76b9bd759738280bea66ffc6c52d6c90f5f9d1a9a60922d1c352bb8a323b834e`
- `lib/Dialect/ZeusHigh/Transforms/AddressAllocation.cpp` SHA256 `4c6485f82b7420062ba389f056c3389a46eb66d625aa7ab3176a104e109cf05f`
- `include/triton-shared/Dialect/ZeusHigh/Transforms/Passes.td` SHA256 `cdcadce3d8473b1d8d46dfdaca843453703771640a3aa46d9d8a652e5363f19b`
