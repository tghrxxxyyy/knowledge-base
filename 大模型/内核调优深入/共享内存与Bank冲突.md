# 共享内存与Bank冲突

> 对应 NVIDIA, *CUDA Best Practices Guide*（shared memory bank）；与 内核调优深入 衔接。

## 一、背景与挑战

共享内存分 32 个 bank，多线程同时访问同一 bank 的不同地址会串行化（bank conflict）。

## 二、核心原理

通过 padding（如列数 +1）错位映射，使相邻线程访问不同 bank；或用向量化加载避免窄访问。

## 三、数学形式

无冲突带宽 $BW_{32}=32\times BW_{bank}$；若 $k$ 线程冲突则降为 $BW_{32}/k$。加 pad 使 $\text{col}'=\text{col}+1$ 错开 bank 索引。

## 四、代码实现

```python
smat = cuda.shared.array((BLOCK, BLOCK+1), dtype)  # +1 消除 bank 冲突
```

## 五、与其他对比

- 与 GPU内存层级与Tiling（同为共享内存使用）互补。
- 与 算子融合深入（融合 kernel 更依赖共享内存）相关。

## 六、常见误区

- 误以为 bank conflict 只发生在写，读同样会冲突。
- padding 不当反而浪费共享内存配额。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 如何消除 bank conflict？答：通过 padding 错位或广播（同地址读不冲突）使线程分布到不同 bank。

## 九、演进

无 pad → 手动 padding → 编译器自动 bank 优化。

## 十、小结

Bank 冲突是共享内存隐藏陷阱，用 padding/向量化即可显著提速。
