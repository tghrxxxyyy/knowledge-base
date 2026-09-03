# 语音文本LLM架构

> 对应 Speech-LLM 系列（如 Zhang et al. 2023 「SpeechGPT」、Rubenstein et al. 2023 「AudioPaLM」）相关工作。

## 一、背景与挑战

让 LLM 直接理解并生成语音，需解决三种模态流：文本、语音表征、语音 token。直接用波形不可行，需离散化或连续化语音。挑战包括语音 token 序列过长、语义与声学解耦、以及跨模态对齐训练。

## 二、核心原理

典型语音 LLM 用语音编码器（HuBERT/Whisper）提取表征，经量化（如 k-means 或 SoundStream 编解码器）得到离散语音 token，与文本 token 拼入同一词表，由自回归 LLM 统一建模。推理时由语音合成器（codec decoder）还原波形。

## 三、数学形式

语音离散化：u = \mathrm{Quant}(E_{aud}(X))。统一序列建模：
L = -\sum_{t}\log p_\theta(x_t \mid x_{<t}), \quad x_t \in \mathcal{V}_{text} \cup \mathcal{V}_{speech}
即文本与语音 token 共享自回归目标，实现听与说。

## 四、代码实现

```python
def build_speech_llm_input(text_ids, speech_codes, sep_id):
    return text_ids + [sep_id] + [int(c) + OFFSET for c in speech_codes]

# 训练时交叉熵覆盖两类 token，mask 文本/语音损失可加权
```

## 五、与其他对比

相比级联 ASR→LLM→TTS，原生语音 LLM 可保留韵律/情感等副语言信息，支持情感对话；相比 AudioPaLM 用 AudioLM 残差 codec，SpeechGPT 强调模态循环。代价是序列长、训练难。

## 六、常见误区

以为语音 token 可随意量化，实则码本崩溃影响质量；忽略声学与语义 token 分层；混淆 encoder 特征与 codec token 用途；误把文本 LLM 直接当语音 LLM 用。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：语音 LLM 如何离散化语音？答：用 codec/量化器把表征映射为离散 token。
- Q：为何不用波形直接建模？答：序列过长且连续不可微到 token 级自回归。
- Q：如何还原语音？答：codec decoder 把语音 token 合成波形。

## 九、演进

从级联到原生；从单码本到残差多码本（如 EnCodec）；GPT-4o 式端到端实时语音成为工业标杆。

## 十、小结

语音文本 LLM 通过统一 token 空间让大模型具备听与说能力，是语音对话系统走向原生多模态的关键架构。
