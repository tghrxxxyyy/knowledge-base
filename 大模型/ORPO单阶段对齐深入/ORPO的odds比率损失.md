# ORPO的odds比率损失

> 对应 Hong 2024 ORPO 与 Rafailov 2023 DPO。

## 一、背景与挑战
ORPO 的关键在于 odds ratio 项如何表达偏好，理解其形式与 DPO 的差异。

## 二、核心原理
对所选回答的 odds $\frac{\pi(y_w)}{\pi(\neg y_w)}$ 与拒答 odds 取比，用 sigmoid 把"所选相对更优"转化为可优化目标。

## 三、形式化与数学基础
odds ratio 项：
$\mathcal{L}_{OR}=-\log\sigma(\log\frac{\pi_\theta(y_w|x)}{1-\pi_\theta(y_w|x)}-\log\frac{\pi_\theta(y_l|x)}{1-\pi_\theta(y_l|x)})$
等价于隐式偏好间隔。

## 四、代码实现
# odds ratio 项
def odds_ratio_term(lp_c, lp_r):
    log_odds_c = lp_c - torch.log1p(-torch.exp(lp_c))
    log_odds_r = lp_r - torch.log1p(-torch.exp(lp_r))
    return -F.logsigmoid(log_odds_c - log_odds_r).mean()

## 五、与其他技术对比
DPO 直接用 log-ratio 差；ORPO 用 odds 比更强调相对可能性，与 SFT 项天然兼容。

## 六、常见误区
$\pi$ 取值超出 (0,1) 致 log1p 数值异常；未与 NLL 联合致语言退化。

## 七、与开源书/权威来源对应
Hong 2024 推导 odds ratio；huggingface/trl ORPOTrainer 实现。

## 八、面试题
问：odds ratio 与 log-ratio 区别？答：前者对概率做 odds 变换再比，对低概率区更敏感。

## 九、演进与趋势
稳定化 odds 计算、与 SimPO 融合。

## 十、小结
odds ratio 项是 ORPO 偏好信号核心，与 SFT 联合实现单阶段对齐。
