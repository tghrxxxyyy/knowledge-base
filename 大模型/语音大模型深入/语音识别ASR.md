# 语音识别 ASR

> 见「语音大模型深入/语音大模型总览」；Whisper (Radford 2022)；Conformer。

## 一、背景与挑战

把语音转文字，需抗噪声/口音/多语种。

## 二、核心原理

现代 ASR 用 **CTC/Transducer** 或 **Encoder-Decoder+注意力**（如 Conformer 编码 + Transformer 解码）。Whisper 用大规模弱监督多语种训练，零样本泛化强。输出文本再进 LLM。

## 三、数学形式

CTC 对齐：`P(y|x) = Σ_π P(π|x)`，π 为含 blank 的对齐。

## 四、代码实现

```python
import whisper
model = whisper.load_model("large"); text = model.transcribe(audio)["text"]
```

## 五、关键要点

- 流式需 transducer/streaming。
- 标点/说话人分离常后置。

## 六、与其他对比

- 传统 HMM/GMM 老；端到端新。

## 七、常见误区

- ASR 100% 准——噪声下退化。

## 八、与开源书对应

- Radford et al., 2022.
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 九、面试题

- CTC 为何需要 blank 符号？

## 十、演进

HMM → CTC → Transformer/Conformer。

## 十一、小结

ASR，是语音的「翻译官」。
