# 隐私与PII清洗

> 对应 Carlini et al., *Extracting Training Data*, 2021（记忆泄漏）；GDPR/个人信息保护合规；PII 去除实践。

## 一、背景与挑战

语料含邮箱、电话、住址等 PII；模型可能记忆并泄露，触法。

## 二、核心原理

用正则匹配结构化 PII（邮箱/手机号）、NER 识别姓名/机构，做掩蔽或删除；对高敏感域（医疗/财务）加强。

## 三、数学形式

风险 $\rho(x)=P(\text{extract}(M,x))$；清洗使 $\rho(x)<\epsilon$ 经掩蔽。

## 四、代码实现

```python
import re
doc = re.sub(r"[\\w.]+@[\\w.]+", "[EMAIL]", doc)
```

## 五、与其他对比

- 与 合成数据陷阱与评估深入（合成也可能含 PII）相关。
- 与 数据版权总览（同属合规）衔接。

## 六、常见误区

- 仅正则漏掉非标准格式 PII。
- 掩蔽过宽损正常文本语义。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 如何防 PII 泄露？答：正则+NEM 掩蔽，对敏感域加强并测记忆。

## 九、演进

无处理 → 正则 → NER+记忆测试。

## 十、小结

PII 清洗是隐私合规必需，需多层识别与记忆测试。
