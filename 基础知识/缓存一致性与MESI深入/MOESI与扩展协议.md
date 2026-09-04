# MOESI与扩展协议

> 对应 Hennessy & Patterson 附录 C；AMD/Intel 实现文档（公开手册定性）。

## 一、背景与挑战

MESI 中 S 态须干净，当某核需共享已修改数据时要先写回内存再分发，浪费带宽。引入 Owner 态可让脏数据直接点对点共享。

## 二、核心原理

MOESI 增加 Owned(O) 态：数据被修改但与内存可能不一致，Owner 负责应答读请求（而非内存）。MESIF（Intel）增加 Forward(F) 态，指定唯一响应者减少广播。AMD 用 MOESI，Intel 用 MESIF。

## 三、形式化 / 数学基础

与 MESI 相比，O 态满足：

$$Owner(a) \Rightarrow (data(a) = latest) \land (mem(a)\ possibly\ stale)$$

读命中 O 时由 Owner 提供，省一次内存写回。F 态约定共享集中唯一转发者：

$$\sum_{core} [state==F] \le 1 \quad when\ Shared$$

## 四、代码实现

```c
// 伪代码：BusRd 命中 O 态，Owner 直接应答
on_bus_rd(addr):
    if state == O:
        send_data_to_requester(addr);  // 不回写内存
        # 请求者进入 S，本行保留 O
```

## 五、与其他技术对比

- MESI：共享必干净，写回多。
- MOESI：O 态共享脏数据。
- MESIF：F 态减少读取广播风暴。

## 六、常见误区

- 误以为 O 与 M 等价：O 仍可被共享，M 独占。
- 误以为 F 是新增数据态：F 只是 Shared 中的转发角色。

## 七、与开源书 / 权威来源对应

- Hennessy & Patterson《Computer Architecture: A Quantitative Approach》
- CSAPP 中文笔记：https://github.com/Hansimov/csapp

## 八、面试题

- MOESI 的 O 解决什么？答：脏数据共享，避免写回内存再读。
- MESIF 的 F 作用？答：指定唯一转发者，减少读广播。

## 九、演进与趋势

协议与片内网络（如环、网格）耦合，Owner/Forward 信息随包传递。

## 十、小结

MOESI/MESIF 在 MESI 上微调状态语义，用少量复杂度换带宽与延迟收益。
