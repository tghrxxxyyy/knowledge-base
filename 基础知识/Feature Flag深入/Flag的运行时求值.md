# Flag的运行时求值

> 对应 Fowler 2002/2003《Patterns of Enterprise Application Architecture》（基于上下文的策略解析）、Humble & Farley 2010《Continuous Delivery》、OpenFeature 规范中的 `EvaluationContext` 与 provider 模型，以及 LaunchDarkly / Unleash 的求值实践（以官方最新文档为准）。

## 一、背景与挑战

Flag 求值处在请求的关键路径上：一次页面渲染可能读取几十个开关，若每次都远程调用，延迟与扇出都不可接受；若每次都用随机数判定，同一用户会在新旧体验之间反复横跳，实验数据彻底失效。

因此运行时求值要同时满足四个相互制约的要求：

1. **低延迟**：必须在本地完成，不能引入网络往返。
2. **稳定性**：同一用户在同一 Flag 上，只要配置未变，结果就必须一致（sticky）。
3. **可控性**：放量比例、白名单、租户规则要能精确表达并即时生效。
4. **可解释性**：出问题时能回答"为什么这个用户命中了这条路径"，需要记录求值理由与规则版本。

难点在于这些要求之间确实存在张力：本地缓存带来延迟优势，却引入变更传播的滞后；确定性哈希保证稳定，却使比例分流的粒度受限于哈希空间的均匀性；规则表达越灵活，求值开销与可解释性成本越高。工程上的解法是把求值拆成**固定顺序的几段**，每段职责单一。

## 二、核心原理

一次求值通常按以下顺序短路返回：

**第一步：本地缓存读取规则**。规则由配置中心下发（见「Flag与配置中心的集成」），本地保存版本化快照，求值只读本地。

**第二步：强制覆盖（override）**。优先级最高，用于紧急止血与本地开发：

$$
\mathrm{eval} = \begin{cases}
v_{\mathrm{force}}, & \text{存在强制覆盖} \\
\mathrm{rules}(\mathrm{ctx}), & \text{否则}
\end{cases}
$$

**第三步：个体目标（individual targeting）**。按用户 ID、设备 ID、租户 ID 的显式名单命中，用于内测与定向放量。

**第四步：规则匹配（rule matching）**。按上下文属性（地域、App 版本、会员等级、语言等）做条件匹配，命中则返回对应变体。

**第五步：百分比分流（percentage rollout）**。用确定性哈希把上下文映射到 $[0, 100)$ 区间：

$$
b = H(\mathrm{key},\ \mathrm{salt},\ \mathrm{ctx.id}) \bmod 100, \qquad \mathrm{hit} = b < p
$$

**第六步：默认值兜底**。以上皆未命中时返回 `defaultValue`，这也是配置中心不可用时的安全网。

**稳定性的关键：哈希而非随机**。$H$ 必须是确定性函数，且 salt 只包含 Flag key 与（分层的）实验 salt，绝不能包含时间戳或随机数：

$$
H(\mathrm{key}, \mathrm{salt}, \mathrm{uid}) = \mathrm{hash}(\mathrm{salt} + ":" + \mathrm{key} + ":" + \mathrm{uid})
$$

这样同一用户在配置不变时永远落到同一桶，且**比例调整是单调的**：从 10% 提升到 20% 时，原来命中的 10% 仍然命中，不会有人被"踢出去"。这一性质由桶序号的不变性保证，是渐进放量的前提。

## 三、形式化与数学基础

**确定性分桶**：

$$
b(u) = \frac{H(\mathrm{salt}, \mathrm{key}, u)}{2^{m}} \in [0, 1), \qquad \mathrm{hit}(u) = \mathbb{1}\left[ b(u) < p \right]
$$

其中 $m$ 为哈希位宽。命中概率为

$$
\Pr[\mathrm{hit}] = \Pr[b(u) < p] = p
$$

**单调性（放量的核心性质）**：若 $p_1 < p_2$，则

$$
\{u : b(u) < p_1\} \subseteq \{u : b(u) < p_2\}
$$

即已命中用户不会被移出。这一包含关系完全来自"桶位置固定、只移动阈值"的设计，用随机判定则无法满足。

**分配的均匀性与偏差**：设哈希输出在 $[0, 2^m)$ 上近似均匀，则命中人数 $K \sim \mathrm{Binomial}(N, p)$，其标准差为

$$
\sigma_K = \sqrt{N p (1 - p)}
$$

相对波动为

$$
\frac{\sigma_K}{Np} = \sqrt{\frac{1 - p}{Np}}
$$

当 $N = 10^4$、$p = 0.01$ 时，相对波动约 $\sqrt{0.99/100} \approx 10\%$。这说明**小比例放量时实际人数可能与预期相差较大**，放量 1% 时不要指望精确到百人。

**多实验正交性**：若两个实验共用同一 salt 与 key 空间，分组会相关。正确做法是使用不同的 salt：

