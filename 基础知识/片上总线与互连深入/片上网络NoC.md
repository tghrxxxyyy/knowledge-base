# 片上网络 NoC

> 对应 Hennessy & Patterson 量化方法多核互连章与 NoC 研究文献。

## 一、背景与挑战
多核（数十到数百核）下，总线或交叉开关面积与功耗爆炸。NoC 用分组交换的网络（路由器+链路）替代全局总线，提供可扩展带宽。

## 二、核心原理
典型 2D 网格（mesh）中每节点为路由器，连接相邻路由器与本地核。包沿 XY 路由（先横后纵）到达目的。虚通道（VC）缓解头阻塞。

## 三、形式化与数学基础
mesh 直径（最远跳数）：
$$D = 2(\sqrt{k}-1)$$
其中 $k$ 为节点数（方形网格）。平均延迟随跳数增长：
$$Latency \approx Hops \times (RouterDelay + LinkDelay)$$

## 四、代码实现
```c
// XY路由决策(简化)
void route(int cur_x, int cur_y, int dst_x, int dst_y, int *nx, int *ny){
    if (cur_x < dst_x) *nx = cur_x+1, *ny = cur_y;      // 先向东
    else if (cur_x > dst_x) *nx = cur_x-1, *ny = cur_y; // 向西
    else if (cur_y < dst_y) *nx = cur_x, *ny = cur_y+1; // 再向北
    else *nx = cur_x, *ny = cur_y;                      // 到达
}
```

## 五、与其他技术对比
共享总线简单但不可扩展；交叉开关低延迟但 $O(n^2)$ 面积；NoC 在可扩展性上最佳，代价是路由与缓冲延迟。

## 六、常见误区
误以为 NoC 总是比总线快：小核数下总线更简单高效。误以为 mesh 无死锁：需路由约束（如 XY）避免环。

## 七、与开源书/权威来源对应
量化方法互连网络；计算机体系结构 NoC 教材；mit-pdos/6.824 分布式路由类比。

## 八、面试题
问：XY 路由如何避免死锁？答：单调维度顺序消除循环等待。

## 九、演进与趋势
拓扑多样化（环、蝶形）、光电混合、以及缓存一致 NoC。

## 十、小结
NoC 把"网络"思想引入芯片，是多核可扩展互连的必然选择。
