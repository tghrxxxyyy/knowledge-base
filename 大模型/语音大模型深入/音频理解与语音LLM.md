# 音频理解与语音 LLM

> 见「语音大模型深入/语音大模型总览」；AudioPaLM / Qwen-Audio / GPT-4o 思路。

## 一、背景与挑战

让 LLM 直接「听懂」声音（语音/音乐/环境声）。

## 二、核心原理

把音频编码为离散 token（如 EnCodec/SoundStream 量化），与文本 token 同处词表，训练多模态 LLM 做语音问答/翻译/理解。AudioPaLM 用 PaLM 统一语音-文本。

## 三、关键要点

- 音频 tokenizer 质量决定上限。
- 需大量配对语音-文本数据。

## 四、代码实现

```python
audio_tokens = encodec(audio)
out = llm.decode(text_tokens + audio_tokens)
```

## 五、与其他对比

- 级联 ASR 丢信息；原生理解保韵律。

## 六、常见误区

- 语音理解=ASR——忽略非语言信息。

## 七、与开源书对应

- Rubenstein et al., AudioPaLM, 2023.
- llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- 语音 LLM 如何统一语音与文本？

## 九、演进

级联 → token 统一 → 端到端。

## 十、小结

音频，也进 LLM 的「词表」。
