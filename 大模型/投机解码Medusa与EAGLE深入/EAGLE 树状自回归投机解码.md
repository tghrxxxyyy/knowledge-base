# EAGLE 树状自回归投机解码

> 对应 Li 2024 EAGLE; Cai 2024 Medusa; Leviathan 2023 speculative decoding。

## 一、背景与挑战
Medusa 基于当前隐状态预测未来，对长程依赖建模弱。EAGLE 用“自回归特征”递归构造草稿：利用已接受 token 的特征而非仅当前隐状态，提升候选准确性。

## 二、核心原理
EAGLE 训练一个自回归草稿模型，输入是上一接受 token 的特征与嵌入，输出下一位置特征，再用轻量 LM head 取候选。多步递归 + 树状展开形成候选树，目标模型一次验证整棵树。

## 三、形式化与数学基础
草稿递归：
$ \hat{h}_{t+1} = g_\phi(\hat{h}_t, e(x_t)) $
其中 g 为 EAGLE 模型，e 为嵌入。接受概率沿树节点：
$ a_i = \min(1, \frac{p_\theta(x_i \mid \cdot)}{q_\phi(x_i \mid \cdot)}) $

## 四、代码实现
```python
def eagle_step(feat, tok, eagle, lm_head, tree):
    cand = []
    h = eagle(feat, embed(tok))
    logits = lm_head(h)
    for branch in tree:
        cand.append(logits.topk(branch.width).indices)
        h = eagle(h, embed(cand[-1]))
    return cand
```

## 五、与其他技术对比
相比 Medusa 的并行浅层预测，EAGLE 递归更接近真实自回归，接受率更高但每步需串行草稿前向；二者常以树验证统一。

## 六、常见误区
误区：EAGLE 需要训练新大模型。其实仅训练小的特征预测器，主干冻结，训练成本远低于蒸馏。

## 七、与开源书/权威来源对应
Li et al. 2024 EAGLE: Speculative Sampling Requires Rethinking Feature Uncertainty。见 NVIDIA/TensorRT-LLM、vllm-project/vllm。

## 八、面试题
问：EAGLE 为何用特征而非 logits 做草稿？
答：特征保留更丰富分布信息，下游 LM head 再投影，对多峰分布更鲁棒。

## 九、演进与趋势
EAGLE-2 引入动态树扩展与上下文感知，进一步压缩验证树规模，提升高 γ 下效率。

## 十、小结
EAGLE 以自回归特征递归 + 树验证把投机解码接受率推高，是当前最快自投机方案之一。
