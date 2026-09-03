# SSD与Mamba1对比

> 综合 Gu & Dao 2023 与 Dao & Gu 2024；比较选择性 SSM 的两种计算形态。

## 一、背景与挑战

同一选择性 SSM 思想，Mamba1 用扫描、Mamba2 用 SSD；需理解取舍以选用/实现。

## 二、核心原理

Mamba1：递归/扫描为主，状态维小。Mamba2/SSD：重写为半可分矩阵多头形式，状态维大、复用注意力式内核、吞吐更高。

## 三、数学形式

Mamba1 每步 $x_k=\bar A_k x_{k-1}+\bar B_k u_k$；SSD 等价但聚合成 $Y=(L\odot M)V$ 分块矩阵乘。

## 四、代码实现

```python
y1 = mamba1_scan(u, A, B, C, dt)     # 递归/扫描
y2 = ssd_forward(u, A, B, C, dt, B)   # 分块半可分
```

## 五、与其他对比

- 数学等价、工程不同：SSD 更利张量核与大规模训练。
- 与 选择性状态空间模型深入 中 Mamba1 篇互为补充。

## 六、常见误区

- 以为二者模型能力不同；差异在速度与扩展性，不在表达（同选择性 SSM）。
- 在小模型上盲目用 SSD 复杂实现，收益有限。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- SSD 与 Mamba1 关系？答：同一选择性 SSM 的两种计算视图，SSD 更高效的工程重述。

## 九、演进

Mamba1 扫描 → SSD 半可分 → 统一于注意力对偶框架。

## 十、小结

SSD 是 Mamba1 的高效重述，选型看规模与硬件而非表达差异。
