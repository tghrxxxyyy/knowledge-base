# 时空Tokenization与帧采样

> 对应 视频多模态模型（如 Li et al. 2023 「VideoChat」、Maaz et al. 2023 「Video-ChatGPT」）帧采样策略。

## 一、背景与挑战

视频帧数巨大，全帧送 LLM 不现实。需采样策略与 token 压缩在保留时序信息与控制上下文长度间权衡。不同任务（动作、事件、时序推理）对采样密度需求不同。

## 二、核心原理

常用均匀采样（uniform）、关键帧采样（基于镜头检测）、固定帧数（如 8/16/32 帧）。每帧用 ViT 提特征后，可经 3D 时间池化、时空 token 合并或 Q-Former 重采样压缩成固定长度 token 序列喂给 LLM。

## 三、数学形式

均匀采样：f_k = \lfloor k \cdot T/N \rfloor, k=0,\dots,N-1。token 压缩采用时间平均或卷积下采样：
h_t = \frac{1}{w}\sum_{j=t}^{t+w-1} z_j
或用可学习重采样 q_i 经 cross-attn 得 M 个视频 token。

## 四、代码实现

```python
import torch

def uniform_sample(frames, n=16):
    idx = torch.linspace(0, len(frames)-1, n).long()
    return frames[idx]                     # [N, C, H, W]

def temporal_pool(z, w=2):
    return z.unfold(0, w, w).mean(-1)      # 沿时间平均压缩
```

## 五、与其他对比

相比全帧，采样省算力但可能漏关键帧；相比关键帧，均匀更简单稳定；Q-Former 压缩信息密度高但训练复杂。VLM 常选 8–32 帧 + 投影。

## 六、常见误区

固定帧数忽略视频长度差异；采样过稀丢失快速动作；混淆帧分辨率与时间分辨率；以为越多帧越好（边际递减且爆显存）。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：为何要帧采样？答：控制 token 量与算力，避免信息冗余。
- Q：均匀 vs 关键帧？答：均匀稳定简单，关键帧抓变化但需检测。
- Q：如何压缩视频 token？答：时间池化或 Q-Former 重采样。

## 九、演进

动态帧采样（按内容）；时空 token 合并（pixel shuffle 式）；长视频分层摘要。

## 十、小结

时空 tokenization 与帧采样是视频接入 LLM 的工程枢纽，合理压缩在保信息与控制成本间决定视频理解上限。
