# NUMA架构

> 对应 CSAPP 中文笔记 https://github.com/Hansimov/csapp 第6章；OSTEP https://github.com/remzi-arpacidusse/ostep-code ；Tanenbaum《Modern Operating Systems》。

## 一、背景与挑战

多插槽服务器中，内存分布到各插槽，本地访问快、远程访问慢且不对称，称非一致内存访问(NUMA)。

## 二、核心原理

节点(node)含若干核与本地内存控制器。访问本地内存延迟低、带宽高；跨节点经互连，延迟高。操作系统以 NUMA 节点管理，提供 `numactl` 绑定与策略(local/node/first-touch)。

## 三、形式化 / 数学基础

访问延迟：

$$Lat = \begin{cases} L_{local} & same\ node \\ L_{local} + D & remote\ node \end{cases}$$

$D$ 为互连延迟(常数十 ns)。带宽本地 > 远程。

## 四、代码实现

```bash
# 查看 NUMA 拓扑并绑定
numactl --hardware
numactl --cpunodebind=0 --membind=0 ./app   # 内存与 CPU 同节点
```

## 五、与其他技术对比

- UMA：对称延迟，难扩展到多插槽。
- NUMA：可扩展，但需感知 locality 否则远程访问拖慢。

## 六、常见误区

- 误以为所有内存一样快：远程访问可慢 2x。
- 默认分配可能在远程节点。

## 七、与开源书 / 权威来源对应

- CSAPP 中文笔记：https://github.com/Hansimov/csapp
- OSTEP：https://github.com/remzi-arpacidusse/ostep-code
- Tanenbaum《Modern Operating Systems》

## 八、面试题

- 什么是 NUMA？答：内存按节点分布，本地快远程慢。
- 为何要绑核绑内存？答：保持 locality，避免远程访问。

## 九、演进与趋势

更大节点、CXL 扩展内存进一步复杂化距离拓扑。

## 十、小结

NUMA 是可扩展多插槽的代价，性能依赖内存 locality 与绑定策略。
