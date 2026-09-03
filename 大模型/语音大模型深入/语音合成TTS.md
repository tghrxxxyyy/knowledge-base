# 语音合成 TTS

> 见「语音大模型深入/语音大模型总览」；Tacotron / VITS / NaturalSpeech。

## 一、背景与挑战

生成自然、富有表现力的语音。

## 二、核心原理

- **Tacotron**：文本→梅尔谱→声码器（WaveNet）转波形。
- **VITS**：端到端变分推理，直接建模波形，质量高。
- **大语音模型**：用 LLM 自回归生成语音 token 再解码（如 Vall-E），可零样本克隆音色。
趋势向「语音 token + LLM」统一。

## 三、数学形式

VITS 用变分下界 + 流式解码。

## 四、代码实现

```python
wav = tts_model.synthesize(text, speaker_id=spk)
```

## 五、关键要点

- 表现力（情感/韵律）是难点。
- 零样本音色克隆靠参考音频。

## 六、与其他对比

- 拼接死板；神经 TTS 自然。

## 七、常见误区

- TTS 只文本入——情感需额外信号。

## 八、与开源书对应

- Kim et al., VITS, 2021.
- llm-course: https://github.com/mlabonne/llm-course

## 九、面试题

- VITS 相比 Tacotron 优势？

## 十、演进

拼接 → Tacotron → VITS → 语音 LLM。

## 十一、小结

TTS，是 LLM 的「声线」。
