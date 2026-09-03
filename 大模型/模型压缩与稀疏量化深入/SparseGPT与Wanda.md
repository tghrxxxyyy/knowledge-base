# SparseGPT与Wanda

> 对应 Frantar & Alistarh, *SparseGPT*, 2023（ICML）；Sun et al., *Wanda*, 2023。

## 一、背景与挑战

LLM 一次剪枝即崩；SparseGPT 同时做剪枝+量化，Wanda 用权重×激活幅值做无训练剪枝。

## 二、核心原理

SparseGPT：基于 OBS 的逐列剪枝，用 Hessian 逆补偿残差，可与量化联合。Wanda：若 $|W_{ij}|\cdot\|X_j\|_2$ 小则剪除，简单高效无重训。

## 三、数学形式

Wanda 分数 $S_{ij}=|W_{ij}|\cdot\|X_j\|_2$；保留每输出行 top-k 个，其余置零。

## 四、代码实现

```python
score = (w.abs() * x_norm.unsqueeze(0))
mask = torch.zeros_like(w)
mask[topk(score, k)] = 1
w_pruned = w * mask
```

## 五、与其他对比

- SparseGPT 精度高但重；Wanda 快且无需校准训练。
- 与 GPTQ 可组合（先剪后量化）。

## 六、常见误区

- 剪枝率高（>50%）仍期望无损，不现实。
- Wanda 用单一校准批，分布偏移时偏差大。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- Wanda 为何有效？答：权重幅值乘输入激活范数衡量该连接重要性，低者剪除对输出影响小。

## 九、演进

OBS → SparseGPT（剪+量）→ Wanda（无训练剪枝）→ 结构化稀疏。

## 十、小结

SparseGPT/Wanda 让 LLM 剪枝可行，与量化组合进一步压缩。
