# DVFS动态调频

> 对应 Hennessy & Patterson 第7章；Linux cpufreq（公开文档定性）。

## 一、背景与挑战

负载波动大时固定高频浪费电、固定低频不够用。DVFS 动态调电压频率匹配负载。

## 二、核心原理

DVFS 在 P-state 间切换：高负载升频升压提性能，空闲降频降压省电。因 $P\propto V^2 f$ 且 $f$ 上限受 $V$ 限制，可联合调。Linux cpufreq 提供 ondemand/schedutil 等调速器。

## 三、形式化 / 数学基础

频率与电压近似线性约束 $V \ge V_{min}(f)$。切换能耗：

$$E_{switch} \approx C_{dyn} \times (V_{new}^2 - V_{old}^2)$$

稳态功耗随目标 $f$ 近似：

$$P(f) \propto V(f)^2 f$$

## 四、代码实现

```bash
# 设置调速器与频率
cpufreq-set -g schedutil
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq
```

## 五、与其他技术对比

- P-state(DVFS)调性能/功耗；C-state 管 idle 深睡。
- 调速器需平衡响应与抖动。

## 六、常见误区

- 误以为频繁调频更省：切换本身有代价与延迟。
- 忽视电压-频率绑定约束。

## 七、与开源书 / 权威来源对应

- Hennessy & Patterson《Computer Architecture: A Quantitative Approach》
- CSAPP 中文笔记：https://github.com/Hansimov/csapp

## 八、面试题

- DVFS 原理？答：按负载调电压频率，P∝V²f。
- P-state vs C-state？答：性能档 vs 空闲档。

## 九、演进与趋势

每核独立 DVFS、调度器感知能效(EEVDF)普及。

## 十、小结

DVFS 用电压-频率联合调节在性能与功耗间动态折中。
