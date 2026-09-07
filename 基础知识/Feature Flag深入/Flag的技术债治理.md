# Flag的技术债治理

> 对应 Martin《Clean Code》。

## 一、背景与挑战
随着迭代推进，Flag 数量增长，代码中 if/else 分支交织，测试矩阵膨胀，新人难以理解逻辑，形成系统性技术债。

## 二、核心原理
治理手段包括：Flag 清单与负责人、存续时限、定期审计、自动化清理提醒，以及用策略表替代散落分支。

## 三、形式化与数学基础
设代码分支数随 Flag 数 n 呈 O(2^n) 组合。治理目标为把有效 n（未下线临时 Flag）压到最小，使组合可控。

## 四、代码实现
```python
# 用集中策略表替代散落 if
STRATEGY = {
    "new-checkout": new_checkout,
    "old-checkout": old_checkout,
}
fn = STRATEGY[flags.active("checkout-mode")]
return fn(user)
```

## 五、与其他技术对比
相比放任增长，集中治理降低认知负荷；相比彻底删除，保留少量永久开关（如降级）可接受但需文档化。

## 六、常见误区
- 用 Flag 做本该由配置或权限解决的 permanent 分支。
- 缺乏 owner，无人负责下线。

## 七、与开源书/权威来源对应
《Clean Code》主张用清晰结构与最小分支表达意图。

## 八、面试题
如何度量 Flag 技术债？何时该把 Flag 固化为代码路径？

## 九、演进与趋势
静态分析扫描死 Flag 分支并自动提 PR，使治理可执行。

## 十、小结
Flag 技术债来自只增不删，治理的关键是 owner、时限与自动化清理。
