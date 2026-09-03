# Bradley-Terry 可辨识性

> 对应 Bradley & Terry, 1952；在偏好学习语境下见 Christiano et al., *Deep RL from Human Preferences*, NeurIPS 2017 与 Azar et al., AISTATS 2024。

## 一、背景与挑战

BT 模型把成对偏好概率写成奖励差的 sigmoid。但「能写出来」不等于「能唯一学出来」：奖励在什么意义下可辨识？需要多少比较、什么样的比较图结构？如果人类偏好本身不满足 BT（存在循环偏好、上下文相关），拟合出来的奖励意味着什么？这些直接决定了偏好优化的上限。

## 二、核心原理

三点关键。其一，尺度不可辨识：给同一 prompt 下所有回答的奖励加同一常数，偏好概率不变，故奖励只在「同 prompt 内、差值意义上」可辨识。其二，图连通性：把回答当节点、比较当边，若比较图不连通，跨连通分量的相对奖励无法确定；若某分量内全是一致胜负（完全分离），最大似然解会发散到无穷。其三，模型错配：真实偏好若非传递（出现 A>B>C>A），BT 只能拟合一个「最优传递近似」，残差是不可消除的系统误差。

## 三、数学形式

BT 假设 $P(y_w\succ y_l|x)=\sigma\big(r(x,y_w)-r(x,y_l)\big)$，对应负对数似然

$$\mathcal L_{BT}=-\mathbb E_{(x,y_w,y_l)}\big[\log\sigma\big(r(x,y_w)-r(x,y_l)\big)\big]$$

平移不变性：$r'=r+c(x)$ 给出同一似然，故 $r$ 只在差分意义可辨识。当某 $x$ 下比较完全可分时 $\|r\|\to\infty$ 使似然单调下降，需正则或有界损失（见 IPO）约束。

## 四、代码实现

```python
import torch, torch.nn.functional as F

def bt_nll(reward_w, reward_l):
    return -F.logsigmoid(reward_w - reward_l).mean()

def check_pairwise_consistency(pairs):
    # 检测偏好是否存在非传递环（BT 模型错配的直接证据）
    import itertools
    win = {}
    for w, l in pairs:
        win.setdefault(w, set()).add(l)
    for a, b, c in itertools.permutations(set(win) , 3):
        if b in win.get(a, ()) and c in win.get(b, ()) and a in win.get(c, ()):
            return False, (a, b, c)
    return True, None
```

## 五、与其他对比

- 与 奖励模型深入：显式 RM 训练就是在拟合 BT 似然，本节的可辨识性限制同样适用。
- 与 直接偏好优化深入：DPO 继承 BT 假设，因此也继承其错配风险。
- 与 KTO：KTO 换成单点效用，部分绕开了 BT 的传递性假设。

## 六、常见误区

- 用不同 prompt 之间的奖励绝对值做比较或阈值判断，忽略平移不可辨识。
- 认为标注一致率高就说明 BT 成立。高一致率只说明噪声小，不排除偏好的上下文依赖与非传递。
- 在完全可分的偏好集上追求更低的 BT 损失，实际是在鼓励参数发散。

## 七、与开源书对应

- d2l-zh（最大似然、逻辑回归与可辨识性直觉）：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course（偏好数据与奖励建模）：https://github.com/mlabonne/llm-course

## 八、面试题

- BT 奖励为何只能差分辨识？答：奖励整体平移不改变 sigmoid 的差值输入，似然完全相同。
- 比较图不连通会怎样？答：跨分量的相对奖励无约束，模型可任意安排，导致跨分量排序不可靠。

## 九、演进

BT 成对模型 → 带正则/有界损失的偏好拟合 → 非传递与上下文相关偏好的更一般模型 → 单点效用与分布式偏好建模。

## 十、小结

可辨识性告诉我们偏好学习能问出什么、问不出什么：差分可学、绝对不可学；连通可比、孤立不可比；传递可拟合、循环只能近似。
