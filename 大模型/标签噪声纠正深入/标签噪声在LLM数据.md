# 标签噪声在 LLM 数据

> 对应 指令数据质量与对齐数据噪声研究（如 LIMA、RLAIF 偏好噪声）。

## 一、背景与挑战

指令 SFT 与偏好数据（含 AI 生成）常含错标/低质；直接影响对齐质量。

## 二、核心原理

用奖励模型或强模型筛偏好对（去掉矛盾/低质）；用困惑度/多样性过滤 SFT；置信学习清错标。

## 三、数学形式

偏好一致性 $c = \mathbf 1[ r(y_w) > r(y_l) ]$；低一致样本更可能为噪声，降权或剔除。

## 四、代码实现

```python
mask = (rm(chosen) > rm(rejected))     # 一致性过滤
keep = mask & (perplexity < thr)
```

## 五、与其他对比

- 与 合成数据质量评估深入（都做质量过滤）共享。
- 与 直接偏好优化深入（偏好对质量）衔接。

## 六、常见误区

- 用同一模型筛其训练数据致自证偏差。
- 过度过滤丢多样样本。

## 七、与开源书对应

- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- LLM 偏好数据噪声如何处？答：用奖励模型/强模型测一致性，去矛盾对，必要时重标。

## 九、演进

人工审核 → 模型过滤 → 主动学习补标。

## 十、小结

LLM 数据噪声须结合模型过滤与一致性校验，偏好数据尤甚。