$$
g_1 = H(s_1, k_1, u), \qquad g_2 = H(s_2, k_2, u)
$$

在 $H$ 具备良好雪崩性质时，$g_1$ 与 $g_2$ 近似独立，即

$$
\Pr[g_1 \in A, g_2 \in B] \approx \Pr[g_1 \in A] \cdot \Pr[g_2 \in B]
$$

这就是"实验分层（layer）"的数学依据：同一流量可同时承载多个互不干扰的实验，前提是每层使用独立 salt。

**样本比率失配（SRM）检测**：实验期间应检验实际分流比是否偏离预期。观测到 $K$ 命中、$N - K$ 未命中时，卡方统计量为

$$
\chi^2 = \frac{(K - Np)^2}{Np} + \frac{((N - K) - N(1-p))^2}{N(1-p)}
$$

显著偏大说明分流或埋点存在问题，实验结论不可信。

**缓存一致性**：本地快照与服务端的最大滞后为

$$
\Delta = T_{\mathrm{poll}} + T_{\mathrm{prop}}
$$

其中 $T_{\mathrm{poll}}$ 为轮询周期，$T_{\mathrm{prop}}$ 为推送延迟。变更在 $\Delta$ 内完成收敛，业务需能容忍该窗口内的实例间不一致。

**求值开销**：单次求值为 $O(1)$ 哈希 + 若干规则匹配，若规则数为 $R$，单次开销 $O(R)$。对每请求 $k$ 次求值，总开销 $O(kR)$，因此规则数应保持在十量级以内，超出则考虑预编译或索引。

## 四、代码实现

```python
# 确定性分桶：hash 而非 random，保证同一用户稳定命中
import hashlib

def bucket(key: str, uid: str, salt: str = "") -> int:
    # salt 用于实验分层；绝不能包含时间或随机数
    payload = f"{salt}:{key}:{uid}".encode("utf-8")
    digest = hashlib.sha256(payload).hexdigest()
    return int(digest[:8], 16) % 100          # 映射到 [0, 100)

def hit(key: str, uid: str, percent: int, salt: str = "") -> bool:
    if percent <= 0:
        return False
    if percent >= 100:
        return True
    return bucket(key, uid, salt) < percent
```

```python
# 多变量分流：把 [0,100) 按权重切成若干段，保证变体互斥且完备
def variant(key: str, uid: str, weights: dict[str, float], salt: str = "") -> str:
    total = sum(weights.values())
    if total <= 0:
        raise ValueError("权重之和必须为正")
    b = bucket(key, uid, salt) / 100.0 * total      # 归一化到总权重
    acc = 0.0
    for name, w in weights.items():
        acc += w
        if b < acc:
            return name
    return list(weights.keys())[-1]

# control 50%，v1 30%，v2 20%
v = variant("feed-ranking", user.id, {"control": 50, "v1": 30, "v2": 20}, salt="layer1")
```

```python
# 完整求值：按优先级短路，并记录命中原因以便排查
from dataclasses import dataclass

@dataclass
class EvalResult:
    value: object
    reason: str          # FORCE / TARGET / RULE / PERCENT / DEFAULT
    rule_index: int | None = None
    version: int | None = None

class Evaluator:
    def __init__(self, snapshot):
        self.snapshot = snapshot          # 本地规则快照（版本化）

    def evaluate(self, key, ctx, fallback=False):
        flag = self.snapshot.get(key)
        if flag is None:
            return EvalResult(fallback, "DEFAULT")

        # 1) 强制覆盖：最高优先级，用于止血与本地开发
        if "force" in flag and key in self.snapshot.forced:
            return EvalResult(self.snapshot.forced[key], "FORCE")

        # 2) 个体目标：显式名单
        uid = ctx.get("uid")
        if uid in flag.get("allowlist", []):
            return EvalResult(True, "TARGET")
        if uid in flag.get("denylist", []):
            return EvalResult(False, "TARGET")

        # 3) 规则匹配：按上下文属性
        for i, rule in enumerate(flag.get("rules", [])):
            if all(ctx.get(k) == v for k, v in rule["when"].items()):
                return EvalResult(rule["value"], "RULE", rule_index=i,
                                  version=self.snapshot.version)

        # 4) 百分比分流：确定性哈希，单调放量
        p = flag.get("percent", 0)
        if hit(key, uid or "", p, salt=flag.get("salt", "")):
            return EvalResult(True, "PERCENT", version=self.snapshot.version)

        # 5) 默认值兜底
        return EvalResult(flag.get("default", fallback), "DEFAULT")
```

```python
# 使用侧：一次求值拿到值与原因，便于埋点与排障
res = evaluator.evaluate("new-checkout", {"uid": user.id, "region": user.region})
track.flag_eval(user.id, "new-checkout", res.value, res.reason, res.version)
if res.value:
    return new_checkout(user)
return old_checkout(user)
```

## 五、与其他技术对比

