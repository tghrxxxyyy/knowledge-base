# Feature Flag的分类

> 对应 Fowler 2002/2003《Patterns of Enterprise Application Architecture》（策略与配置分离）、Martin《Clean Code》（条件分支的归属与复杂度），以及 martinfowler.com 上关于 Feature Toggles 的分类讨论与 OpenFeature 规范（以官方最新文档为准）。

## 一、背景与挑战

同一份代码需要同时承载"已经稳定运行的功能"和"尚未验证的新路径"。最初的解决方式是在代码里加一个 `if`，但很快失控：发布用的开关、做实验的开关、应急降级的开关、给特定租户开放的权限开关全都被写成同一个 `flags.is_on(...)`，没人说得清哪个能删、哪个必须保留、哪个下线会出事。

分类的价值正在于把**生命周期与治理要求**绑定到类型上。没有分类，就无法回答三个关键问题：这个开关多久该删？谁有权改？出问题时应按什么流程回滚？实践中常见的事故是：把"实验类开关"当成"发布类开关"在实验跑完前删除，导致实验数据作废；或把"发布类开关"永久保留，几年后代码中堆积成百上千个死分支，新人根本不敢动。

## 二、核心原理

按用途与存续时长，Flag 通常分为四类：

**1. 发布类（Release Toggle）**。用于解耦"部署"与"发布"：代码先上生产但功能不可见，再逐步放量。特点是**短期**（数天到数周）、目标是降低发布风险、全量后应立即删除分支。它对应「渐进式交付与Flag」。

**2. 实验类（Experiment Toggle）**。用于 A/B 测试：同一功能的不同实现按比例分流，收集指标后做决策。特点是**中期**（一个实验周期）、要求分流稳定且可复现、需要与分析平台打通、结束后必须清理（无论胜出还是落败，都要把胜出方案固化为代码）。

**3. 运维类（Ops Toggle / Kill Switch）**。用于限流、降级、熔断、关闭高消耗功能。特点是**长期甚至永久**、要求秒级生效、默认值必须指向"安全侧"（通常是降级）、且必须定期演练以确认仍然有效。

**4. 权限类（Permission Toggle）**。按租户、套餐、内测名单、地域开放功能。特点是**长期**、本质是业务规则而非临时开关、通常需要与权限系统而非配置中心对齐。

四类在关键属性上差异明显：

$$
\mathrm{Flag} = (\mathrm{type},\ \mathrm{ttl},\ \mathrm{scope},\ \mathrm{owner},\ \mathrm{default})
$$

- `type` 决定治理流程；
- `ttl` 决定是否需要过期提醒；
- `scope` 决定判定维度（用户、租户、请求、环境）；
- `owner` 决定谁负责下线；
- `default` 决定故障时的安全方向。

## 三、形式化与数学基础

设 Flag 集合 $F$，按类型划分为互不相交的子集：

$$
F = F_{\mathrm{release}} \cup F_{\mathrm{experiment}} \cup F_{\mathrm{ops}} \cup F_{\mathrm{perm}}, \qquad F_i \cap F_j = \varnothing\ (i \neq j)
$$

治理目标可写为最小化"活跃临时 Flag 数"：

$$
\min \ |F_{\mathrm{release}}| + |F_{\mathrm{experiment}}| \quad \text{s.t. 发布与实验需求被满足}
$$

而 $|F_{\mathrm{ops}}| + |F_{\mathrm{perm}}|$ 允许非零，但必须有文档与 owner。

**技术债的度量**。若每个 Flag 在代码中引入一个二元分支，则路径数随 Flag 数指数增长：

$$
|\mathrm{Paths}| = 2^{|F_{\mathrm{active}}|}
$$

更实际的是**可达路径**：多数 Flag 彼此独立且作用域不重叠，因此真实复杂度由"同一代码路径上嵌套的 Flag 数"决定。定义函数 $d(c)$ 为代码位置 $c$ 处嵌套的 Flag 深度，则局部分支数为 $2^{d(c)}$，系统总复杂度为

$$
\mathcal{C} = \sum_{c} 2^{d(c)}
$$

这提示治理重点不是总数，而是**降低嵌套深度**。

**分流的正确性是实验类的核心**。设总体用户集 $U$，实验类 Flag 把 $U$ 划分为互斥且完备的组：

