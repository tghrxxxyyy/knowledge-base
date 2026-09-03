# SAE 数学原理

> 对应 Huben et al., *SAEs for Language Model Interpretability*, 2023；Gao et al., *Scaling SAEs*, 2024.

## 一、背景与挑战

要在高维残差流中学到可解释基，需平衡重构保真与特征稀疏/单义。

## 二、核心原理

编码器 $f=Encoder(x)$ 投影到过完备空间，解码器 $d$ 重建；稀疏约束使特征激活分布尖峰（少数非零），对应单一语义。

## 三、数学形式

$\hat f=ReLU(W_{enc}(x-b_{dec})+b_{enc})$；$\hat x=W_{dec}\hat f+b_{dec}$；$\mathcal L=\|x-\hat x\|^2+\lambda\|\hat f\|_1$。

## 四、代码实现

```python
f = torch.relu(x @ W_enc.T + b_enc)
x_hat = f @ W_dec.T + b_dec
loss = ((x - x_hat)**2).mean() + 1e-3*f.norm(1)
```

## 五、与其他对比

- 与 线性探针深入（监督读属性）不同：SAE 无监督分解。
- 与 激活监控深入（监控 SAE 特征）衔接。

## 六、常见误区

- L1 系数与字典大小需联合调。
- 解码器列未归一化致特征尺度混乱。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 过完备为何必要？答：真实特征维度可能高于残差流维，过完备提供足够基以稀疏表示。

## 九、演进

标准 AE → 稀疏 AE → 过完备稀疏 AE。

## 十、小结

SAE 在数学上以稀疏过完备分解换取可解释特征，是表示分解的基石。
