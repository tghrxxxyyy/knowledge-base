# Profile-Guided优化原理

> 对应 《CSAPP》编译器优化章节 / GCC/LLVM PGO 文档。

## 一、背景与挑战
静态编译器难以猜出运行时分支概率与热点路径，常保守布局。PGO 用真实运行的 profile 指导内联、分支权重、代码布局与寄存器分配。

## 二、核心原理
两阶段：先插桩或采样构建二进制，跑代表性负载得 profile；再用 profile 重编译，把热分支按大概率方向布局、热函数放同一代码页、冷路径移出主路径。

## 三、形式化与数学基础
分支权重 $\hat w_i$ 来自计数；布局后期望跳转距离：
$$ E[D] = \sum_i p_i \cdot d_i $$
PGO 最小化 $E[D]$ 与误预测，同时提升 I-cache 与 TLB 命中。

## 四、代码实现
```bash
# GCC PGO 三步流程
gcc -O2 -fprofile-generate -o app app.c   # 1 插桩编译
./app  # 跑代表性负载，生成 *.gcda
gcc -O2 -fprofile-use -o app app.c         # 2 用 profile 重编
```

## 五、与其他技术对比
PGO 依赖真实负载，比单纯 -O3 更精准；LTO 跨模块优化与 PGO 正交可叠加。与手工无分支优化互补。

## 六、常见误区
用非代表性负载训练导致错配(profile 失真)。忽略每次改代码需重训。误以为 PGO 能优化数据依赖型随机分支。

## 七、与开源书/权威来源对应
《CSAPP》优化章节；GCC/LLVM 官方 PGO 文档；AutoFDO 用 perf 采样替代插桩。

## 八、面试题
PGO 两阶段是什么？为何需要代表性负载？PGO 与 LTO 区别？

## 九、演进与趋势
AutoFDO/bolt 基于采样低开销；机器学习驱动启发式；持续 PGO(运行时反馈)。

## 十、小结
PGO 用真实运行画像纠正编译器假设，优化分支布局与内联，是发布构建的标配。
