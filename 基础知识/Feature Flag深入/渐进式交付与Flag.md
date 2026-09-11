# 渐进式交付与Flag

> 对应 Kim et al. 2016《Accelerate》与《The DevOps Handbook》、Humble & Farley 2010《Continuous Delivery》，以及 Fowler 关于 Feature Toggles / Canary Release 的讨论与 OpenFeature、Argo Rollouts 等实践（以官方最新文档为准）。

## 一、背景与挑战

传统发布把"部署"（把代码放到生产）与"发布"（让用户用上新功能）绑成一件事。这带来一个结构性矛盾：要么一次性全量，承担全部风险；要么长期不发布，把风险累积成更大的一次性爆炸。团队于是陷入两难——想小步快跑又不敢全量，最终选择低频大版本，而低频大版本恰恰是事故率最高的发布方式。

渐进式交付（Progressive Delivery）的出发点是把这两件事解耦：**代码可以每天都上生产，但功能对谁可见、可见多少，由运行时控制**。这样发布的粒度从"一次大版本"变成"一次小改动 + 一个可控的放量曲线"，风险被摊薄到可观测、可回滚的每一步。

挑战在于解耦之后新增的复杂度：放量策略如何设计才能既快又稳？如何判断"可以进入下一档"？出现异常时自动回滚的判据是什么？多个功能同时在放量时如何避免互相干扰？以及最容易被忽视的一点——**部署了但长期不开 Flag，等于没有交付任何价值**，这在大团队中极为常见。

## 二、核心原理

**部署与发布解耦。** 代码始终部署到生产环境（持续部署），但新路径由 Flag 控制可见性：

$$
\mathrm{Visible}(u, t) = \mathrm{eval}(\mathrm{flag}, \mathrm{ctx}(u)) \ \wedge\ \mathrm{Deployed}(t)
$$

前者是运行时可变的布尔判定，后者是部署事实。两者独立演进，因此可以"每天部署十次、每周发布一个功能"。

**放量曲线。** 常见的分档为 $p: 0 \to 0.01 \to 0.05 \to 0.25 \to 0.5 \to 1.0$，每一档都设有观察期与准入门槛。放量的本质是在"曝光速度"与"风险敞口"之间权衡：

$$
\mathrm{Risk}(p) = p \cdot \Pr[\text{缺陷}] \cdot \mathrm{Impact}, \qquad \mathrm{Signal}(p, T) = p \cdot T \cdot \lambda
$$

前者随 $p$ 线性增长，后者决定在观察期 $T$ 内能收集到多少有效样本。$p$ 太小则信号不足（缺陷长时间不被发现），$p$ 太大则风险敞口过大，这就是必须分档而非一步到位的原因。

**金丝雀与 Flag 的分工。** 金丝雀（canary）按**实例或流量比例**路由到不同版本，适合验证"新版本本身是否健康"（崩溃率、延迟、资源占用）；Flag 按**用户属性**控制功能路径，适合验证"新功能是否被用户接受"（转化率、留存、投诉）。二者常结合：金丝雀保证新版本可用，Flag 保证新功能可控。

**闭环控制。** 成熟的渐进式交付把放量交给自动化：持续观测错误率、延迟、业务指标，达标则自动进入下一档，越界则自动回滚。这使得放量从"人工开会决策"变为"按指标自动推进"。

## 三、形式化与数学基础

**风险敞口。** 设缺陷在放量比例 $p$ 下的影响用户占比为 $p$，则单位时间的期望影响为

$$
\mathbb{E}[\mathrm{Impact}] = p \cdot N \cdot \Pr[\text{缺陷导致损失}]
$$

其中 $N$ 为总用户数。分档放量的期望总影响为各档之和：

$$
\mathrm{TotalImpact} = N \cdot \sum_{i} p_i \cdot \Delta t_i \cdot \Pr[\text{缺陷} \mid \text{在档位 } i]
$$

由于有缺陷时通常在低档位就被发现并回滚，实际总影响远低于一次性全量（$p = 1$ 且持续到人工发现）。

**检出时间。** 设缺陷导致的可观测事件（错误、崩溃）发生率为 $\lambda$（每用户每单位时间），则放量比例 $p$、用户数 $N$ 下，观察到的事件率为

$$
\Lambda = p \cdot N \cdot \lambda
$$

首次检出时间的期望为

$$
\mathbb{E}[T_{\mathrm{detect}}] = \frac{1}{\Lambda} = \frac{1}{p N \lambda}
$$

这给出了**最小放量比例的设计依据**：若要求在观察期 $T_{\mathrm{obs}}$ 内以较高概率发现缺陷，需满足

$$
p \ge \frac{-\ln(1 - P_{\mathrm{detect}})}{N \lambda T_{\mathrm{obs}}}
$$

即用户规模 $N$ 越小、缺陷率 $\lambda$ 越低，需要越大的初始放量比例才能及时发现问题。这解释了为什么低频缺陷（如特定输入触发的崩溃）在小流量下可能长时间不被发现。

