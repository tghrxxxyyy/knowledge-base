# 时序定位TemporalGrounding

> 对应 视频时序定位研究（如 Gao et al. 2017 「TALL」、video moment retrieval）及视频 LLM 时间 grounding。

## 一、背景与挑战

时序定位（moment retrieval / temporal grounding）要求根据自然语言查询，在视频中定位起止时间戳。难点是视频长、相关片段短、语义对齐弱，且需精确边界而非整段分类。

## 二、核心原理

方法分两派：候选-排序（proposal + ranking）与稠密预测（直接回归边界）。多模态模型将文本与视频帧编码后计算帧级相关性，用边界回归或显著性分数定位。近年视频 LLM 以时间戳格式直接生成起止时间。

## 三、数学形式

给定查询 q 与视频特征 \{v_t\}，帧相关分数 s_t = \langle E_v(v_t), E_t(q)\rangle。边界由得分超过阈值或回归得到：
(\hat{t_s},\hat{t_e}) = \arg\max_{i<j} \sum_{t=i}^{j} s_t
或训练边界回归头输出归一化时间 \tau \in [0,1]。

## 四、代码实现

```python
import torch

def retrieve(scores, thr=0.5):
    mask = scores > thr
    if not mask.any():
        return (0, len(scores)-1)
    idx = torch.where(mask)[0]
    return (idx[0].item(), idx[-1].item())
```

## 五、与其他对比

相比视频分类，grounding 需细粒度边界；相比视频 QA，输出为时间区间；稠密预测比 proposal 端到端更简洁。LLM 直接输出时间戳兼具可解释性。

## 六、常见误区

把整段视频当答案；忽略边界精度指标（如 IoU）；用分类损失而非回归；未处理多片段查询。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：时序定位任务？答：按文本查询定位视频起止时间。
- Q：评估指标？答：IoU@t、R@1 等。
- Q：LLM 如何做？答：输出时间戳，端到端可解释。

## 九、演进

从 proposal 到稠密预测；从独立模型到视频 LLM 内统一；支持自然语言多片段。

## 十、小结

时序定位把语言查询映射到视频时间轴，是视频理解从感知走向可交互检索的关键能力，正被统一进视频大模型。
