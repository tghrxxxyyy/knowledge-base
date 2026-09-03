# GPU内存层级与Tiling

> 对应 NVIDIA, *CUDA C Programming Guide*, 2023（内存层级）；与 算子融合深入 衔接。

## 一、背景与挑战

寄存器 > 共享内存 > L2 > HBM 带宽逐级骤降，kernel 必须尽量用快内存。

## 二、核心原理

Tiling 把大矩阵分块，使每个块载入共享内存后被复用多次，将 HBM 访问降到 $O(N)$ 而非 $O(N^2)$。

## 三、数学形式

分块 $B\times B$：共享内存复用因子 $r=\frac{2N^2}{2(N/B)^2\cdot B^2}=\frac{N}{B}$；块越小 $r$ 越大但块开销增。

## 四、代码实现

```python
for i in range(0, N, BLOCK):
    tl.load(A[i:i+BLOCK, :])   # 载入共享/TMEM
    acc += tl.dot(As, Bs)
```

## 五、与其他对比

- 与 算子融合深入（融合即减少层级穿越）协同。
- 与 编译部署深入（自动 tile 搜索）衔接。

## 六、常见误区

- 块过大超出共享内存致无法并发 warp。
- 未做边界处理（最后一块不足 BLOCK）。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- Tiling 为何加速？答：分块复用共享内存，把 HBM 访存降到接近线性。

## 九、演进

无 tiling → 静态分块 → 自适应块大小自动搜索。

## 十、小结

Tiling 利用内存层级，是 GEMM 类 kernel 调优的基石。
