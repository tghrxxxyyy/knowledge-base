# RBAC与ABAC授权模型

> 对应 NIST RBAC (Ferraiolo & Kuhn) / OWASP Authorization。

## 一、背景与挑战
授权需可管理：直接把权限绑用户随组织膨胀失控。RBAC 用角色中介，ABAC 用属性策略表达更细粒度。

## 二、核心原理
RBAC：用户→角色→权限，含角色继承与约束(职责分离)。ABAC：基于主体/资源/动作/环境属性经策略(PDP)判定，适合动态上下文(时间、位置、风险)。

## 三、形式化与数学基础
RBAC 授权判定：
$$ (u,r) \in UA \land (r,p) \in PA \Rightarrow u \text{ 可 } p $$
ABAC 策略函数：
$$ Decision = f(S_{attr}, R_{attr}, A, E_{attr}) \in \{Permit,Deny\} $$

## 四、代码实现
```python
# 简易 RBAC 检查
roles_perms = {"admin":{"read","write","delete"}, "user":{"read"}}
user_role = {"alice":"admin","bob":"user"}
def can(user, perm):
    return perm in roles_perms[user_role[user]]
# ABAC: 附加环境
def can_abac(user, perm, hour):
    return can(user, perm) and 9 <= hour <= 18   # 工作时间
```

## 五、与其他技术对比
RBAC 易管理但粗；ABAC 灵活但策略复杂易错。常组合：RBAC 定基线，ABAC 补细粒度。

## 六、常见误区
角色爆炸(每权限一角色)回到原点。ABAC 策略无测试导致隐性拒绝/允许。忽略职责分离。

## 七、与开源书/权威来源对应
NIST RBAC 标准；OWASP Authorization Cheat Sheet；Saltzer 最小权限。

## 八、面试题
RBAC 三要素？ABAC 四要素？角色继承利弊？

## 九、演进与趋势
基于属性的访问控制与零信任策略引擎(OPA)；图权限模型。

## 十、小结
RBAC 以角色中介简化授权管理，ABAC 用属性表达上下文策略，二者互补构成现代授权体系。
