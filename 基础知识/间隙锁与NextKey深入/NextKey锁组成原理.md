# NextKey锁组成原理

> 对应 MySQL InnoDB 官方文档「Next-Key Locks」与经典 B+Tree 区间锁论文，参考 cmu-db/15445-course。

## 一、背景与挑战
单独记录锁或间隙锁都不够：要同时防止修改已有行与插入新行，需把「间隙 + 记录」合为一个左开右闭区间锁——这就是 Next-Key Lock。

## 二、核心原理
Next-Key Lock = 间隙锁（锁住记录前的区间）+ 记录锁（锁住该记录本身），区间为 $(prev, curr]$。InnoDB 在 RR 下默认对扫描到的索引记录加 Next-Key Lock，从而既挡住区间插入、又挡住当前行修改，完整封锁幻读路径。

## 三、形式化与数学基础
对索引记录 $k_i$，Next-Key 锁覆盖：
$$ (k_{i-1}, k_i] $$
插入 $v \in (k_{i-1}, k_i)$ 或更新使某行移入该区间皆被阻。全表扫描时等价于锁住 $(-\infty, +\infty]$ 的连续区间链。

## 四、代码实现
```sql
-- RR 下范围更新默认加 Next-Key Lock
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
BEGIN;
UPDATE t SET v=1 WHERE id < 100;   -- 对扫描记录加 (prev,id] 锁
COMMIT;
```

## 五、与其他技术对比
SQL Server 的键范围锁（key-range lock）概念类似，也用于串行化下防幻读。PostgreSQL 串行化用谓词锁（predicate lock）表达「某查询条件区间」，更细粒度且对应用透明。

## 六、常见误区
认为 Next-Key 锁只锁记录——它含左侧间隙。认为 RC 下也有 Next-Key——InnoDB 在 READ COMMITTED 下退化，通常只加记录锁、禁间隙锁（外键与唯一性检查除外）。

## 七、与开源书/权威来源对应
InnoDB 官方「Next-Key Locks」文档；cmu-db/15445-course 并发控制章节。

## 八、面试题
问：Next-Key Lock 区间形式？答：左开右闭 $(prev, curr]$，含间隙与记录。问：RR 为何用它？答：同时防插入新行与改现有行，杜绝幻读。

## 九、演进与趋势
更精确的谓词/区间锁减少过度封锁，提升并发，是锁系统演进方向。

## 十、小结
Next-Key Lock 是间隙锁与记录锁的并集，以左开右闭区间在 RR 下完整防幻读。
