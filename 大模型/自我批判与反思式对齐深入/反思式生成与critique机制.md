# 反思式生成与critique机制

> 对应 Yao 2022 ReAct 与 Shinn 2023 Reflexion。

## 一、背景与挑战
复杂任务需模型对中间结果反思，避免一条路走到黑。

## 二、核心原理
Reflexion 类方法把环境反馈/自我批评写入记忆，下一轮推理参考，形成"尝试-反思-再尝试"。

## 三、形式化与数学基础
策略更新在上下文而非参数：
$M_{t+1}=M_t\cup\{(x,y_t,\text{feedback}_t)\}$
$\pi_{t+1}=\text{policy}(M_{t+1})$

## 四、代码实现
# 反思记忆
memory = []
def act(x):
    y = model(x + "\n记忆:" + str(memory))
    fb = critique(x, y)
    memory.append((x, y, fb))
    return y if fb.ok else act(x)

## 五、与其他技术对比
与 RL 参数更新不同，反思是上下文学习式改进，可解释且即时。

## 六、常见误区
记忆无限增长致上下文溢出；反馈噪声未被过滤。

## 七、与开源书/权威来源对应
Shinn 2023 Reflexion；Yao 2022 ReAct；run-llama/llama_index 支持反思检索。

## 八、面试题
问：反思式与 RLHF 区别？答：反思不改权重、靠上下文记忆，RLHF 改参数。

## 九、演进与趋势
长程记忆压缩、自动反馈生成。

## 十、小结
反思机制以记忆驱动迭代，适合需试错的复杂任务。
