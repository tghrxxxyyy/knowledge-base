# 路由表与FIB的区别

> 对应 Linux 路由子系统与网络文档（route vs FIB）。

## 一、背景与挑战
常有人混淆「路由表（RIB）」与「转发表（FIB）」。前者是控制平面收集的所有路由信息，后者是数据平面实际用于转发的最小集合。二者分离影响性能与一致性。

## 二、核心原理
路由表 RIB 由路由协议（BGP/OSPF）、静态配置、内核接口路由共同填充，可能含到同一目的的多条候选（含备选、未激活）。FIB 是 RIB 经「最佳路径选择」展开后的转发信息库，每个目的对应唯一下一跳与出接口，供快速查表。Linux 中 `ip route` 看 RIB，`ip fib`/内核 `fib_lookup` 用 FIB。

## 三、形式化与数学基础
RIB 到 FIB 的映射为 chọn 优选函数：
$$ FIB = \{ (d, next(d)) \mid d \in \text{destinations},\ next(d) = \text{best}(RIB(d)) \} $$
其中 best 依管理距离/度量选出单条活动路由。

## 四、代码实现
Linux 查看二者：
```bash
ip route show table all   # RIB
ip route get 1.1.1.1      # 触发 FIB 查找结果
cat /proc/net/route       # 内核转发表（简化）
```
路由协议守护进程（如 bird、quagga）写入 RIB，内核同步到 FIB。

## 五、与其他技术对比
分布式路由器中 RIB 在控制卡、FIB 下发到线卡 TCAM；Linux 主机 RIB/FIB 同在内核但逻辑分离，重新收敛时先改 RIB 再刷新 FIB。

## 六、常见误区
误区一是认为改了路由表立即生效于转发，某些平台需 FIB 编程延迟。误区二是 FIB 含所有路由，实际只含被选定的活动路由。

## 七、与开源书/权威来源对应
网络教材（如 Kurose & Ross 第4章）区分路由选择（控制）与转发（数据）；Linux 内核文档描述 fib_lookup。

## 八、面试题
问：为什么 RIB 和 FIB 要分开？答：RIB 保存全部策略与备选便于收敛与计算，FIB 只保留转发所需的优化结果以提升查表速度与硬件下发效率。

## 九、演进与趋势
SDN 将 RIB 逻辑上收到控制器，FIB 仍分布到交换机；IPv6 下 FIB 规模更大推动更高效结构。

## 十、小结
路由表（RIB）是控制平面的全量候选，转发表（FIB）是数据平面的最优活动集合。二者分离兼顾策略完整性与转发性能。
