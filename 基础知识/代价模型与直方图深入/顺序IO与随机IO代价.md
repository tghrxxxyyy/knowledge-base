# 顺序IO与随机IO代价

> 对应 Silberschatz 第13章 IO 代价模型与 PostgreSQL cost constants，参考存储硬件特性。

## 一、背景与挑战
顺序 IO 可批量预读、吞吐高；随机 IO 受寻道与旋转延迟拖累。代价模型如何量化二者差距，直接决定扫描 vs 索引的选择。

## 二、核心原理
HDD 上随机 IO 比顺序 IO 慢一个数量级，故 `random_page_cost` 默认设为 `seq_page_cost` 的 4 倍。SSD 无机械寻道，差距缩小到约 1:1.1。代价模型据此对索引回表的随机读加重惩罚。

## 三、形式化与数学基础
设顺序带宽 $B_s$、随机 IOPS 受限的平均每页代价 $C_r$：
$$ \frac{random\_page\_cost}{seq\_page\_cost} \approx \frac{C_r}{C_s} $$
HDD 下该比约 4–10，SSD 下约 1–2。

## 四、代码实现
```sql
-- HDD 保持默认，SSD 调低
SET random_page_cost = 1.1;
-- 验证计划变化
EXPLAIN SELECT * FROM t WHERE indexed_col BETWEEN 1 AND 1000;
```

## 五、与其他技术对比
LSM-tree（O'Neil 1996）以顺序写为核心，把随机写转成顺序写+后台合并，从根本上规避随机 IO；其读代价则来自多层合并查。列式存储顺序读列极快。

## 六、常见误区
把 HDD 的代价参数套在 SSD 上——会低估索引、过度倾向顺序扫。认为 NVMe 下随机=顺序——仍有队列与粒度差异。

## 七、与开源书/权威来源对应
Silberschatz 13.2「Measures of Query Cost」；PostgreSQL cost constants 文档。

## 八、面试题
问：为何索引在 SSD 上更吃香？答：random/seq 代价比下降，回表随机读惩罚减小，优化器更愿用索引。

## 九、演进与趋势
存储级感知代价（如 ZNS SSD、分级存储）让代价模型纳入更多硬件维度。

## 十、小结
顺序与随机 IO 代价比是扫描策略的阀门，必须随介质更新。
