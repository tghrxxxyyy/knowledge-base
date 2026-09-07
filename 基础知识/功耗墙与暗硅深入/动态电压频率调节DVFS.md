# 动态电压频率调节 DVFS

> 对应 Hennessy & Patterson 量化方法功耗管理章与 ARM Big.LITTLE 文档。

## 一、背景与挑战
固定高频浪费轻载功耗，固定低频拖慢重负载。DVFS 依负载动态调电压频率，在性能与能耗间实时折中。

## 二、核心原理
频率 $f$ 由时钟域与电压 $V$ 共同决定（$f \propto V$ 近似），降频可大幅降功耗（$P\propto V^2 f$）。操作系统调度器/硬件 governor（ondemand、schedutil）监控利用率调节。

## 三、形式化与数学基础
能量-延迟积：
$$E \cdot T = (P_{dyn}\cdot T) \cdot T = \alpha C V^2 \cdot f T^2$$
降 $V,f$ 省能但增延迟；最优工作点使任务在截止期内能耗最小：
$$\min_{V,f} Energy \quad s.t.\quad T_{deadline}$$

## 四、代码实现
```c
// 简单governor: 利用率高则升频
void dvfs_tick(int util_pct) {
    if (util_pct > 80 && cur_freq < FMAX) set_freq(cur_freq + STEP);
    else if (util_pct < 20 && cur_freq > FMIN) set_freq(cur_freq - STEP);
    // 频率改变时同步调整电压(查表)
    set_voltage(volt_for_freq(cur_freq));
}
```

## 五、与其他技术对比
DVFS 是普适的全局调节；与时钟门控（局部关时钟）、电源门控（关电压域）互补。相比异构（大小核），DVFS 不改变核类型。

## 六、常见误区
误以为降频一定省总能：若任务 deadline 固定，拖长执行可能总能耗不变甚至升。误以为电压可任意降：有最低 $V_{min}$。

## 七、与开源书/权威来源对应
量化方法功耗与热管理；ARM Big.LITTLE；Linux cpufreq 文档。

## 八、面试题
问：为何频率与电压需联动？答：维持时序正确需 $V$ 随 $f$ 升降，且功耗强依赖 $V^2$。

## 九、演进与趋势
每核/每域细粒度 DVFS、机器学习预测负载调速。

## 十、小结
DVFS 是应对功耗墙最成熟的技术，用"按需供能"换取能效。
