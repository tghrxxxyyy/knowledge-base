# NVLink与InfiniBand层次

> 对应 NVIDIA 集合通信(NCCL) 与 Kwon 2023 (vLLM 集群) 网络层次。

## 一、背景与挑战
集群内带宽高度不均：节点内 NVLink 数百 GB/s，节点间 InfiniBand 数十 GB/s。并行拓扑须顺应带宽层次。

## 二、核心原理
将通信密集的 TP 放在 NVLink 域(同节点)，通信稀疏的 PP/ZeRO 跨节点走 IB。NCCL 自动按拓扑选 NVLink/PCIe/IB 通道。

## 三、形式化与数学基础
带宽比：
$ B_{\\mathrm{NVLink}} \\approx 300\\,\\mathrm{GB/s} \\gg B_{\\mathrm{IB}} \\approx 50\\,\\mathrm{GB/s} $，
TP 逐层 all-reduce 需高带宽低延迟，故 $t$ 应 $\\le$ 节点内卡数；跨节点用 $p,d$ 吸收。

## 四、代码实现
```python
import os
# 提示 NCCL 使用 NVLink 优先
os.environ["NCCL_P2P_LEVEL"] = "NVL"
os.environ["NCCL_IB_DISABLE"] = "0"   # 跨节点启用 IB
# TP 组同节点，PP/DP 组跨节点
```

## 五、与其他技术对比
纯 IB 集群(云)下 TP 度须很小，更多依赖 PP/ZeRO；DGX 类机器可高 TP。拓扑须匹配硬件。

## 六、常见误区
误区一：TP 可跨节点——IB 延迟使其低效。误区二：NCCL 自动最优——仍需正确分组。误区三：带宽均匀，实际层次分明。

## 七、与开源书/权威来源对应
NVIDIA NCCL 拓扑文档；Kwon 2023 vLLM 讨论集群网络；microsoft/DeepSpeed 带宽感知。

## 八、面试题
问：TP 为何限节点内？答：逐层 all-reduce 需 NVLink 带宽。问：跨节点走什么？答：IB，用于 PP/ZeRO。

## 九、演进与趋势
NVSwitch 全互连扩大 TP 域；拓扑感知调度器自动匹配。

## 十、小结
顺应 NVLink/IB 层次部署并行维，是把硬件带宽用满的前提。
