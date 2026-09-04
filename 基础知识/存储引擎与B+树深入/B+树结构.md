# B+树结构

> 对应 Silberschatz《Database System Concepts》第 11 章 Indexing and Hashing，以及 CMU 15-445 Lecture 4-6 B+Tree。

## 一、背景与挑战
基于页的存储需要高效的范围查询与点查。二叉搜索树高度随数据量线性增长；B+ 树通过高扇出（fanout）将高度压到 3-4 层，使一次查询只需常数次磁盘 I/O。

## 二、核心原理
B+ 树是平衡多路搜索树：内部结点只存键值与子指针（用于路由），所有记录存于叶子结点，叶子间用双向链表串接以支持顺序扫描。阶（order）$m$ 要求每个结点有 $\lceil m/2 \rceil$ 到 $m$ 个子女。

## 三、形式化 / 数学基础
设页容量存 $b$ 个键，高度 $h$，则最多索引 $b^h$ 条记录。查找复杂度 $O(\log_b N)$。插入时若结点溢出则分裂，删除时若低于下限则合并或重分布。

## 四、代码实现
```python
def bplus_search(node, key):
    if node.is_leaf:
        return node.find(key)
    # 内部结点：找到第一个 >= key 的分界
    for i, k in enumerate(node.keys):
        if key < k:
            return bplus_search(node.children[i], key)
    return bplus_search(node.children[-1], key)
```

## 五、与其他技术对比
| 结构 | 范围查询 | 高度 | 用途 |
|------|----------|------|------|
| B 树 | 需中序遍历 | 相近 | 部分键值存内部 |
| B+ 树 | 叶子链表极快 | 低 | 数据库主索引 |
| 跳表 | 快 | 高 | Redis / LSM 内存层 |

## 六、常见误区
1. B+ 树内部结点存数据——错，只存路由键。
2. 扇出越大越好——过大页内线性扫描变慢，通常配合二分。
3. 高度为 0——空树或单页树才成立。

## 七、与开源书 / 权威来源对应
- Silberschatz《Database System Concepts》Chapter 11.
- CMU 15-445 B+Tree: https://github.com/cmu-db/15445-course
- CS-Notes 索引: https://github.com/CyC2018/CS-Notes

## 八、面试题
1. 为什么数据库选 B+ 树而非红黑树或哈希？
2. B+ 树插入分裂的过程？根分裂怎么处理？
3. 叶子链表的作用？

## 九、演进与趋势
LSM 引擎用跳表/布隆过滤器替代 B+ 树以应对写密集；但 B+ 树在读密集与范围查询上仍占优，并引入写时复制（Bw-Tree、UB-tree）支持 MVCC。

## 十、小结
B+ 树以高扇出与叶子链表兼顾点查与范围查询，是关系型数据库索引的基石；理解其分裂合并是性能调优的前提。
