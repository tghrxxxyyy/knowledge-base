# 多 GPU 与 Tensor Parallel

> 对应 Shoeybi 2019 Megatron; NVIDIA/TensorRT-LLM; Ainslie 2023 GQA。

## 一、背景与挑战
单卡显存/算力不足，需多卡并行。TRT-LLM 在构建期把层切分到多 GPU，运行时用 NCCL 通信。

## 二、核心原理
TP 把权重按维度切分，各卡算局部结果再 all-reduce。构建器按 tp_size 生成分片引擎，层内通信隐藏在计算后。

## 三、形式化与数学基础
列切分：
$ Y = [X W_1, \dots, X W_t],\ W_i \in \mathbb{R}^{d\times (d/t)} $
all-reduce 汇总结点输出。

## 四、代码实现
```python
from tensorrt_llm import Mapping
mapping = Mapping(world_size=4, tp_size=4)
build(model, mapping)            # 生成 4 卡分片引擎
```

## 五、与其他技术对比
PP 切层、TP 切层内；TRT-LLM 偏 TP 以降单步延迟，配合 NCCL 重叠通信。

## 六、常见误区
误区：TP 越大越好。跨节点 TP 通信成本高，需 NVLink 支撑。

## 七、与开源书/权威来源对应
Shoeybi et al. 2019 Megatron-LM。见 NVIDIA/TensorRT-LLM。

## 八、面试题
问：TP 与 PP 如何选？
答：节点内用 TP 低延迟；跨节点用 PP 减通信，常组合。

## 九、演进与趋势
自动并行策略搜索按拓扑给出最优切分。

## 十、小结
多 GPU 并行是 TRT-LLM 服务大模型的必需，TP 为主、PP 为辅。
