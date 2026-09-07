# 分支预测与安全Spectre关联

> 对应 Kocher et al. 2019 "Spectre" (arXiv:1801.01203) / Böhme 2018 "Meltdown"。

## 一、背景与挑战
投机执行在误预测时本应回滚结果，但微架构状态(缓存)未完全回滚，攻击者可借侧信道读出越权数据。Spectre 利用分支预测器的投机行为越界读。

## 二、核心原理
Spectre v1 训练条件分支使其误预测进入越界路径，投机加载越界数据进缓存；随后用Flush+Reload 测缓存命中时间还原字节。v2 污染间接分支预测(BTB)劫持目标。

## 三、形式化与数学基础
侧信道观测：
$$ t_{hit} \ll t_{miss} $$
通过时间差 $\Delta t$ 判定某地址是否在缓存：
$$ bit = \begin{cases}1 & \Delta t < \theta \\ 0 & \Delta t \ge \theta\end{cases} $$
逐步拼出机密。

## 四、代码实现
```c
// 示意：训练分支后越界投机读(仅演示原理，实际需精确布局)
#include <cstdlib>
char public_arr[16];
int vuln(size_t idx) {
    if (idx < 16)                 // 被训练为 taken
        return public_arr[idx];   // 投机越界(若 idx 被误预测为正整数)
    return -1;
}
```

## 五、与其他技术对比
Meltdown 利用权限检查与加载的顺序漏洞(用户可读内核)，Spectre 利用预测器本身。二者都靠缓存侧信道，但根因不同。

## 六、常见误区
认为仅禁用投机即可修复(性能崩塌)。以为只影响特定厂商——多数乱序 OoO 实现均受影响，属微架构共性。

## 七、与开源书/权威来源对应
Kocher et al. 2019 Spectre 论文；Böhme 2018 Meltdown；CSAPP 第5章提及侧信道背景。

## 八、面试题
Spectre 与 Meltdown 区别？为何回滚结果仍有泄露？防护手段(Retpoline/LFENCE)？

## 九、演进与趋势
硬件缓解(IBPB, STIBP, 微码)、软件屏障(LFENCE)、Site Isolation 隔离；新变种持续出现。

## 十、小结
分支预测器的投机执行在微架构层留下痕迹，被侧信道利用成跨权限泄露，是性能与安全的根本张力点。
