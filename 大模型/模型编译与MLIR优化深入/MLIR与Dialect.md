# MLIR 与 Dialect

> 对应 Lattner et al., *MLIR*, 2021（多级中间表示）。

## 一、背景与挑战

单一 IR 难兼顾高层语义与底层硬件；MLIR 用可扩展 Dialect 分层表达。

## 二、核心原理

从高层（torch/lin alg）经多次 dialect 转换（linalg→affine→LLVM）逐步 lowering；每层做针对性优化（如向量化、循环变换）。

## 三、数学形式

转换即方言间重写规则 $R: \text{Op}_{A}\to \text{Op}_{B}$；保持语义等价、改表示。

## 四、代码实现

```python
pm = PassManager()
pm.add_pass("linalg-fuse-operations")
mod = pm.run(mod)
```

## 五、与其他对比

- 比 TVM 的单一栈更模块化；
- 与 XLA HLO 对照（同为多层 IR）。

## 六、常见误区

- 自定义 dialect 成本被低估；
- lowering 次数多致调试难。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- MLIR 核心思想？答：可扩展多级 dialect 逐层 lowering 与优化。

## 九、演进

LLVM 单 IR → MLIR 多 dialect → 工业广泛采用。

## 十、小结

MLIR 以分层方言兼顾表达力与硬件亲和，是现代编译基石。
