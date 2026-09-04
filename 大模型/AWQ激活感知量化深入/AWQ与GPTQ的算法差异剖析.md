# AWQ与GPTQ的算法差异剖析

> 对应 Lin 2023 AWQ 与 Frantar 2022 GPTQ 的算法层面比较。

## 一、背景与挑战

AWQ 与 GPTQ 同为 4bit PTQ 主流，但原理迥异。理解差异有助于按场景选型，也方便组合使用。

## 二、核心原理

GPTQ：逐列量化 + 二阶补偿，主动修改权重数值以最小化重建误差。AWQ：保持权重数值不变，仅通过通道缩放把"量化难度"从重要通道转移到不重要通道，量化后仍可反缩放。

## 三、形式化与数学基础

GPTQ 优化：

$ \\min_{\\hat W}\\|WX-\\hat W X\\|_2^2 \\quad \\text{(二阶补偿)} $

AWQ 优化（变换等价）：

$ \\tilde W\\tilde X=WX,\\quad \\tilde W=\\text{diag}(s)W $

两者目标都指向降低 $ \\|WX-\\hat W X\\| $，但路径不同。

## 四、代码实现

```python
def awq_quant(W, X):
    Wt, Xt, s = awq_scale(W, X)
    q, sc, z = grouped_quant(Wt, bits=4)
    return q, sc, z, s          # 推理时先反缩放

def gptq_quant(W, H):
    return gptq_layer(W, H)     # 权重本身已改变
```

## 五、与其他技术对比

- 精度：多数 4bit 任务二者接近，部分任务各擅胜场。
- 速度：AWQ 反量化与 GPTQ 相当，均依赖专用 kernel。
- 组合：可先 AWQ 缩放再 GPTQ 量化，进一步压误差。

## 六、常见误区

- 认为二者互斥；实则常叠加。
- 用同一校准集数量比较时忽略搜索/补偿差异。

## 七、与开源书/权威来源对应

- Lin et al. 2023, AWQ.
- Frantar et al. 2022, GPTQ.
- ggerganov/llama.cpp: https://github.com/ggerganov/llama.cpp

## 八、面试题

- 从信息论角度，AWQ 与 GPTQ 各解决什么？
- 能否把 AWQ 缩放后再跑 GPTQ？
- 哪个更适合端侧固定 kernel？

## 九、演进与趋势

两派方法在工具链层面趋同（统一量化格式 + 融合 kernel）。

## 十、小结

AWQ 与 GPTQ 是"缩放保护"与"补偿重建"两条路线，理解本质即可灵活组合。
