# INT8与量化推理

> 对应 GPTQ（Frantar et al., 2022）、AWQ（Lin et al., 2023）等权重量化；INT8 推理。

## 一、背景与挑战

权重占显存大头，FP16 下大模型难装进单卡；INT8/INT4 量化可显著省显存与带宽。

## 二、核心原理

INT8 线性量化 $w_q=\text{round}(w/s)+z$，推理反量化为 $w\approx s(w_q-z)$；权重量化（W8A8/W4A16）为主，激活可同步量化。

## 三、数学形式

量化 $q=\text{clip}(\lfloor w/s\rceil + z, -128,127)$；反量化 $\hat w=s(q-z)$；误差 $\|\hat w-w\|$。

## 四、代码实现

```python
w_q = quantize(w, bits=8)      # 如 GPTQ/AWQ
y = dequant(w_q) @ x
```

## 五、与其他对比

- 与 FP16/BF16 相比更省显存但引入误差。
- 与 权重内存分页与卸载深入：量化减少需搬运的字节。

## 六、常见误区

- 对称/非对称量化选错致偏差。
- 忽视激活异常值（outlier）破坏低比特。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 为何权重量化易、激活难？答：权重分布稳可离线标定，激活含 outlier 时变难量化。

## 九、演进

FP16 → INT8 → INT4/NF4 → INT2(探索)。

## 十、小结

INT8/INT4 量化以可控误差换显存与带宽，是部署大模型关键。
