# AWQ通道缩放因子搜索与网格搜索

> 对应 Lin 2023 AWQ 的缩放因子网格搜索与 huggingface/transformers 量化配置。

## 一、背景与挑战

AWQ 的缩放因子并非简单归一化即可，最优 $ \\alpha $ 与整体缩放系数需通过搜索确定，以最小化量化后的任务损失。

## 二、核心原理

实际实现中，对候选 $ \\alpha $（如 0~1）与全局放大上限 $ s_{\\max} $ 做网格/随机搜索，以校准集上的重建误差或少量任务指标为准则，挑选最佳缩放方案。

## 三、形式化与数学基础

目标：

$ \\alpha^*,s^*=\\arg\\min_{\\alpha,s}\\|WX-\\hat{\\tilde W}\\tilde X\\|_2^2 $

其中 $ \\hat{\\tilde W} $ 为对 $ \\tilde W $ 量化后的结果。搜索空间离散化以减少开销。

## 四、代码实现

```python
import torch

def search_awq(W, X, alphas=(0.0, 0.25, 0.5, 0.75, 1.0), smax=2.0):
    best, best_cfg = float("inf"), None
    for a in alphas:
        Wt, Xt, s = awq_scale(W, X, alpha=a)
        q = grouped_quant(Wt, bits=4)[0]
        loss = (((dequant(q) - Wt) @ Xt) ** 2).sum().item()
        if loss < best:
            best, best_cfg = loss, (a, s)
    return best_cfg
```

`awq_scale` 与 `grouped_quant` 见同系列其它文档。

## 五、与其他技术对比

- GPTQ 用解析的二阶补偿，AWQ 用经验搜索，二者互补。
- 相比纯 RTN，AWQ 多一次搜索但精度收益明显。

## 六、常见误区

- 搜索只在单层做而不看端到端，易过拟合校准集。
- 候选空间过大导致量化耗时超过 GPTQ。

## 七、与开源书/权威来源对应

- Lin et al. 2023, AWQ.
- huggingface/transformers: https://github.com/huggingface/transformers
- mit-han-lab/llm-awq: https://github.com/mit-han-lab/llm-awq

## 八、面试题

- 为什么 AWQ 需要搜索而不是闭式求解？
- 搜索目标用什么度量？
- 搜索开销如何控制？

## 九、演进与趋势

自适应搜索正被可微分/一次性估计替代，减少人工网格搜索成本。

## 十、小结

通道缩放搜索是 AWQ 精度的关键步骤，轻量搜索即可逼近更贵方法的效果。
