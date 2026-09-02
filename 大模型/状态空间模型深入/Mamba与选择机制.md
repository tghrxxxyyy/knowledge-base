# Mamba 与选择机制

> 见「状态空间模型深入/SSM基本原理」与「模型架构演进」。

## 一、背景与挑战

S4 参数与输入无关，难做内容感知选择。Mamba 引入输入依赖参数。

## 二、核心原理

Mamba 让 Δ、B、C 随输入变化（selection），使模型按内容选择性记忆/遗忘；用硬件感知并行扫描高效训练。

## 三、关键要点

- 输入依赖是核心创新。
- 推理时恒定状态大小。

## 四、代码实现

```python
# Δ,B,C 由输入投影得到
dA, dB, dC = proj(x); h = selective_scan(x, dA, dB, dC)
```

## 五、与其他对比

- S4 固定；Mamba 动态选择。

## 六、常见误区

- Mamba 无注意力——是纯 SSM 但更强。

## 七、与开源书对应

- Mamba: https://github.com/state-spaces/mamba
- Gu & Dao, 2023.

## 八、面试题

- Mamba 的选择机制解决了什么？

## 九、演进

S4 → GSS → Mamba(2)。

## 十、小结

Mamba 让 SSM 内容感知。
