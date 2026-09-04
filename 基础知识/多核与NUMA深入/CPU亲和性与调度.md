# CPU亲和性与调度

> 对应 CSAPP 中文笔记 https://github.com/Hansimov/csapp 第8章；OSTEP https://github.com/remzi-arpacidusse/ostep-code 。

## 一、背景与挑战

线程在核间迁移会丢失缓存热度和 NUMA locality。绑定亲和性可保持缓存利用率与本地内存。

## 二、核心原理

亲和性(affinity)限制线程可运行核集合。Linux 提供 `sched_setaffinity`。软亲和性由调度器尽量维持；硬亲和性由用户设定。与 NUMA 策略配合把线程绑到同节点核。

## 三、形式化 / 数学基础

缓存热度 $H$ 随迁移清零：

$$H(t) = \int warm\,,\quad migrate \Rightarrow H \leftarrow 0$$

绑定减少迁移次数 $M$，降低冷启动缺失：

$$MissRate \propto M$$

## 四、代码实现

```c
#define _GNU_SOURCE
#include <sched.h>
cpu_set_t m; CPU_ZERO(&m); CPU_SET(2, &m);
sched_setaffinity(0, sizeof(m), &m);   // 绑定到核2
```

## 五、与其他技术对比

- 硬绑定提缓存局部性但降负载均衡；全自由均衡但缓存冷。
- 与 NUMA 绑定协同。

## 六、常见误区

- 误以为总绑核更好：负载不均时反降吞吐。
- 忽视中断也需亲和。

## 七、与开源书 / 权威来源对应

- CSAPP 中文笔记：https://github.com/Hansimov/csapp
- OSTEP：https://github.com/remzi-arpacidusse/ostep-code

## 八、面试题

- 亲和性好处？答：保缓存热度与 NUMA 本地。
- 何时不该绑？答：负载不均、需均衡时。

## 九、演进与趋势

调度器自动感知 NUMA 与缓存域，减少手动绑定。

## 十、小结

CPU 亲和性用局部性换均衡，适合稳定高吞吐服务。
