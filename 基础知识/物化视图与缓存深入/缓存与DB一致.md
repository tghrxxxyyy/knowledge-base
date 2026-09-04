# 缓存与DB一致

> 对应分布式缓存一致性讨论（如 Facebook TAO、Cache 一致性论文），以及 DDIA 中文缓存章。

## 一、背景与挑战
当数据同时存在于缓存与数据库，二者可能不一致。强一致成本高，最终一致又可能读到旧值。如何在性能与正确间取舍是系统设计的经典难题。

## 二、核心原理
两种思路：以 DB 为权威（Cache-Aside，读回填、写失效，最终一致）；或以缓存为写入入口（Write-Through/Behind，由缓存负责落库，需处理丢失风险）。一致性强度取决于失效及时性与并发控制。

## 三、形式化 / 数学基础
定义不一致窗口 $W = t_{db\_change} \to t_{cache\_consistent}$。强一致要求 $W \to 0$（如写穿+锁），最终一致允许 $W > 0$ 但有上界（TTL 或失效延迟）。CAP 下缓存多取 AP + 最终一致。

## 四、代码实现
```python
# 读写均经缓存（Read-Through + Write-Through 示意）
def get(k):
    return cache.get(k) or db.load(k)
def put(k, v):
    db.save(k, v)        # 缓存层同步写库
    cache.set(k, v)
```

## 五、与其他技术对比
| 方案 | 权威 | 一致性 | 风险 |
|------|------|--------|------|
| Cache-Aside | DB | 最终 | 窗口脏读 |
| Write-Through | 缓存 | 较强 | 缓存丢则丢 |
| Write-Behind | 缓存 | 弱 | 丢更新 |

## 六、常见误区
1. 缓存与 DB 可强一致又高性能——存在固有权衡。
2. 删除缓存就一致——并发下仍可能脏。
3. Write-Behind 很安全——异步落库有丢失风险。

## 七、与开源书 / 权威来源对应
- DDIA 中文缓存章: https://github.com/Vonng/ddia
- Facebook TAO 缓存论文.
- CS-Notes 缓存: https://github.com/CyC2018/CS-Notes

## 八、面试题
1. 缓存与 DB 为何难强一致？
2. Cache-Aside 的不一致窗口来源？
3. Write-Behind 的风险？

## 九、演进与趋势
CDC 驱动失效、多级缓存一致性协议、以及把一致性逻辑下沉到代理层（如 ProxySQL、TAO）成为规模化方案。

## 十、小结
缓存与 DB 一致是性能与正确性的权衡；以 DB 权威 + 主动失效 + CDC 辅助是工程界最实用路线。
