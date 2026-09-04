# MESI协议状态机

> 对应 Hennessy & Patterson 附录 C；CSAPP 中文笔记 https://github.com/Hansimov/csapp 。

## 一、背景与挑战

需精确描述每块缓存行状态与迁移，使多副本既一致又不浪费带宽。MESI 用 4 态刻画一行。

## 二、核心原理

四态：Modified(已改,独占,脏)、Exclusive(干净,独占)、Shared(可能多核共享,干净)、Invalid(无效)。核心事件：处理器读(PrRd)、处理器写(PrWr)、总线读(BusRd)、总线写回(BusRW)。写未命中需先获独占(E/M)再改。

## 三、形式化 / 数学基础

状态转移（监听协议）：

- I --PrWr--> M（发 BusRdX 使他人无效）
- I --PrRd--> E（独占且干净）或 S（若他核也有）
- M --BusRd--> S（写回内存并降级为共享）
- S --PrWr--> M（发 BusInv 使他人无效）

不变式：至多一个核处于 M，E/M 总数至多 1。

## 四、代码实现

```c
// 伪代码：处理 PrWr 时状态迁移
if (state == I) { send_bus_rdx(); state = M; }
else if (state == S) { send_bus_inv(); state = M; }
else if (state == E || state == M) { state = M; }  // 直接改
```

## 五、与其他技术对比

- MSI 无 E 态：每次独享读也广播，浪费带宽；E 态优化。
- MESI 是绝大多数现代多核基础。

## 六、常见误区

- 误以为 S 态可写：写 S 必须升级到 M 并无效他人。
- 混淆 M 与 E：M 是脏的，E 是干净但不必要回写。

## 七、与开源书 / 权威来源对应

- CSAPP 中文笔记：https://github.com/Hansimov/csapp
- Hennessy & Patterson《Computer Architecture: A Quantitative Approach》

## 八、面试题

- M 态写是否广播？答：不，已独占，直接改。
- 为何引入 E 态？答：独享干净时写不必无效他人，省总线事务。

## 九、演进与趋势

MESI 加 Owner 位演化出 MOESI，以支持脏数据共享、减少写回。

## 十、小结

MESI 以四态状态机用最小带宽维持一致，是所有现代缓存一致协议的起点。