$$
U = \bigsqcup_{g \in G} U_g, \qquad \frac{|U_g|}{|U|} \approx p_g
$$

且要求对同一用户的分组在时间上稳定：

$$
\forall t,\ g(u, t) = g(u, t + \Delta)
$$

这由确定性哈希保证（见「Flag的运行时求值」）。此外要求**组间无干扰**：不同实验的分流应正交，通常用分层哈希：

$$
g = H(\mathrm{uid},\ \mathrm{salt}_{\mathrm{layer}})
$$

不同 layer 使用不同 salt，使实验之间的分组相互独立。

**样本量**也是实验类的形式化要求。给定基线转化率 $p_0$、最小可检测效应 $\delta$、显著性水平 $\alpha$ 与检验效能 $1 - \beta$，每组所需样本量约为

$$
n \approx \frac{(z_{1-\alpha/2} + z_{1-\beta})^2 \cdot 2 p_0 (1 - p_0)}{\delta^2}
$$

这解释了为什么实验类 Flag 不能随意提前结束——样本不足时结论不可信。

## 四、代码实现

```python
# 用数据类把分类固化到定义里，让治理规则可执行
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum

class FlagType(Enum):
    RELEASE = "release"        # 短期，全量后删除
    EXPERIMENT = "experiment"  # 中期，实验结束后清理
    OPS = "ops"                # 长期，需演练
    PERMISSION = "permission"  # 长期，业务规则

@dataclass
class Flag:
    key: str
    type: FlagType
    owner: str
    created_at: datetime
    default: bool = False
    ttl_days: int | None = None      # 临时类必须设置
    expires_at: datetime | None = field(default=None, init=False)

    def __post_init__(self):
        if self.type in (FlagType.RELEASE, FlagType.EXPERIMENT) and self.ttl_days is None:
            raise ValueError("临时类 Flag 必须设置 ttl_days")
        if self.ttl_days is not None:
            self.expires_at = self.created_at + timedelta(days=self.ttl_days)

    def is_expired(self, now: datetime) -> bool:
        return self.expires_at is not None and now > self.expires_at
```

```python
# 使用侧：不同类型对应不同的调用语义
flags = FlagRegistry()

# 发布类：逐步放量，全量后删除分支
if flags.is_on("new-checkout", user_id=user.id, flag_type=FlagType.RELEASE):
    return new_checkout(user)
return old_checkout(user)

# 实验类：要求分组稳定且可回传到分析平台
variant = flags.variant("feed-ranking", user_id=user.id)   # 返回 "control" / "v1" / "v2"
track.exposure(user.id, "feed-ranking", variant)           # 必须记录曝光
return render_feed(user, variant)

# 运维类：默认安全侧，秒级生效，需定期演练
if flags.is_on("degrade-search", default=True):            # 默认走降级
    return cached_search(query)
return live_search(query)

# 权限类：本质是业务规则，应与权限系统对齐
if flags.is_on("beta-report", tenant_id=tenant.id, flag_type=FlagType.PERMISSION):
    return beta_report(tenant)
return standard_report(tenant)
```

```python
# 审计：定期扫描过期与无主 Flag，输出待清理清单
def audit(registry, now):
    issues = []
    for f in registry.all():
        if f.is_expired(now):
            issues.append(("EXPIRED", f.key, f.owner))
        if f.type in (FlagType.RELEASE, FlagType.EXPERIMENT) and f.owner is None:
            issues.append(("NO_OWNER", f.key, None))
        if f.type == FlagType.OPS and not registry.recently_drilled(f.key):
            issues.append(("NO_DRILL", f.key, f.owner))
    return issues
```

## 五、与其他技术对比

| 类型 | 存续时长 | 判定维度 | 默认值方向 | 治理要求 | 典型风险 |
|------|----------|----------|-----------|----------|----------|
| 发布类 | 天~周 | 用户百分比 | 关（旧路径） | 全量即删分支 | 忘记删除 |
| 实验类 | 一个实验周期 | 稳定分桶 | 按对照组 | 记录曝光、算样本量 | 提前结束、分流不稳 |
| 运维类 | 长期/永久 | 全局或环境 | **降级侧** | 定期演练 | 从未演练、失效未发现 |
| 权限类 | 长期 | 租户/套餐/名单 | 关 | 与权限系统对齐 | 绕过权限校验 |

