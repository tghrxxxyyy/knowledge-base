# 方法JIT与轨迹JIT

> 对应 Kennedy & Allen 与 CS-Notes（V8/PyPy 风格）。

## 一、背景与挑战
方法 JIT 以整个方法为编译单位；轨迹 JIT 以"热执行路径（含循环内类型特化）"为单位。挑战：方法 JIT 难对分支内类型特化，轨迹 JIT 需处理副作用/去优化。

## 二、核心原理
方法 JIT：整法编译，通用但保守。轨迹 JIT（如 tracing JIT / PyPy / 早期 V8）：记录热路径的类型与分支，专为该路径生成特化机器码，离开路径则去优化。

## 三、形式化 / 数学基础
轨迹 $T$ = 入口 + 顺序指令 + 守卫 (guard) 条件。执行：`guard(type(x)==Int)` 成立则沿快路径；否则跳解释/去优化。路径收益正比于命中率。

## 四、代码实现
```python
def trace_loop(body):
    while hot(body):
        guard(type(x) is Int)     # 特化守卫
        x = x + 1                 # 快路径整数加
        if not guard_ok: deopt()  # 守卫失败回退
```

## 五、与其他技术对比
- 方法 JIT：单位大、稳健、易去优化。
- 轨迹 JIT：特化强、快但守卫失败回退成本高、实现复杂。
- 二者常结合（V8 曾用 tracing，现用 TurboFan 方法+类型反馈）。

## 六、常见误区
1. 以为轨迹 JIT 无去优化成本（守卫失败昂贵）。
2. 把方法 JIT 当总优于解释（冷方法浪费）。
3. 守卫覆盖不全致错误快路径。

## 七、与开源书 / 权威来源对应
- Kennedy & Allen《Optimizing Compilers for Modern Architectures》
- CS-Notes: https://github.com/CyC2018/CS-Notes （V8 编译流水线）
- Crafting Interpreters: https://github.com/munificent/craftinginterpreters

## 八、面试题
- 方法 JIT 与轨迹 JIT 区别？
- 什么是守卫 (guard)？失败时怎么办？
- 为什么 V8 转向方法+类型反馈？

## 九、演进与趋势
类型反馈 (type feedback) 方法 JIT、轨迹与分层融合、以及推测优化 (speculative)。

## 十、小结
方法 JIT 与轨迹 JIT 是两种编译粒度：前者稳健、后者靠特化换峰值；现代引擎以类型反馈的方法 JIT 为主流。
