# 检索器与 LLM 对齐

> 对应 检索器对齐生成器偏好（如 LLM 反馈训检索器）；与 直接偏好优化深入 衔接。

## 一、背景与挑战

检索器优化的相关性不等于 LLM 生成所需；需以 LLM 反馈对齐检索器。

## 二、核心原理

用 LLM 对 (q,检索文档,答案) 评分，把高分文档作正例训检索器；或把检索器当策略用偏好损失（类 DPO）对齐。

## 三、数学形式

对齐损失 $\mathcal L=-\log\sigma(\beta(\log\frac{\pi(d^+|q)}{\pi_{ref}(d^+|q)}-\log\frac{\pi(d^-|q)}{\pi_{ref}(d^-|q)}))$。

## 四、代码实现

```python
pref = llm_score(q, docs)            # LLM 反馈
ret = dpo_train(ret, pref)          # 类偏好对齐
```

## 五、与其他对比

- 与 直接偏好优化深入（同偏好框架）对照。
- 与 检索器与生成联合 共享对齐目标。

## 六、常见误区

- LLM 反馈有偏（长度/风格）污染检索。
- 检索器过拟合 LLM 偏好失通用性。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- 为何对齐 LLM？答：检索相关不等于生成所需，LLM 反馈使检索服务于答案质量。

## 九、演进

相关性训练 → LLM 反馈 → 偏好对齐检索器。

## 十、小结

检索器与 LLM 对齐让召回贴近生成需求，是 RAG 质量关键。