| 技术 | 控制对象 | 变更速度 | 主要用途 |
|------|----------|----------|----------|
| Feature Flag | 代码执行路径 | 秒级 | 发布、实验、降级 |
| 配置项 | 参数取值 | 秒级~需重启 | 阈值、地址、超时 |
| 灰度/金丝雀 | 实例或流量比例 | 分钟级 | 版本级风险控制 |
| 权限系统 | 用户可见资源 | 秒级 | 长期业务规则 |
| 蓝绿部署 | 整套环境 | 分钟级 | 整体切换与回滚 |

## 六、常见误区

- **所有开关都设为永久**：发布类与实验类必须有 TTL 与到期提醒，否则必然积累成技术债。
- **实验类与发布类混用**：实验跑完前删除开关会让数据作废；发布开关拿去做实验则缺少曝光记录与统计效力。
- **用 Flag 实现本该由权限系统承担的逻辑**：权限类应回归权限模型，否则安全边界模糊、难以审计。
- **运维类开关默认值取错**：默认应指向降级/关闭，否则配置中心故障时开关失去意义。
- **运维类开关从不演练**：长期不用的降级路径可能早已失效，等到真正故障时才发现。
- **嵌套 Flag 过深**：同一路径上多个 Flag 组合会让测试矩阵指数膨胀，应重构为策略表或分层控制。
- **缺少 owner**：没有明确负责人就没人负责下线，这是 Flag 只增不删的根因。

## 七、与开源书·权威来源对应

- Fowler《Patterns of Enterprise Application Architecture》：提出用配置与策略对象分离易变行为，是 Flag 分类思想的工程基础。
- Fowler 关于 Feature Toggles 的经典文章（martinfowler.com）：明确区分 release / experiment / ops / permission 四类 toggle，并讨论各自的存续时长与治理方式。
- Martin《Clean Code》：主张删除死代码、控制条件复杂度、让分支有清晰归属，直接对应"发布类 Flag 全量后必须删除分支"。
- Humble & Farley 2010《Continuous Delivery》：把 release toggle 作为"部署与发布解耦"的核心手段。
- Kim et al. 2016《Accelerate》：用数据说明高频部署 + 解耦发布能同时提升速度与稳定性，为发布类 Flag 的价值提供实证。
- Kohavi et al.《Trustworthy Online Controlled Experiments》：实验类 Flag 的方法学基础，包括分流正交、曝光记录与样本量计算。
- OpenFeature 规范：提供与厂商无关的 Flag API 与上下文模型，便于在代码层面表达不同类型（以官方最新文档为准）。
- LaunchDarkly / Unleash / Flagsmith 等平台的文档：对 Flag 类型与治理流程有成熟的工程化定义，可作为选型参考。

## 八、面试题

1. 发布类与实验类 Flag 有什么本质区别？治理要求有何不同？
2. 为什么临时类 Flag 必须设置消亡时间？如何用工具强制执行？
3. 运维类开关的默认值应如何设定？为什么必须定期演练？
4. 实验分流为什么要求组间正交？如何用分层哈希实现？
5. 一个 A/B 实验需要多少样本？给出估算公式并说明各参数含义。
6. 嵌套 Flag 会带来什么问题？如何重构以降低复杂度？
7. 哪些场景不该用 Flag 而应使用权限系统或配置中心？

## 九、演进与趋势

分类正在从"口头约定"走向"代码与平台强制"。趋势上，一是**类型内建到 SDK**，定义 Flag 时必须声明类型与 TTL，否则无法创建；二是**与可观测和实验平台打通**，实验类自动记录曝光、自动计算样本量与显著性；三是**自动化治理**，扫描长期全开或已过期的 Flag 并生成清理 PR；四是**与渐进式交付平台融合**，发布类的放量由指标自动驱动，异常时自动回滚；五是**策略即代码**，把权限类规则从散落的 if 收敛为集中策略表，降低认知负荷。

## 十、小结

按类别管理 Flag 是避免开关失控的前提。四类 Flag 的目标是：发布类解耦部署与发布（短期、全量即删）、实验类支撑 A/B 决策（需稳定分流与曝光记录）、运维类保障故障止血（长期、默认安全侧、需演练）、权限类表达业务规则（应回归权限系统）。核心治理手段是三件事：类型必填、TTL 必填、owner 必填。没有这三项，Flag 必然从"提升交付速度的工具"退化为"拖慢一切的技术债"。
