# ORPO实现细节与数值稳定

> 对应 Hong 2024 ORPO 与 pytorch/pytorch。

## 一、背景与挑战
odds 计算涉及 $1-\pi$ 与对数，需防数值问题。

## 二、核心原理
用 logits 直接算 log-odds 避免先取概率再 log 的精度损失；对拒答与所选共享前向。

## 三、形式化与数学基础
以 logit $z$ 表示，$\pi=\sigma(z)$，log-odds 为 $z$，可省去概率变换：
$\log\text{odds}(y)=\log\pi_\theta(y)-\log(1-\pi_\theta(y))$

## 四、代码实现
# 稳定 log-odds
def log_odds_from_logits(logits, target_id):
    logp = F.log_softmax(logits, dim=-1)
    lp_target = logp.gather(-1, target_id)
    return lp_target - torch.log1p(-torch.exp(lp_target))

## 五、与其他技术对比
DPO 也需稳 logp；ORPO 额外要求 NLL 与 OR 项梯度平衡。

## 六、常见误区
单独 softmax 后再 log1p 致下溢；$\lambda$ 在不同 batch 未归一。

## 七、与开源书/权威来源对应
Hong 2024 给出实现要点；pytorch/pytorch 提供 log_softmax 稳定接口。

## 八、面试题
问：为何用 log_softmax 而非 softmax+log？答：避免 exp 下溢与 log(0)，数值更稳。

## 九、演进与趋势
混合精度下专门 kernel 加速。

## 十、小结
数值稳定靠 log-space 计算与梯度平衡，是 ORPO 落地要点。
