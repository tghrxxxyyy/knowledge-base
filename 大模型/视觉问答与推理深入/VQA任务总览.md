# 视觉问答（VQA）任务总览

> 对应 Antol et al., *VQA*, ICCV 2015；Goyal et al., *VQA v2*（平衡偏见）。

## 一、背景与挑战

VQA 要求模型看图并回答自然语言问题，需联合视觉理解与语言理解，且易学到语言偏见（如“香蕉”常答“黄色”）。

## 二、核心原理

经典流程：图像编码器提特征，问题编码器（LSTM/Transformer）编码，融合后分类答案（或生成）。VQA v2 通过平衡答案分布削弱语言先验偏见。

## 三、数学形式

答案分布：

$$p(a|I,q)=\text{Softmax}(f_\theta(I,q))$$

$f_\theta$ 为融合网络。

## 四、代码实现

```python
v = vision_encoder(I)
q = text_encoder(question)
logits = head(v * q)             # 简单融合
```

## 五、与其他对比

- 与 视觉推理方法 衔接（推理型 VQA）。
- 与 多模态对话 对照多轮形态。

## 六、常见误区

- 仅用语言偏见即可刷分（VQA v1），需用平衡数据集。
- 把 VQA 当分类忽视开放答案生成。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- VQA 偏见是什么？答：训练里问题与答案强相关，模型可不看图标就答对，需平衡数据集缓解。

## 九、演进

VQA v1 → v2 平衡 → GQA 组合推理。

## 十、小结

VQA 是视觉语言联合理解的经典任务，语言偏见是核心评测陷阱。
