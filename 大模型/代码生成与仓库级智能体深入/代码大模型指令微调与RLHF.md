# 代码大模型指令微调与RLHF

> 对应 Ouyang 2022 的 InstructGPT 论文与 github huggingface/trl 项目。

## 一、背景与挑战
基础代码模型擅长续写但不懂用户意图。需要把「写单测」「解释报错」等指令对齐，并抑制不安全或低质量输出，这就需要监督微调与基于人类反馈的强化学习。

## 二、核心原理
先用高质量 (指令, 期望代码) 对做 SFT，再用奖励模型学习人类偏好，最后以 PPO 优化策略使生成更符合需求。trl 库把这一流程模块化。

## 三、形式化与数学基础
PPO 目标：
$ \max_{\pi_\theta} \mathbb{E}[\,r(x,y)-\beta\,\mathrm{KL}(\pi_\theta(y|x)\\|\pi_{\text{ref}}(y|x))\,] $
其中 $ r $ 为奖励模型打分，$ \beta $ 控制偏离参考策略程度。

## 四、代码实现
```python
def ppo_loss(logp, logp_ref, reward, beta=0.1):
    # logp, logp_ref: (T,) ; reward: scalar
    kl = logp - logp_ref
    return -(reward - beta * kl).mean()

def train_step(model, ref, batch, beta=0.1):
    logp = model.logp(batch)
    logp_ref = ref.logp(batch)
    loss = ppo_loss(logp, logp_ref, batch.reward, beta)
    loss.backward()
    return loss
```

## 五、与其他技术对比
SFT 快速对齐格式但易过拟合示范分布；RLHF 能捕捉细微偏好但训练不稳定。DPO 等离线方法省去独立奖励模型。

## 六、常见误区
奖励黑客：模型钻奖励模型空子生成看似正确实则无效的代码。KL 系数过大则退化为参考策略。

## 七、与开源书/权威来源对应
- Ouyang 2022 InstructGPT / RLHF
- github huggingface/trl 的 PPOTrainer
- Schulman 2017 PPO 原论文

## 八、面试题
问：为什么 RLHF 要加 KL 惩罚？答：防止策略偏离参考模型太远导致语言崩坏与奖励黑客。

## 九、演进与趋势
DPO、GRPO、SimPO 等偏好优化逐步替代 PPO 的复杂管线。

## 十、小结
指令微调加偏好对齐是把代码基模变成可用助手的关键两步。
