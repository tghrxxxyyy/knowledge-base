# Triton总览

> 对应 OpenAI Triton（Tillet et al., 2019）；用于 LLM 自定义高性能内核。

## 一、背景与挑战

手写 CUDA 门槛高、难维护；Triton 用类 Python 的块级编程自动生成高效 GPU 代码，降低内核开发成本。

## 二、核心原理

Triton 以 tile 为基本单位，程序员描述块上计算，编译器负责内存合并、共享内存、流水线等；常用于 fused softmax、layernorm、量化 GEMM。

## 三、数学形式

把张量按块划分 $X=\bigcup_{i} X_i$，每块映射到一 program；编译器生成访存/同步指令。

## 四、代码实现

```python
@triton.jit
def vec(src, dst, n, BLOCK: tl.constexpr):
    i = tl.program_id(0)*BLOCK + tl.arange(0, BLOCK)
    dst[i] = src[i] * 2
```

## 五、与其他对比

- 与 CUDA 手写相比开发快，峰值常略低。
- 与 张量核心与混合精度推理深入：Triton 可发射 TC 指令。

## 六、常见误区

- 误以为 Triton 总比 CUDA 快（峰值可能略逊）。
- 忽视 tile 大小对合并访存的影响。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- Triton 为何易写？答：块级抽象，编译器管访存/共享内存/同步。

## 九、演进

手写 CUDA → Triton DSL → 自动内核生成。

## 十、小结

Triton 以块级 DSL 平衡开发效率与性能，适合推理融合内核。
