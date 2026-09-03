# Whisper弱监督预训练

> 对应 Radford et al., *Robust Speech Recognition via Large-Scale Weak Supervision (Whisper)*, 2022。

## 一、背景与挑战

多语种、强噪声、多领域语音识别难以用精标覆盖；Whisper 用大规模弱监督音频-文本对训练通用识别器。

## 二、核心原理

收集约 68 万小时多语种弱监督数据，以标准 Transformer seq2seq 训练，任务前缀（如语言/转写/翻译）作为条件。弱监督规模带来强鲁棒性与零样本迁移。

## 三、数学形式

seq2seq 似然：

$$\mathcal L = -\sum_{t}\log p_\theta(y_t | y_{<t}, x, \text{task})$$

task 为控制语言/模式的特殊 token。

## 四、代码实现

```python
logits = whisper.decoder(
    input_ids=tokens,
    encoder_hidden_states=whisper.encoder(mel))
loss = F.cross_entropy(logits[:, :-1], tokens[:, 1:])
```

## 五、与其他对比

- 与 语音识别总览 对照训练范式（弱监督 vs 对齐建模）。
- 与 大模型语音统一 共享“大模型+弱监督”思想。

## 六、常见误区

- 误以为 Whisper 不需后处理；长音频仍需分片与 VAD。
- 忽视任务前缀对输出语言的影响。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Whisper 为何鲁棒？答：极大规模多领域弱监督使模型见过多噪声与口音分布。

## 九、演进

精标小模型 → 弱监督大模型 → 多任务语音。

## 十、小结

Whisper 证明语音也可用“大模型+弱监督”范式，获得强泛化。
