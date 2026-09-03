# tile划分与软件流水

> 对应 Triton 的 tile + pipelining 编译策略。

## 一、背景与挑战

要掩盖显存延迟、打满 SM，需合理分块与异步流水。

## 二、核心原理

Triton 用 `tl.load`/`tl.store` 的 mask 处理越界，配合 `num_stages` 多缓冲流水：计算当前 tile 同时预取下个 tile，隐藏 HBM 延迟。

## 三、数学形式

流水深度 $S$ 时有效延迟 $\approx \max(t_{compute}, t_{load}/S)$ 近似掩盖。

## 四、代码实现

```python
for b in range(0, n, BLOCK):
    x = tl.load(ptr+b, mask=off<BLOCK)
    tl.store(out+b, f(x))
```

## 五、与其他对比

- 与 张量核心与混合精度推理深入：tile 对齐 TC 块提占用。
- 与 推理延迟剖析与火焰图深入：可定位 tile 低效。

## 六、常见误区

- mask 缺失致越界读取脏数据。
- 过多 stages 致寄存器/共享内存溢出。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 流水如何提效？答：计算与预取重叠，隐藏 HBM 延迟，提升占用。

## 九、演进

单缓冲 → 多 stage 流水 → 异步拷贝。

## 十、小结

tile 划分与流水是 Triton 性能来源，mask 与 stages 需精细设置。
