# Feature Flag的分类

> 对应 Fowler 2002/2003 (Patterns of Enterprise Application Architecture)。

## 一、背景与挑战
同一份代码需要同时支持"已发布功能"与"进行中实验"，硬编码开关散落各处难以治理，需要系统化的分类视角。

## 二、核心原理
按生命周期与用途把 Flag 分为：发布类（控制新功能可见性）、实验类（A/B 测试）、运维类（限流降级开关）、权限类（租户/内测）。不同类别有不同存续时长。

## 三、形式化与数学基础
Flag f 具属性 (type, ttl, scope)。求值返回 bool 决定是否走新路径。集合 F 中临时类应随迭代清零，永久类需进文档。

## 四、代码实现
```python
if flags.is_on("new-checkout", user_id=user.id):
    return new_checkout(user)   # 发布类：逐步放开
else:
    return old_checkout(user)
```

## 五、与其他技术对比
相比配置项，Flag 更强调运行时动态与多维度判定；相比灰度部署，它作用于功能路径而非实例版本。

## 六、常见误区
- 所有开关都设为永久，积累技术债。
- 实验类与发布类混用，下线时误伤仍在运行的实验。

## 七、与开源书/权威来源对应
Fowler PoEAA 讨论用配置与策略分离行为；Martin《Clean Code》提醒条件分支需有清晰归属。

## 八、面试题
发布类与实验类 Flag 的差异？为什么临时 Flag 必须设消亡时间？

## 九、演进与趋势
Flag 与可观测、实验平台打通，形成渐进式交付的统一控制面。

## 十、小结
按类别管理 Flag 是避免开关失控的前提，临时类必须配套清理机制。
