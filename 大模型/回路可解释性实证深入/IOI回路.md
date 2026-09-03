# IOI回路（间接宾语识别）

> 对应 Wang et al., *Interpretability in the Wild: a Circuit for Indirect Object Identification*, 2022。

## 一、背景与挑战

模型如何区分"谁收到东西"（间接宾语）？IOI 任务给出清晰可定位的回路。

## 二、核心原理

在 "John gave Mary the" 续写 "book" 的设定中，模型经：复制头（把 names 搬入） + 归纳/之前 name 头（标记重复 name） + 抑制头（抑制重复 name） 共同选出未重复的 name 作间接宾语。

## 三、数学形式

IOI 分数 $s = \text{logit}(o_{IO}) - \text{logit}(o_{S})$；回路节点消融改变该差，量化因果贡献。

## 四、代码实现

```python
def ioi_score(logits, io, s):
    return logits[io] - logits[s]
for n in ioi_nodes:
    print(n, circuit_effect(model, n, ioi_score))
```

## 五、与其他对比

- 与 因果干预与激活修补深入 衔接（经典修补案例）。
- 与 注意力模式类型学深入 共享头分类。

## 六、常见误区

- 以为单个"抑制头"独立完成任务；需多类头协作。
- 跨模型 IOI 节点位置不同。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- IOI 回路意义？答：首个在真实模型定位完整因果回路的案例，证明机制可解释性可行。

## 九、演进

任务设计 → 节点归因 → 完整回路与跨模型复现。

## 十、小结

IOI 回路是机制可解释性的标杆，展示可定位、可验证的因果子图。
