# StruQ 与结构化分隔

> 对应 Chen et al., *StruQ*, 2024；Wallace et al., 2024。

## 一、背景与挑战

普通拼接提示难区分来源，结构化分隔可让模型学边界。

## 二、核心原理

StruQ 用特殊分隔符显式标系统/用户/工具段，训练数据注入对抗，使模型按边界而非内容顺位决策。

## 三、数学形式

输入编码 $E([SEP_{sys} s][SEP_{usr} u][SEP_{tool} t])$，边界 token 控制注意力路由。

## 四、代码实现

```python
inp = sep_sys + sys + sep_usr + usr + sep_tool + tool
```

## 五、与其他对比

- 与系统提示保护共享边界训练。
- 与指令层级总览共享层级。

## 六、常见误区

- 分隔符可被发现并伪造。
- 仅在推理加分隔不训练无效。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- StruQ 核心？答：特殊分隔符标来源+对抗训练，使模型按边界决策。

## 九、演进

拼接 → 分隔符 → 对抗分隔。

## 十、小结

结构化分隔把层级变成可学习的边界。
