# HNSW图索引

> 对应 Malkov & Yashunin, *HNSW*, 2018。

## 一、背景与挑战

需亚线性查询且高召回；分层可导航小世界图实现。

## 二、核心原理

多层图：顶层稀疏长边快跳，底层稠密精搜；查询自顶向下贪心逼近近邻。

## 三、数学形式

每点连 $M$ 近邻；查询复杂度约 $O(\log N)$；召回随 $M$/efSearch 增。

## 四、代码实现

```python
index = hnswlib.Index(space="ip", dim=d)
index.build(x, M=16, ef_construction=200)
index.set_ef(64); idx = index.knn_query(q, k=10)
```

## 五、与其他对比

- 查询快、召回高，但内存占用大于 IVF+PQ。
- 与 向量数据库选型与调优实战 衔接。

## 六、常见误区

- efSearch 过小召回低；过大慢。
- 动态删改成本高（图结构不易更新）。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- HNSW 为何快？答：分层图提供对数级跳达近邻路径。

## 九、演进

NSW → HNSW → 磁盘友好变体（DiskANN）。

## 十、小结

HNSW 以分层图实现高召回低延迟，是生产向量库常用引擎。
