# 原创 Coding 参考实现

这组练习帮助准备已收集面经中的题型；不是候选人提交答案，也不声称还原任何公司的完整题目或评分标准。

| 文件 | 范围 | 验证 |
| --- | --- | --- |
| `reference.py` | K组链表、堆、selection/TopK、拓扑、含phi边使用的活跃性、资源调度、Softmax、scan、Conv2D、均值滤波、u32常量折叠/DCE | 标准库 unittest，含随机差分和独立约束检查 |
| `coding.cpp` | C++17链表、堆排序、CPU分块转置 | CPU编译运行，ASan/UBSan |
| `cuda_kernels.cu` | FP32行Softmax、共享内存转置、3×3均值滤波教学基线 | **未编译运行CUDA，未做GPU性能验收** |

Python参考的各函数 docstring 与章节正文定义输入合同。链表要求无环且由调用者持有；TopK要求有限分数并使用索引打破tie；scheduler只模拟每周期单发射的执行引擎，不含SRAM/队列/异步mailbox；优化器只接受合法直线SSA、明确的32位无符号回绕语义，并保守保留未知op。未知op的具体语义没有执行器，不纳入随机等价证明。

CPU转置对应S05的C++ cache题型。CUDA转置是另加的延伸练习；两者的tile选择、同步和性能模型不同。CUDA输入为连续行主序FP32，输出不与输入重叠；transpose使用block=(32,8)，softmax使用block=(256,1)，grid.x等于行数。维度及padding后的launch坐标必须能放进有符号int，cols不超过INT_MAX−256；Softmax行非空、无mask、输入有限。均值滤波零填充且始终除以9。代码没有host launcher，不能直接当作经过验收的算子库。

在仓库根目录运行：

```bash
python3 -m unittest discover -s practice -v
TMPDIR=/data/wangxw/tmp g++ -std=c++17 -Wall -Wextra -Werror \
  -fsanitize=address,undefined practice/coding.cpp \
  -o /data/wangxw/tmp/interview-coding-check
/data/wangxw/tmp/interview-coding-check
```

题源、身份和教学扩展的区别见网站 Coding 专题，以及 [面经证据](../evidence/interview-sources.md)。
