# Whisper编码器解码器ASR

> 对应 Radford et al. 2022 「Robust Speech Recognition via Large-Scale Weak Supervision」(Whisper)。

## 一、背景与挑战

传统 ASR 依赖大量标注语音与领域适配，跨域、多语种泛化差。Whisper 用 68 万小时弱监督多语种语音文本对训练，以序列到序列框架实现强鲁棒性与 zero-shot 跨语种识别。挑战在于长音频分段、语言识别与标点恢复。

## 二、核心原理

Whisper 采用 Transformer 编码器-解码器。音频经 log-Mel 频谱图分帧，编码器提取声学表征；解码器以特殊 token（如语言、任务 transcribe/translate、时间戳）为前缀自回归生成文本。弱监督预训练使模型学到通用语音-文本映射。

## 三、数学形式

给定梅尔频谱 X，编码器输出 H=E(X)；解码器最大似然：
L = -\sum_{t=1}^T \log p_\theta(y_t \mid y_{<t}, H, c)
其中 c 为任务/语言控制前缀。推理时以 30 秒滑窗分段并拼接。

## 四、代码实现

```python
import torch

def whisper_decode(model, mel, lang="zh", task="transcribe"):
    tokens = [50258] + model.tokenizer.encode(f"<|{lang}|><|{task}|>")  # 前缀
    out = model.decode(mel, torch.tensor([tokens]))
    return model.tokenizer.decode(out[0])
```

## 五、与其他对比

相比 wav2vec 2.0 自监督 + 微调，Whisper 端到端弱监督、零样本更强；相比 Conformer CTC，序列生成支持标点和翻译；但推理成本较高、对小语种数据仍受限。

## 六、常见误区

以为 Whisper 无需后处理，实则长音频需分段与重叠；忽略任务/语言 token 对结果影响；误用大模型反而慢于专用小模型；混淆训练数据与测试域分布。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：Whisper 为何鲁棒？答：68 万小时弱监督多域数据，学到通用表征。
- Q：如何实现翻译？答：以 <|translate|> token 为前缀，解码到英文。
- Q：长音频如何处理？答：30s 滑窗分段、重叠拼接、时间戳对齐。

## 九、演进

Whisper large-v3 扩展语种；distil-whisper 提速；与 LLM 结合做语音理解级联；流式变体不断涌现。

## 十、小结

Whisper 以弱监督序列到序列范式把 ASR 推向零样本多语种，是语音接入大模型流水线的关键组件，其编码器特征也可作音频表征底座。
