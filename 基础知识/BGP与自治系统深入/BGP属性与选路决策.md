# BGP属性与选路决策

> 对应 RFC 4271 第9节 (Decision Process) 与 RFC 4456。

## 一、背景与挑战
BGP 收到同一前缀的多条路径时需确定性地选出最佳并传播。选路依据一组有序属性与规则，错误理解会导致非预期流量路径或次优路由。

## 二、核心原理
BGP 属性分必遵（ORIGIN、AS_PATH、NEXT_HOP）、可选过渡（LOCAL_PREF、MED、Community、Aggregator）等。选路决策按固定优先级：最高 LOCAL_PREF → 最短 AS_PATH → 最低起源类型 → 最低 MED → eBGP 优于 iBGP → 最低 IGP 度量到 NEXT_HOP → 其余 tie-break（如 router-id）。

## 三、形式化与数学基础
决策函数近似：
$$ best = \arg\max_{\text{lex}} (LOCAL\_PREF,\ -|AS\_PATH|,\ -ORIGIN,\ -MED,\ type,\ -IGP\_metric,\ -router\_id) $$
其中 $\arg\max_{\text{lex}}$ 表示字典序比较，优先级从高到低。LOCAL_PREF 仅在 AS 内传递，MED 用于告知相邻 AS 偏好。

## 四、代码实现
设置 LOCAL_PREF 与 AS_PATH prepend：
```text
route-map SET_LP permit 10
 set local-preference 200
route-map PREPEND permit 10
 set as-path prepend 65001 65001
```
查看选路：
```bash
vtysh -c 'show ip bgp 8.8.8.0/24' | sed -n '1,40p'
```

## 五、与其他技术对比
IGP 用单一度量（cost）选路，BGP 用多属性策略，更贴合商业/运营意图。MED 类似「建议度量」但默认仅在同一相邻 AS 间比较。

## 六、常见误区
误区一是以为 MED 全局生效，实际默认只在同 AS 的相邻路由间比较。误区二是 LOCAL_PREF 会传给其他 AS，实际仅 AS 内有效。

## 七、与开源书/权威来源对应
RFC 4271 第9节定义决策过程；RFC 4456 反射器属性；CyC2018/CS-Notes 与 xiaolincoder 有 BGP 选路小结。

## 八、面试题
问：LOCAL_PREF 和 MED 区别？答：LOCAL_PREF 在 AS 内统一偏好、不出 AS；MED 是发给相邻 AS 的「入口建议」，作用域更小。

## 九、演进与趋势
Add-Path 与 BGP 流量工程扩展让选路更细；大规模网络用路由反射器减少 iBGP 全互联。

## 十、小结
BGP 以一组有序属性做确定性选路，理解 LOCAL_PREF、AS_PATH、MED 的语义与作用域是掌控域间流量路径的关键。
