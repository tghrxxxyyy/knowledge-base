# 仿真环境与 sim-to-real

> 对应 github huggingface/transformers 项目与 Brown 2020 的 in-context learning 论文。

## 一、背景与挑战
真实机器人采集昂贵且危险。先在仿真训练再迁移到现实，但域差异会导致性能掉点。

## 二、核心原理
在物理仿真中大规模收集交互，训练策略；通过随机化动力学与外观、域适配缩小仿真与真实差距，实现 sim-to-real。

## 三、形式化与数学基础
域随机化目标：
$ \min_\theta \mathbb{E}_{e\sim p(e)}[\mathcal{L}(\pi_\theta; e)] $
$ e $ 为环境参数。

## 四、代码实现
```python
import torch

def randomize_env(base, sampler):
    cfg = sampler()
    return base.clone(cfg)

def train_domain_agg(model, envs, steps):
    loss = 0.0
    for e in envs:
        loss += model.rollout_loss(e)
    loss = loss / len(envs)
    loss.backward()
    return loss

def adapt(real_buffer, model, k=100):
    for _ in range(k):
        model.finetune(real_buffer.sample())
```

## 五、与其他技术对比
相比纯真实训练，仿真省成本；相比域随机化，域适配更针对真实分布。

## 六、常见误区
随机化不足仍过拟合仿真。真实微调破坏原策略。

## 七、与开源书/权威来源对应
- Brown 2020 in-context
- github huggingface/transformers
- github pytorch/pytorch

## 八、面试题
问：sim-to-real 为何难？答：仿真与真实在动力学、传感器上存在系统性差异。

## 九、演进与趋势
可微仿真、真实噪声注入与持续自适应。

## 十、小结
仿真加域适应是机器人规模化的可行路径。
