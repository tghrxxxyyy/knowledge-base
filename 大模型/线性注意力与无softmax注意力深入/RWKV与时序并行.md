# RWKV与时序并行

> 对应 Peng et al., 2023 *RWKV: Reinventing RNNs for the Transformer Era*。

## 一、背景与挑战
RNN 训练难以并行，Transformer 推理代价高。RWKV 设计一种时间衰减的线性循环，可并行训练也可常数推理。

## 二、核心原理
WKV（weighted key-value）计算：对位置 $t$，$ o_t = \frac{\sum_{i\le t} \exp(-(t-i) w + k_i) v_i}{\sum_{i\le t} \exp(-(t-i) w + k_i)}$，其中 $w$ 是逐通道可学习衰减率。训练时用类似 cumulative sum 的并行扫描。

## 三、形式化与数学基础
$ a_t = e^{-w} a_{t-1} + e^{k_t} $（分子累加），$ b_t = e^{-w} b_{t-1} + e^{k_t} v_t $；$ o_t = b_t / a_t $。可写成矩阵形式 $ \begin{pmatrix} a_t \\ b_t \end{pmatrix} = \begin{pmatrix} e^{-w} & 0 \\ 0 & e^{-w} \end{pmatrix} \begin{pmatrix} a_{t-1} \\ b_{t-1} \end{pmatrix} + \begin{pmatrix} e^{k_t} \\ e^{k_t} v_t \end{pmatrix} $，可并行扫描。

## 四、代码实现
```python
# 时序衰减伪代码
for t in range(L):
    a = decay*a + torch.exp(k_t)
    b = decay*b + torch.exp(k_t)*v_t
    o[t] = b / a
```

## 五、与其他技术对比
- vs RNN：可并行训练。
- vs Mamba：RWKV 衰减是固定的逐通道标量，Mamba 是输入依赖的选择性门控。

## 六、常见误区
- 误把 RWKV 当成纯 RNN；训练需要特殊 kernel（custom CUDA）。
- 衰减 $w$ 必须为正，否则会爆炸。

## 七、与开源书/权威来源对应
- BlinkDL/RWKV 语言模型官方仓库。
- d2l-ai/d2l-zh 第10章序列模型。

## 八、面试题
- RWKV 为什么能并行？答：循环是线性时不变（LTI）的，可写成关联扫描（prefix scan）并行。

## 九、演进与趋势
RNN → LSTM → RWKV → Mamba（输入依赖选择性）。

## 十、小结
RWKV 以线性时不变的衰减循环实现训练并行与推理常数复杂度，是线性序列建模的重要分支。
