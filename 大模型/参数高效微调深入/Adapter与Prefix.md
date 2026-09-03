# Adapter与Prefix Tuning

> 对应 Houlsby et al., 2019（Adapter）；Li & Liang, 2021（Prefix-Tuning）；Lester et al., 2021（Prompt-Tuning）。

## 一、背景与挑战

LoRA 前已有两类 PEFT：在层间插小网络（Adapter）或在输入/激活前加可训前缀（Prefix/Prompt）。

## 二、核心原理

- Adapter：在 FFN 后插入瓶颈（down-project→非线性→up-project），训练时冻结主干。
- Prefix-Tuning：在每层 K/V 前拼接可训前缀向量 $P_k,P_v$，控制生成。
- Prompt-Tuning：仅在输入嵌入前加可训 soft prompt。

## 三、数学形式

Adapter 参数量 $\approx 2\times d\times r$（瓶颈 $r$）；Prefix 参数量 $=2L\times l_p\times d$（$l_p$ 前缀长）。

## 四、代码实现

```python
# Adapter 瓶颈
h = down(act(up(x))) + x   # 残差
```

## 五、与其他对比

- Adapter 增推理延迟（串行）；Prefix 不改结构但占用上下文长度。
- LoRA 在质量/效率权衡上常更优，逐渐主流。

## 六、常见误区

- 误以为 soft prompt 越长的越好；过长或过短都劣化。
- Adapter 放置位置（仅 FFN 后 vs 注意力后）影响效果。

## 七、与开源书对应

- llm-course PEFT：https://github.com/mlabonne/llm-course

## 八、面试题

- Adapter 与 LoRA 的结构差异？答：Adapter 插瓶颈子网络，LoRA 低秩改权重。

## 九、演进

Adapter → Prefix/Prompt Tuning → LoRA → 统一 PEFT 库（peft）。

## 十、小结

Adapter/Prefix 是 PEFT 早期代表，奠定“只训少量参数”思想，后被 LoRA 广泛采用。
