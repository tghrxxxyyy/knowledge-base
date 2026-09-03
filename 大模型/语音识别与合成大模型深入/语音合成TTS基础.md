# 语音合成（TTS）基础

> 对应 Wang et al., *Tacotron*, 2017；Shen et al., *Tacotron 2*, 2018。

## 一、背景与挑战

从文本生成自然语音需建模文本→声学特征→波形的两段映射，早期拼接/参数法不自然。

## 二、核心原理

现代 TTS 通常两段：前端文本→梅尔谱（Tacotron 类自回归/非自回归），后端声码器→波形（WaveNet/HiFi-GAN）。也可端到端直接生成波形。

## 三、数学形式

声学模型似然：

$$p(\text{mel}|text)=\prod_t p_\theta(m_t|m_{<t}, text)$$

声码器再建模 $p(wave|mel)$。

## 四、代码实现

```python
mel = acoustic_model(text_tokens)        # [T, n_mels]
wav = vocoder(mel)
```

## 五、与其他对比

- 与 神经声码器 衔接（后端）。
- 与 大模型语音统一 对照统一建模。

## 六、常见误区

- 忽视文本前端（韵律/多音字）致读音错。
- 自回归 TTS 易重复/漏读。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- TTS 为何两段式？答：声学建模与波形生成难度不同，分开更易训练与替换声码器。

## 九、演进

拼接 → 参数 → 神经声码器 → 端到端。

## 十、小结

TTS 以“文本→谱→波形”两段为主流，质量由声码器与韵律建模共同决定。