**自动回滚判据。** 常用双阈值：错误率与绝对样本量。设新路径错误率为 $\hat{e}_{\mathrm{new}}$，基线为 $e_0$，回滚条件为

$$
\hat{e}_{\mathrm{new}} > e_0 \cdot (1 + \epsilon) \quad \wedge \quad n_{\mathrm{new}} \ge n_{\min}
$$

第二个条件至关重要——样本不足时比例估计极不稳定，会在放量初期产生大量误报。

**统计显著性。** 比较新旧路径转化率 $p_A$、$p_B$，样本量 $n_A$、$n_B$，则

$$
z = \frac{\hat{p}_B - \hat{p}_A}{\sqrt{\hat{p}(1 - \hat{p})\left( \frac{1}{n_A} + \frac{1}{n_B} \right)}}, \qquad \hat{p} = \frac{x_A + x_B}{n_A + n_B}
$$

只有 $|z|$ 超过阈值（对应显著性水平 $\alpha$）时才应做出"胜出/落败"的结论，这也是实验类 Flag 需要固定观察期而非随时喊停的原因。

**部署频率与发布频率的解耦**可量化为

$$
f_{\mathrm{deploy}} \gg f_{\mathrm{release}}
$$

前者由 CI 能力决定，后者由业务节奏决定。渐进式交付的核心价值正是让两者互不阻塞。

## 四、代码实现

```python
# 渐进式放量：按比例命中，且同一用户稳定
import hashlib

def bucket(key: str, uid: str, salt: str = "") -> int:
    payload = f"{salt}:{key}:{uid}".encode("utf-8")
    return int(hashlib.sha256(payload).hexdigest()[:8], 16) % 100

def in_rollout(flag_key: str, uid: str, percent: int) -> bool:
    if percent <= 0:
        return False
    if percent >= 100:
        return True
    return bucket(flag_key, uid) < percent

def render_home(user):
    p = flags.rollout_percent("new-feed")       # 由配置中心下发当前档位
    if p > 0 and in_rollout("new-feed", user.id, p):
        return new_feed(user)
    return old_feed(user)
```

```python
# 自动放量控制器：指标达标进下一档，越界立即回滚
from dataclasses import dataclass

@dataclass
class RolloutStep:
    percent: int
    min_observe_minutes: int

LADDER = [RolloutStep(1, 30), RolloutStep(5, 30), RolloutStep(25, 60),
          RolloutStep(50, 60), RolloutStep(100, 120)]

class AutoRollout:
    def __init__(self, flag_key, ladder=LADDER):
        self.flag_key = flag_key
        self.ladder = ladder
        self.stage = 0
        self.entered_at = None

    def evaluate(self, metrics, now):
        # 双重判据：错误率越界 且 样本量足够，避免小样本误报
        if metrics["samples"] >= 1000 and \
           metrics["error_rate"] > metrics["baseline_error_rate"] * 1.5:
            self.rollback()
            return {"action": "ROLLBACK", "percent": 0}

        if (now - self.entered_at).total_seconds() / 60 >= \
           self.ladder[self.stage].min_observe_minutes and \
           metrics["latency_p99"] <= metrics["baseline_p99"] * 1.1:
            return self.promote(now)

        return {"action": "HOLD", "percent": self.ladder[self.stage].percent}

    def promote(self, now):
        if self.stage >= len(self.ladder) - 1:
            return {"action": "DONE", "percent": 100}
        self.stage += 1
        self.entered_at = now
        return {"action": "PROMOTE", "percent": self.ladder[self.stage].percent}

    def rollback(self):
        self.stage = 0
        self.entered_at = None
        flags.set_percent(self.flag_key, 0)     # 秒级止血，无需重新部署
        return 0
```

```python
# 金丝雀（按流量/实例）与 Flag（按用户）配合使用
def handle_request(req):
    # 1) 金丝雀由网关按流量比例决定实例版本，验证"新版本是否健康"
    # 2) Flag 在应用内按用户属性决定路径，验证"新功能是否被接受"
    if in_rollout("new-feed", req.user.id, flags.rollout_percent("new-feed")):
        track.exposure(req.user.id, "new-feed", "v2")
        return new_feed(req.user)
    track.exposure(req.user.id, "new-feed", "control")
    return old_feed(req.user)
```

```yaml
# 放量配置示例（字段名依具体平台而定）
rollout:
  flag: new-feed
  ladder: [1, 5, 25, 50, 100]
  observe_minutes: [30, 30, 60, 60, 120]
  guardrails:
    error_rate_max_ratio: 1.5      # 相对基线的错误率上限
    latency_p99_max_ratio: 1.1
    min_samples: 1000              # 样本不足不判定
  auto_rollback: true
  auto_promote: true
```

## 五、与其他技术对比

