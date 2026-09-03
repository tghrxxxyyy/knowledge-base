# SAE应用与局限

> 对应 Cunningham et al., ICLR 2024；以及监控/引导（steering）应用。

## 一、背景与挑战

SAE 不仅用于理解，也可用于监控与引导模型行为，但存在局限。

## 二、核心原理

应用：读特征做模型监控（如检测欺骗特征激活）、用特征方向做 steering（增强/抑制某行为）、定位有害特征。局限：重建不完美、特征可能非因果、字典成本随规模爆炸。

## 三、数学形式

引导 $\tilde x = x + \alpha f_i W_{dec,i}$，调节第 $i$ 特征强度；监控阈值 $\mathbb I(f_i > \tau)$。

## 四、代码实现

```python
f = sae.encode(x)
f[:, danger] *= 0.0      # 抑制危险特征
steered = x + alpha * sae.decode(f)
```

## 五、与其他对比

- 与 因果干预与激活修补深入 衔接（steering 是轻量干预）。
- 与 回路可解释性实证深入 互补（特征 vs 回路）。

## 六、常见误区

- 把 SAE 特征方向当因果旋钮；需因果验证。
- 以为监控覆盖全部风险特征。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- SAE 局限？答：重建有损、特征未必因果、字典成本随规模陡增、仅近似解耦。

## 九、演进

解释 → 监控 → steering/安全应用。

## 十、小结

SAE 已从解释工具走向可控应用，但因果性与成本仍是要害。
