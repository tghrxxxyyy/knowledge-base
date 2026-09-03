# QAT与PTQ对比

> 对应量化方法横评。

## 一、背景与挑战

选型需权衡精度、成本、上线速度。

## 二、核心原理

PTQ：训后直接量化（需校准），便宜但有损。QAT：再训练模拟量化，精度高但贵。

## 三、数学形式

精度损失 $\Delta_{PTQ}>\Delta_{QAT}$（同低位）；成本 $C_{QAT}\gg C_{PTQ}$。

## 四、代码实现

```python
# PTQ
quantize(model, calib_loader)        # 仅校准
# QAT
model.qconfig = get_qat_qconfig()
quantize_qat_prepare(model); train(model); convert(model)
```

## 五、与其他对比

- 与 模型量化部署实战（PTQ）/ QLoRA（量化训练）共同构成量化谱系。
- 与 边缘端侧推理深入 衔接（端侧低位）。

## 六、常见误区

- 小模型低位直接 PTQ 掉点严重，应 QAT。
- 以为 QAT 一定值得；大资源消耗需权衡。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 何时选 QAT 而非 PTQ？答：低位(<=4bit)或对精度敏感、有训练预算时。

## 九、演进

PTQ 主导 → QAT 补低位 → 二者混合流程。

## 十、小结

QAT 与 PTQ 互补，按精度/成本权衡选择。