| 维度 | 随机判定 | 白名单 | 确定性哈希分桶 | 规则匹配 |
|------|----------|--------|----------------|----------|
| 用户一致性 | 无（反复横跳） | 有（对名单内） | 有 | 有 |
| 放量平滑 | 可 | 不可（离散） | 可 | 可 |
| 单调放量 | 否 | — | **是**（关键） | — |
| 覆盖长尾 | 可 | 不可 | 可 | 取决于属性 |
| 多实验正交 | 不可 | — | 可（换 salt） | — |
| 成本 | 极低 | 低 | 低 | 中 |

| 缓存策略 | 延迟 | 一致性 | 风险 |
|----------|------|--------|------|
| 每次远程调用 | 高 | 强 | 扇出压垮配置中心 |
| 本地缓存 + 轮询 | 极低 | 滞后 $T_{\mathrm{poll}}$ | 需容忍窗口 |
| 本地缓存 + 推送 | 极低 | 滞后最小 | 需重连补偿 |
| 请求级 memo | 极低 | 同一次请求内一致 | 跨请求仍可能变 |

## 六、常见误区

- **用随机数判定**：同一用户时进时出，实验数据作废，用户体验割裂。
- **哈希输入混入时间戳或随机数**：看似无害，实则破坏了确定性与单调性。
- **把 salt 与 key 写反或共用**：多个实验共用 salt 会造成分组相关，结论相互污染。
- **缓存不设 TTL 或不订阅变更**：配置改了长时间不生效，"秒级开关"名存实亡。
- **小比例放量时高估精度**：1% 放量在万级流量下实际人数可能偏差约 10%，应以实测人数为准。
- **忽略默认值方向**：未命中时应返回安全侧取值，而不是随意取 `false`。
- **不记录求值原因**：出问题时无法回答"为什么这个用户命中了新路径"，排障成本极高。
- **规则数量无节制增长**：规则过多会让求值开销与认知负担同步上升，应定期精简。

## 七、与开源书·权威来源对应

- Fowler《Patterns of Enterprise Application Architecture》：讨论把易变的行为选择外置为策略对象，并按上下文解析，是运行时求值的思想源头。
- Humble & Farley 2010《Continuous Delivery》：把 feature toggle 作为持续交付的核心技术，强调"开关必须能被安全地、快速地改变"。
- OpenFeature 规范（CNCF）：定义了统一的求值 API、`EvaluationContext`、provider 与 `EvaluationDetails`（含 reason / variant / flag metadata），直接对应本文的"记录命中原因"实践（以官方最新文档为准）。
- LaunchDarkly、Unleash、Flagsmith 等平台的求值文档：给出优先级链（强制 → 个体 → 规则 → 百分比 → 默认）与分桶实现细节，是工业界的事实参考。
- Kohavi et al.《Trustworthy Online Controlled Experiments》：SRM 检测、分流正交与样本量估算的方法学基础。
- Kim et al. 2016《Accelerate》：说明为何"运行时可改"比"发布时决定"更能兼顾速度与稳定。
- Google《Site Reliability Engineering》：关于渐进放量、错误预算与自动化回滚的工程原则，可用于设计放量策略。

## 八、面试题

1. 为什么 Flag 判定必须用确定性哈希而不是随机数？
2. 什么是"单调放量"？为什么它依赖桶位置固定？
3. 多个实验同时进行时如何保证互不干扰？salt 的作用是什么？
4. 放量 1% 时，实际命中人数可能与预期差多少？给出估算公式。
5. 一次完整的求值应包含哪些步骤？为什么要记录命中原因？
6. 本地缓存会带来什么一致性问题？业务上如何容忍？
7. 什么是 SRM？发现样本比率失配应如何处理？

## 九、演进与趋势

运行时求值正从"应用内库"走向"标准化与下沉"。趋势上，一是**API 标准化**，OpenFeature 让应用不再绑定厂商 SDK，provider 可替换；二是**边缘与网关侧求值**，在离用户更近的位置完成判定，减少多语言 SDK 的维护成本，并支持未改造的存量服务；三是**本地求值模式**（如边车或本地规则包），在保持零网络开销的同时提升一致性；四是**可解释性增强**，把求值原因、规则版本与变体信息直接写入追踪与日志；五是**与指标闭环**，求值事件自动关联业务指标，支撑自动放量、自动回滚与实验显著性判断。

## 十、小结

运行时求值的稳定性来自两件事：**确定性哈希**与**合理的缓存**。确定性哈希让同一用户始终落在同一桶，并使放量具备单调性（从 10% 到 20% 时原命中用户不会被踢出）；本地缓存让每请求数十次求值不产生网络开销，代价是 $T_{\mathrm{poll}} + T_{\mathrm{prop}}$ 的传播滞后，业务需能容忍。工程实现应遵循固定的优先级链（强制 → 个体 → 规则 → 百分比 → 默认），用独立 salt 实现实验分层，并记录求值原因与规则版本以便排障。永远不要用随机数做判定——这是 Flag 系统最常见的致命错误。