| 维度 | 一次性全量 | 蓝绿部署 | 金丝雀发布 | Flag 渐进放量 |
|------|-----------|----------|-----------|---------------|
| 控制粒度 | 全部用户 | 整套环境 | 流量/实例比例 | 用户属性 + 百分比 |
| 回滚速度 | 慢（重新发版） | 中（切流量） | 中（调比例） | **秒级（改配置）** |
| 影响面控制 | 无 | 粗 | 中 | 细（可按人群） |
| 是否需要双份资源 | 否 | 是 | 部分 | 否 |
| 支持长期实验 | 否 | 否 | 否 | 是 |
| 验证目标 | — | 版本可用性 | 版本健康度 | 功能接受度 + 健康度 |

| 组合方式 | 分工 | 适用 |
|----------|------|------|
| 金丝雀 + Flag | 金丝雀验版本，Flag 验功能 | 大型改动 |
| 仅 Flag | 单版本内控制功能 | 常规功能发布 |
| 仅金丝雀 | 版本级风险控制 | 基础设施升级 |
| 影子流量 + Flag | 影子验证正确性，Flag 控制暴露 | 高风险算法替换 |

## 六、常见误区

- **部署了却长期不开 Flag**：代码在生产睡大觉，价值未兑现，还多了一堆分支。应设定"部署后 N 天内必须开始放量"的约束。
- **Flag 判定未用哈希**：同一用户时进时出，实验数据作废、体验割裂（详见「Flag的运行时求值」）。
- **放量档位跳跃过大**：从 1% 直接到 100%，等于放弃分档的意义。
- **样本不足就下结论**：小样本下错误率与转化率波动极大，应设置最小样本量门限。
- **只看技术指标不看业务指标**：错误率正常不代表功能被接受，实验类放量必须同时看转化率、留存等。
- **多个功能同时放量互相污染**：应使用分层 salt 保证实验正交（详见「Flag的运行时求值」）。
- **自动回滚缺少人工复核通道**：完全自动可能因指标抖动反复回滚/放量，应支持人工锁定档位。
- **忘记放量完成后的清理**：全量稳定后必须删除分支（详见「Flag的生命周期管理」）。

## 七、与开源书·权威来源对应

- Kim et al. 2016《Accelerate》：用大规模实证数据证明部署频率、前置时间与稳定性正相关，是"部署与发布解耦"的价值依据；书中提出的四项关键指标（部署频率、变更前置时间、变更失败率、恢复时间）也是衡量渐进式交付效果的框架。
- Kim et al.《The DevOps Handbook》：给出降低发布风险的具体实践（金丝雀、蓝绿、Feature Toggle 与自动化回滚）。
- Humble & Farley 2010《Continuous Delivery》：提出部署流水线与"每次提交都可发布"的理念，并明确 release toggle 的作用。
- Fowler 关于 Feature Toggles 与 Canary Release 的讨论：区分了两者的控制维度与适用场景。
- Google《Site Reliability Engineering》：错误预算、服务水平指标与自动化的变更管理，为自动放量/回滚的判据设计提供原则。
- Argo Rollouts、Flagger 等渐进式交付工具：把放量阶梯、指标判据与自动回滚产品化（以官方最新文档为准）。
- OpenFeature 规范与 LaunchDarkly / Unleash 平台：提供 Flag 求值、实验分流与放量治理能力（以官方最新文档为准）。
- Kohavi et al.《Trustworthy Online Controlled Experiments》：实验类放量的统计方法学，包括样本量与显著性判断。

## 八、面试题

1. 部署与发布解耦带来哪些好处？如何量化？
2. 放量档位应如何设计？为什么不能从 1% 直接到 100%？
3. 给定用户规模与缺陷率，如何估算最小可检出的放量比例？
4. 金丝雀发布与 Flag 渐进放量的区别是什么？为什么常结合使用？
5. 自动回滚的判据应如何设计？为什么必须加入最小样本量条件？
6. 放量过程中应同时观测哪些指标？技术指标足够吗？
7. "部署了但长期不开 Flag"有什么危害？如何避免？

## 九、演进与趋势

渐进式交付正从"人控放量"走向"平台化的自动决策闭环"。趋势上，一是**指标驱动的自动放量/回滚**成为标配，把放量阶梯与守护指标写成声明式配置；二是**与实验平台融合**，发布类放量（验证健康度）与实验类分流（验证接受度）在同一平台完成；三是**与可观测深度集成**，Flag 变更自动关联指标、日志与追踪，形成"变更—影响"的因果链；四是**按群体而非仅按比例放量**，支持按地域、客户等级、风险画像精准控制；五是**服务端与客户端统一**，把移动端与前端的发布也纳入同一控制面；六是**清理自动化**，放量完成后自动触发 Flag 生命周期的清理流程。

## 十、小结

渐进式交付的本质是"部署与发布解耦"：代码持续上生产，功能可见性由 Flag 在运行时控制。它的价值可以用两个公式概括——风险敞口随放量比例线性增长，而缺陷检出时间随 $1/(pN\lambda)$ 缩短，因此分档放量能同时压低总影响并加快发现问题的速度。落地要点是：用确定性哈希保证用户一致，用放量阶梯配合观察期，用"错误率 + 最小样本量"双判据做自动回滚，用金丝雀验版本、Flag 验功能。最后别忘了两件事：部署后要及时开始放量，全量后要及时清理分支。
