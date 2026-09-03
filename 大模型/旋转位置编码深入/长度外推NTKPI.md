# RoPE长度外推：NTK与PI

> 对应 Chen et al., *NTK-aware interpolation*, 2023；Press et al., *ALiBi*, 2021 对照。

## 一、背景与挑战

训练长度有限，推理需更长；直接外推常因高频溢出失效。

## 二、核心原理

- 位置插值（PI）：把位置索引缩放到训练范围 $[0,L)$ 内。
- NTK-aware 缩放：在频域重标定，保高频细节，优于朴素 PI。

## 三、数学形式

PI：$m' = m \cdot L_{train}/L_{target}$。NTK：把 base 放大为 $base' = base \cdot (L_{target}/L_{train})^{d/(d-2)}$。

## 四、代码实现

```python
base = base * (target_len/train_len) ** (d/(d-2))   # NTK-aware
```

## 五、与其他对比

- PI 简单但对高频不友好；NTK 更保真。
- 与 自回归生成深入（长度外推）互补。

## 六、常见误区

- 仅拉伸位置忽略频率导致高频混乱。
- 外推后仍需少量长文本微调（YaRN 等）。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- 长上下文技术（目录）衔接。

## 八、面试题

- NTK 缩放相对 PI 优势？答：频域重标定保高频，外推更平滑。

## 九、演进

ALiBi 外推 → PI → NTK-aware → YaRN/Dynamic NTK。

## 十、小结

RoPE 外推需在频域重标定，NTK 比朴素插值更保真。
