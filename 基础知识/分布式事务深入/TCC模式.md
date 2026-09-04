# TCC模式

> 对应分布式事务工业实践（支付宝/华为 TCC 框架），以及 DDIA 补偿事务讨论。

## 一、背景与挑战
Saga 的补偿是事后反向，可能在失败前已被外部观察到中间状态。TCC（Try-Confirm-Cancel）把每个操作显式分为三阶段，更可控地管理资源预留。

## 二、核心原理
TCC 三阶段：Try 预留资源（如冻结额度，不真正提交）；Confirm 真正提交（需幂等，仅在 Try 全成功后调用）；Cancel 释放预留。业务侵入强，但状态可控、隔离性优于 Saga。

## 三、形式化 / 数学基础
每服务实现 $(Try_i, Confirm_i, Cancel_i)$ 且 Confirm/Cancel 幂等。全局成功：$Try_1\dots Try_n \to Confirm_1\dots Confirm_n$；失败：$\to Cancel_n\dots Cancel_1$。Try 阶段持有预留锁。

## 四、代码实现
```java
@TwoPhase(action = "transfer")
class Transfer {
  boolean try()   { freeze(from, amt); freeze(to, amt); return true; }
  void confirm()  { commit(from); commit(to); }
  void cancel()   { unfreeze(from); unfreeze(to); }
}
```

## 五、与其他技术对比
| 模式 | 侵入 | 隔离 | 复杂度 |
|------|------|------|--------|
| Saga | 中 | 弱 | 中 |
| TCC | 强 | 较强 | 高 |
| 2PC | 低 | 强 | 中 |

## 六、常见误区
1. TCC 无需补偿——Cancel 即补偿。
2. Confirm 不幂等也行——网络重试会重复提交。
3. Try 就扣款——应在 Confirm 才真正生效。

## 七、与开源书 / 权威来源对应
- DDIA 中文补偿事务: https://github.com/Vonng/ddia
- 工业 TCC 框架文档（Seata 等）.
- CS-Notes 分布式: https://github.com/CyC2018/CS-Notes

## 八、面试题
1. TCC 三阶段各自职责？
2. 为什么 Confirm/Cancel 必须幂等？
3. TCC 相比 Saga 的优势？

## 九、演进与趋势
框架（Seata、dtm）自动编排 TCC 与 Saga，结合幂等表与空回滚/防悬挂处理边界。

## 十、小结
TCC 以 Try 预留、Confirm/Cancel 提交释放，提供比 Saga 更可控的隔离，代价是强业务侵入与幂等要求。
