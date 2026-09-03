# 流式音频处理与VAD

> 对应 语音前端工程实践（WebRTC VAD / Silero VAD）及流式 ASR 设计。

## 一、背景与挑战

实时语音应用需边录边处理，不能等整段结束。难点在于准确判断语句边界（端点检测）、处理重叠说话、控制缓冲与延迟。VAD 质量直接决定分段与对话自然度。

## 二、核心原理

VAD 以短帧（如 20–30ms）判断语音/静音。规则法用能量/过零率，学习型（Silero、WebRTC）用小神经网络输出概率。流式 ASR 维护流式 encoder 状态，每收到若干帧即增量解码，结合句尾静音触发最终化。

## 三、数学形式

帧级语音概率 p_t = f_\phi(x_t)。语句边界判定：
b_t = \mathbb{1}\left[\sum_{\tau=t-W+1}^{t} p_\tau < \theta_{sil}\right]
即当连续 W 帧低于静音阈值，判定句尾。流式状态 s_t = \mathrm{Enc}(s_{t-1}, x_t)。

## 四、代码实现

```python
import torch, numpy as np
vad = torch.jit.load("silero_vad.jit")
def is_speech(frame, thr=0.5):
    with torch.no_grad():
        return vad(torch.from_numpy(frame), 16000).item() > thr
```

## 五、与其他对比

相比离线分段，流式显著降低首字延迟；相比固定窗口，VAD 边界更准；学习型 VAD 比能量法在噪声下更稳。代价是需维护状态与处理并发。

## 六、常见误区

静音阈值固定不变导致噪声环境误判；缓冲过大增延迟；忽略多说话人重叠；以为 VAD 可完全替代语义断句。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：VAD 作用？答：检测语音边界，指导分段与端点。
- Q：流式与离线差异？答：流式维护状态增量解码，低延迟。
- Q：噪声下如何稳？答：用学习型 VAD + 自适应阈值。

## 九、演进

神经网络 VAD 替代规则法；与 ASR 共享前端特征；全双工下双向 VAD 检测打断。

## 十、小结

流式音频处理与 VAD 是实时语音系统的底层支柱，高质量的端点检测与增量编码决定了对话的延迟与流畅度。
