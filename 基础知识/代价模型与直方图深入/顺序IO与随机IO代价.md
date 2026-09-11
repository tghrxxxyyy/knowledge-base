# 顺序IO与随机IO代价

> 对应 Silberschatz《Database System Concepts》IO 代价章节、O'Neil 1996 LSM-tree 与 PostgreSQL cost constants。

## 一、背景与挑战
存储访问有两种基本模式：顺序 IO 可批量预读、吞吐高；随机 IO 受寻道与访问粒度拖累、延迟高且吞吐低。
代价模型如何量化二者差距，直接决定优化器选择全表顺序扫描还是「索引扫描 + 回表随机读」。这个比值就是扫描策略的阀门。
在机械硬盘（HDD）时代，随机 IO 比顺序 IO 慢一个数量级，索引回表的随机读代价高昂，因此优化器对索引偏保守。
固态硬盘（SSD）没有机械寻道，随机与顺序差距被大幅压缩，索引变得更有吸引力，但默认参数常停留在 HDD 假设上。
核心挑战是：硬件在变，参数的隐含假设未必随之更新；不同介质、不同队列深度、不同粒度下，随机/顺序代价比差异显著。

## 二、核心原理
HDD 的随机读代价由寻道时间与旋转延迟主导，与传输时间相比占绝对多数，因此随机读远慢于顺序读。PostgreSQL 历史上把 `random_page_cost` 默认设为 `seq_page_cost` 的 4 倍即源于此。
SSD 用闪存与并行通道消除了机械延迟，随机读主要受限于 IOPS 与访问粒度，与顺序读的差距缩小到接近 1:1 到 1:2。
代价模型据此调整：对需要大量随机回表的索引扫描，若 `random_page_cost` 偏高，估算代价被放大，优化器宁可全表扫描。
反之，调低该参数会让索引回表更「便宜」，优化器更倾向利用选择性高的索引。
另一个关键点是缓存：命中缓冲池的页读代价近似内存访问，与介质无关。`effective_cache_size` 越大，随机读的有效代价越低，索引越有利。

## 三、形式化与数学基础
设顺序带宽为 $B_s$，随机访问平均每页代价为 $C_r$，顺序访问平均每页代价为 $C_s$，则代价比近似为：

$$ \frac{\text{random\_page\_cost}}{\text{seq\_page\_cost}} \approx \frac{C_r}{C_s} $$

对 HDD，$C_r$ 含寻道与旋转延迟，比值常在 4 到 10；对 SSD，该比值缩小到约 1 到 2。考虑缓存命中率 $h$ 后，随机读有效代价为：

$$ C_r^{\text{eff}} = h \cdot C_{\text{mem}} + (1-h) \cdot C_r $$

当 $h \to 1$ 时 $C_r^{\text{eff}} \to C_{\text{mem}}$，随机与顺序差距消失，索引回表几乎免费。全表扫描代价随页数线性增长：

$$ C_{\text{seqscan}} = P \cdot c_{seq} $$

索引扫描代价由索引页读与回表随机读组成，其选择取决于选择性 $s$：

$$ C_{\text{indexscan}} \approx P_{\text{idx}} \cdot c_{rand} + s \cdot N \cdot c_{rand}^{\text{eff}} $$

当 $s$ 足够小、$c_{rand}$ 又不太大时，索引扫描胜出；$s$ 增大或随机代价被高估时，顺序扫描胜出。

## 四、代码实现
```sql
-- HDD 保持较保守的默认；SSD 调低随机代价
SET random_page_cost = 1.1;
SET seq_page_cost = 1.0;
SET effective_cache_size = '16GB';

-- 验证不同参数下的计划差异
EXPLAIN (COSTS ON)
SELECT * FROM t WHERE indexed_col BETWEEN 1 AND 1000;

-- 对比全表扫描与索引扫描的代价构成
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM t WHERE indexed_col = 42;

-- 查看是否发生大量随机回表（Buffers 中的 read 与 hit）
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM t WHERE selective_col = 'rare_value';
```

## 五、与其他技术对比
| 存储/结构 | 顺序写 | 随机写 | 顺序读 | 随机读 |
|---|---|---|---|---|
| HDD | 快 | 慢（寻道） | 快 | 慢 |
| SSD | 快 | 中（写放大） | 快 | 较快 |
| B+ 树索引 | — | 随机页写 | 范围扫较快 | 点查随机 |
| LSM-tree | 快（追加） | 转顺序写 | 多层合并查 | 多层查 |
| 列式存储 | — | — | 极快（列扫描） | 点查较慢 |

LSM-tree（O'Neil 1996）把随机写转成顺序写加后台合并，从结构上规避随机写代价；其代价转移到读路径的多层查询，是典型的空间换顺序。

## 六、常见误区
- 把 HDD 的代价参数套在 SSD 上：会低估索引、过度倾向顺序扫描。
- 认为 NVMe 下随机等于顺序：仍有队列深度、访问粒度与 IOPS 上限的差异。
- 忽视缓存：大内存下随机回表可能并不昂贵，过于悲观的参数会错失好计划。
- 只调 `random_page_cost` 不看 `effective_cache_size`：两者共同决定有效随机代价。
- 认为顺序扫描总是浪费：当查询需返回大比例行时，顺序扫描往往更优。

## 七、与开源书·权威来源对应
- Silberschatz, Korth, Sudarshan《Database System Concepts》查询代价度量与磁盘访问章节。
- O'Neil, Cheng, Gawlick, O'Neil, 1996, *The Log-Structured Merge-Tree (LSM-Tree)*。
- PostgreSQL 官方文档「Planner Cost Constants」「Effective Cache Size」。
- Kleppmann《Designing Data-Intensive Applications》第 3 章讨论 B 树与 LSM 的读写权衡，具体结论以官方最新文档与论文为准。

## 八、面试题
1. 问：为何索引在 SSD 上更吃香？
   答：`random/seq` 代价比下降，回表随机读惩罚减小，优化器更愿用索引。
2. 问：顺序扫描何时优于索引扫描？
   答：当选择性低、需返回大量行时，顺序扫描避免了大量随机回表。
3. 问：缓存如何影响随机读代价？
   答：命中缓冲池的读近似内存访问，命中率越高有效随机代价越低。
4. 问：LSM-tree 的取舍是什么？
   答：以顺序写换取写吞吐，代价转移到读路径的多层合并查询与空间放大。
5. 问：调低 `random_page_cost` 有何风险？
   答：若硬件实际随机代价高（如 HDD 或高并发争用），会诱导优化器选择实际很慢的索引计划。

## 九、演进与趋势
- 存储级感知代价（ZNS SSD、分级存储）让代价模型纳入更多硬件维度。
- 自动硬件标定与工作负载感知调参在云数据库普及。
- 计算存储与持久内存改写随机/顺序的边界，代价模型需持续更新。
- 具体参数与推荐值以各数据库官方最新文档为准。

## 十、小结
顺序与随机 IO 代价比是扫描策略的阀门，必须随介质更新。HDD 下索引回表昂贵、优化器偏保守；SSD 下差距缩小、索引更有利；缓存进一步抹平差异。理解这一比值如何进入代价公式，才能解释并正确干预计划选择。
