# ASR到LLM流水线

> 对应 LLM 应用工程实践及 Radford 2022 Whisper + LLM 集成方案。

## 一、背景与挑战

在端到端语音 LLM 成熟前，最务实方案是 ASR 把语音转文本，再由 LLM 处理。该流水线简单、可控、易调试，但丢失副语言且存在级联延迟与错误传播（ASR 错字导致 LLM 误解）。

## 二、核心原理

流水线分三段：音频前端（VAD 分段、降噪）→ ASR（Whisper 等）输出文本 → LLM（带 prompt 做意图理解/问答/摘要）。可在 ASR 与 LLM 间加入标点恢复、说话人分离与置信度过滤，提升下游鲁棒性。

## 三、数学形式

整体映射：a \xrightarrow{\mathrm{VAD}} a_1,\dots,a_k \xrightarrow{\mathrm{ASR}} t_1,\dots,t_k \xrightarrow{\mathrm{LLM}} r。每段延迟累加：
T_{total}=T_{vad}+T_{asr}+T_{llm}
错误传播概率近似 P_e \approx 1-(1-p_{asr})(1-p_{llm})。

## 四、代码实现

```python
import whisper, openai

model = whisper.load_model("base")
def pipeline(audio_path, sys_prompt):
    txt = model.transcribe(audio_path)["text"]
    return openai.ChatCompletion.create(
        model="gpt-4o-mini",
        messages=[{"role":"system","content":sys_prompt},
                  {"role":"user","content":txt}])
```

## 五、与其他对比

相比原生语音 LLM，流水线易部署、可独立替换组件；但延迟高、丢副语言。适合对情感要求低、需可控性的企业场景。可在 LLM 侧加校正 prompt 缓解 ASR 错字。

## 六、常见误区

忽略 VAD 导致长静音误识别；直接用原始 ASR 文本不清洗；不处理说话人分离致多轮混乱；把 ASR 错误当用户输入硬喂。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：级联方案缺点？答：延迟累加、错误传播、丢副语言。
- Q：如何缓解 ASR 错误？答：加标点/置信过滤，LLM 侧容错 prompt。
- Q：何时选流水线而非端到端？答：需可控、易调试、低情感要求场景。

## 九、演进

VAD 与流式 ASR 降低延迟；ASR 输出带时间戳/置信度；与 RAG 结合做语音问答。

## 十、小结

ASR→LLM 流水线是当前最易落地的语音交互方案，以模块化换取可控性与可调试性，是通向端到端语音 LLM 的务实过渡。
