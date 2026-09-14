# RBAC与ABAC授权模型

> 对应 NIST RBAC 模型（Ferraiolo & Kuhn 1992，ANSI INCITS 359）；NIST SP 800-162（ABAC 指南）；OWASP Authorization Cheat Sheet；Saltzer & Schroeder 1975。

## 一、背景与挑战

把权限直接绑定到用户，在组织规模增长时会失控：人员流动、岗位调整都要逐条改动权限，越权与漏权同时增加。RBAC（基于角色的访问控制）引入「角色」作为中介层，把「用户—权限」的多对多关系拆成「用户—角色」与「角色—权限」两组，大幅降低管理复杂度。但角色模型表达的是粗粒度的静态资格，无法自然表达「仅在办公时间、仅从公司网段、且资源属于本人部门」这类上下文约束，ABAC（基于属性的访问控制）因此出现。挑战在于：如何在可管理性（RBAC 易审计）与表达力（ABAC 灵活）之间取得平衡，并避免角色爆炸或策略错误。

## 二、核心原理

RBAC 的核心构件是用户 $U$、角色 $R$、权限 $P$，以及两个映射 $UA \subseteq U \times R$（用户—角色）与 $PA \subseteq R \times P$（角色—权限）。高级特性包括角色继承（角色层级的权限沿上方向传播）与约束（如职责分离 SoD，禁止同一人同时持有互斥角色）。ABAC 把判定抽象为策略决策点（PDP）对属性求值：输入主体属性、资源属性、动作与环境属性，输出 Permit/Deny，属性来源可以是身份目录、资源标签与请求上下文。工程上常见的落地方式是「RBAC 打基线 + ABAC 补细粒度」：用角色决定能力范围，再用属性策略施加动态限制。

## 三、形式化与数学基础

RBAC 的授权判定为存在性判定：

$$ (u, r) \in UA \land (r, p) \in PA \Rightarrow u \text{ 被授予 } p $$

引入角色继承（$r_1 \succeq r_2$ 表示 $r_1$ 继承 $r_2$ 的权限）后，权限集向下传播：

$$ P(u) = \bigcup_{(u,r) \in UA} \{\, p \mid (r', p) \in PA \land r \succeq r' \,\} $$

ABAC 的判定是属性到决策的映射：

$$ Decision = f(S_{attr}, R_{attr}, A, E_{attr}) \in \{Permit, Deny\} $$

最小权限在两种模型中都体现为策略缺省取 `Deny`：$\forall (u, obj, act)$，若不存在匹配的授权或策略，则判定为拒绝。这也意味着 ABAC 的策略完备性（不遗漏必要允许、不误开多余允许）成为主要风险来源。

## 四、代码实现

```python
# 简易 RBAC：角色继承 + 默认拒绝
inherits = {"admin": {"editor"}, "editor": {"viewer"}, "viewer": set()}
pa = {"admin": {"read", "write", "delete"},
      "editor": {"read", "write"},
      "viewer": {"read"}}
ua = {"alice": {"admin"}, "bob": {"viewer"}}

def effective_perms(role, seen=None):
    seen = set() if seen is None else seen
    if role in seen:
        return set()                 # 防环：角色层级必须是有向无环图
    seen.add(role)
    perms = set(pa.get(role, set()))
    for parent in inherits.get(role, set()):
        perms |= effective_perms(parent, seen)
    return perms

def can(user, perm):
    if user not in ua:               # 默认拒绝：无角色即无权
        return False
    return any(perm in effective_perms(r) for r in ua[user])

# ABAC 补充：在 RBAC 基线上叠加环境与资源属性约束
def can_abac(user, perm, resource, env):
    if not can(user, perm):
        return False                 # 能力范围由角色决定
    if not 9 <= env.hour <= 18:      # 环境属性：仅工作时段
        return False
    if resource.tenant != user.tenant:
        return False                 # 资源属性：租户隔离
    return True
```

角色继承必须是 DAG，代码中的 `seen` 集合用于在角色层级被误配成环时避免无限递归。

## 五、与其他技术对比

| 维度 | ACL（直接绑用户） | RBAC | ABAC | ReBAC（关系型） |
| --- | --- | --- | --- | --- |
| 管理粒度 | 用户级，最细但最繁琐 | 角色级，易批量管理 | 属性级，动态 | 关系级（如「共享给」） |
| 表达力 | 弱 | 中 | 强 | 强（关系图） |
| 典型成本 | 条目爆炸 | 角色爆炸 | 策略错误 | 图查询开销 |
| 上下文感知 | 无 | 无 | 强（时间/位置/风险） | 中 |
| 审计友好度 | 低 | 高 | 中 | 中 |
| 适用场景 | 少量资源 | 企业内部系统 | 云/多租户/合规 | 协作与分享场景 |

## 六、常见误区

1. 角色爆炸：为每个权限组合新建角色，等于退回到用户级授权的复杂度。
2. 角色层级成环：继承关系必须是 DAG，否则权限计算不收敛。
3. ABAC 策略缺少测试：策略错误会静默地产生隐性允许或拒绝，且难以排查。
4. 忽略职责分离：关键操作应要求两个互斥角色，单角色即能完成全部审批会带来舞弊风险。
5. 只在应用层做角色检查：数据库、消息队列、对象存储等下层资源也需独立授权。
6. 认为 ABAC 可完全替代 RBAC：属性策略的维护与审计成本高，实践中更常见的是两者组合。

## 七、与开源书·权威来源对应

- Ferraiolo & Kuhn 1992 提出 RBAC 模型，后经 NIST 标准化（ANSI INCITS 359）定义 RBAC0–RBAC3 层级。
- NIST SP 800-162 给出 ABAC 的术语、策略模型与实施指导。
- OWASP Authorization Cheat Sheet 汇总授权设计、默认拒绝与集中判定的实践。
- Saltzer & Schroeder 1975 提供最小权限与默认拒绝原则的理论基础。
- 具体标准条款以官方最新版本为准。

## 八、面试题

1. RBAC 的三要素是什么？——用户、角色、权限，以及两组映射 UA 与 PA。
2. ABAC 的四类属性是什么？——主体属性、资源属性、动作、环境属性。
3. 角色继承的收益与风险？——收益是权限复用与层级清晰；风险是把上级权限无意下放，且层级成环会破坏计算。
4. 什么是角色爆炸，如何缓解？——为每个权限组合建角色导致数量失控；可通过角色继承、ABAC 补充与属性化角色缓解。
5. RBAC 与 ABAC 如何组合？——用 RBAC 定义能力基线（能做什么），用 ABAC 施加动态约束（何时何地可做）。

## 九、演进与趋势

趋势是把授权外置为可测试、可版本化的策略引擎（OPA/Rego 等），并以 ReBAC/图权限表达共享与委派。零信任要求每次请求重新仲裁，促使授权与属性上下文更紧密地结合。具体实现与规范以官方最新文档为准。

## 十、小结

RBAC 以角色中介把授权从「用户级」提升到「岗位级」，便于规模化与审计；ABAC 用属性与策略表达动态上下文，覆盖 RBAC 难以刻画的细粒度条件。二者互补，构成现代授权体系的主体；而默认拒绝与最小权限，是所有授权模型共同不可妥协的底线。
