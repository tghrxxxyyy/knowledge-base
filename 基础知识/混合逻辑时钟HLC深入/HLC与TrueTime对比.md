# HLC与TrueTime对比

> 对应 Spanner（Corbett et al. 2012, TrueTime）与 HLC 论文（Kulkarni et al. 2014）。

## 一、背景与挑战
两者都想在「物理时钟不可靠」的世界里给出可用的时间概念。TrueTime 返回带误差界的区间，HLC 返回有界近似的单值。选择哪种取决于能否改造硬件与是否接受提交等待。

## 二、核心原理
TrueTime 用 GPS 加原子钟加保守误差估计，API 返回 \\([t_{earliest}, t_{latest}]\\)，提交时 `commit wait` 到 \\(t_{latest}\\) 之后以保证外部一致性。HLC 则是每个节点本地维护 \\((l,c)\\)，无需全局硬件，通过因果加物理上限逼近。

## 三、形式化与数学基础
TrueTime 保证 \\(t\in[earliest,latest]\\)，误差 \\(\epsilon=latest-earliest\\)。HLC 保证 \\(|l-pt|\le\epsilon\\) 且 \\(l\\) 全序。本质差异：TrueTime 给「区间加全局同步保证」，HLC 给「单值加因果保证」。

## 四、代码实现
```python
# TrueTime 风格
def commit_wait(tt):
    t = tt.now()
    sleep_until(t.latest)   # 等待误差上界过去

# HLC 风格见前文 tick/recv
```

## 五、与其他技术对比
TrueTime 需专用硬件、强外部一致性、有提交延迟；HLC 纯软件、低延迟、外部一致性需额外冲突处理；Lamport 或向量时钟无物理含义。

## 六、常见误区
1. 认为 HLC 能达到 TrueTime 的强外部一致性：默认不保证，需补充机制。
2. 认为 TrueTime 无延迟：commit wait 引入可观测延迟。
3. 混淆二者误差来源：TrueTime 由硬件误差定，HLC 由 NTP 误差定。

## 七、与开源书/权威来源对应
Spanner 论文定义 TrueTime；CockroachDB 用 HLC 作为无硬件依赖的替代。

## 八、面试题
问：HLC 与 TrueTime 根本区别？
答：TrueTime 给带误差界的区间并需 commit wait，HLC 给有界物理近似的单值且靠因果加计数器保序。

## 九、演进与趋势
云厂商提供受管理的「时间 API」，模糊二者边界（如 Amazon Time Sync with PPS）。

## 十、小结
TrueTime 用硬件换强一致，HLC 用算法换普适性，按部署条件取舍。
