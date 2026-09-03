# Goodhart 定律四型

> 对应 Manheim & Garrabrant, *Categorizing Variants of Goodhart's Law*, 2018；奖励黑客的形式化定义见 Skalse et al., *Defining and Characterizing Reward Hacking*, NeurIPS 2022。

## 一、背景与挑战

「当一个度量成为目标，它就不再是好的度量」——这句话在 RLHF 中反复应验。但笼统地说「Goodhart 了」无助于定位问题。把它拆成可辨别的几类机制，才能对症下药。

## 二、核心原理

常用四分法。回归型（Regressional）：代理与真实目标相关但含噪，选取代理极值点会系统性选到噪声为正的样本，即「胜者诅咒」。极值型（Extremal）：在代理与真实相关的区间外，相关性结构本身改变。因果型（Causal）：优化的是相关量而非因果量，干预后相关关系断裂（如把「回答长」当作「回答好」的原因）。对抗型（Adversarial）：存在主动寻找代理漏洞的优化压力，语言模型的策略梯度天然扮演这个角色。

## 三、数学形式

设真实目标 $R^*$ 与代理 $R$ 满足 $R=R^*+\varepsilon$，$\varepsilon$ 与 $R^*$ 独立且方差为 $\sigma^2$。在 best-of-$n$ 选择下，被选样本的真实目标期望

$$\mathbb E\big[R^*\mid R=\max_{i\le n}R_i\big]\;=\;\mathbb E[R^*]+\rho\,\sigma_{R^*}\,\mathbb E[Z_{(n)}],\qquad \rho=\frac{\sigma_{R^*}}{\sqrt{\sigma_{R^*}^2+\sigma^2}}$$

$\rho<1$ 说明选择带来的真实收益被打折；$\sigma$ 越大（RM 越噪）折损越重，这正是回归型 Goodhart 的定量表述。Skalse 等则把「不可黑客化」定义为：任意使代理不降的策略改动都不会使真实目标下降。

## 四、代码实现

```python
import numpy as np

def regressional_goodhart(n=8, sigma=1.0, trials=20000, seed=0):
    rng = np.random.default_rng(seed)
    true_r = rng.normal(size=(trials, n))              # 真实质量
    proxy = true_r + rng.normal(scale=sigma, size=(trials, n))  # 含噪代理
    pick = np.argmax(proxy, axis=1)                    # 按代理选最优
    gain_proxy = proxy[np.arange(trials), pick].mean()
    gain_true = true_r[np.arange(trials), pick].mean()
    oracle = true_r.max(axis=1).mean()
    return {"proxy_gain": gain_proxy, "true_gain": gain_true, "oracle": oracle}

if __name__ == "__main__":
    for s in (0.2, 1.0, 3.0):
        print(s, regressional_goodhart(sigma=s))       # 噪声越大，真实收益折损越多
```

## 五、与其他对比

- 与 奖励过优化总览：四型是过优化的机制分类，缩放律是其定量表现。
- 与 长度偏置与谄媚：那是因果型与对抗型 Goodhart 的具体实例。
- 与 模型评测：同样的机制解释了「刷榜」为何常常不带来真实能力提升。

## 六、常见误区

- 把所有奖励黑客都归因为「模型作弊」。回归型 Goodhart 不需要任何对抗意图，纯统计效应即可产生。
- 认为增大 $n$（best-of-n）总能变好。$n$ 增大会同时放大噪声选择效应，存在最优 $n$。
- 只治对抗型（打补丁封漏洞），忽略回归型（降低 RM 方差、做集成平均）。

## 七、与开源书对应

- mlabonne/llm-course（评测与对齐陷阱）：https://github.com/mlabonne/llm-course
- d2l-zh（偏差—方差、选择偏差基础）：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 说出 Goodhart 的四种类型。答：回归型（噪声下的极值选择偏差）、极值型（相关性在尾部改变）、因果型（优化相关量而非因果量）、对抗型（存在主动找漏洞的优化压力）。
- best-of-n 为何也会过优化？答：按含噪代理取极值等价于放大噪声正向的样本，真实收益按相关系数打折。

## 九、演进

朴素度量优化 → Goodhart 分型 → 奖励黑客的形式化定义 → 可证明不可黑客化的奖励设计探索。

## 十、小结

分清四型是治理奖励黑客的第一步：回归型靠降方差、极值型靠限偏移、因果型靠改目标、对抗型靠红队与集成。
