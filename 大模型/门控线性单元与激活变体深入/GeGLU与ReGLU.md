# GeGLU与ReGLU

> 对应 Shazeer, *GLU Variants Improve Transformer*, 2020（同时给出 GeGLU、ReGLU 等门控变体）。

## 一、背景与挑战

除 Swish 门外，GELU 与 ReLU 也可作门函数；需理解不同门对表达与训练速度的影响。

## 二、核心原理

GeGLU 用 GELU 作门：$\text{GeGLU}(x)=(\text{GELU}(xW))\odot(xV)$；ReGLU 用 ReLU 门：$\text{ReGLU}(x)=(\text{ReLU}(xW))\odot(xV)$。

## 三、数学形式

$\text{GELU}(x)\approx 0.5x(1+\tanh(\sqrt{2/\pi}(x+0.044715x^3)))$，与 SwiGLU 门函数形态接近但无参数 $\beta$。

## 四、代码实现

```python
def geglu(x, w1, w2, w3):
    a = F.gelu(x @ w1) * (x @ w2)
    return a @ w3
```

## 五、与其他对比

- SwiGLU 与 GeGLU 性能接近，SwiGLU 略优且无需近似 GELU；ReGLU 最快但表达略弱。
- 三者都属 GLU 族，仅在门函数上不同。

## 六、常见误区

- 认为 GELU 与 Swish 等价；Swish 可学习 $\beta$ 更灵活，GELU 为固定形态。
- 混用门函数与激活函数：门控 FFN 中门是乘法门而非最终激活。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- GeGLU 与 SwiGLU 差异？答：门函数分别为 GELU 与 Swish，SwiGLU 通常略优且可微更平滑。

## 九、演进

GLU → ReGLU/GeGLU/SwiGLU（同族并行）→ 现代 LLM 收敛到 SwiGLU。

## 十、小结

GeGLU/ReGLU 是 GLU 族重要成员，SwiGLU 综合表现最佳成为主流。
