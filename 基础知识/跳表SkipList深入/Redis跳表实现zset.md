# Redis跳表实现zset

> 对应 CyC2018/CS-Notes。

## 一、背景与挑战
Redis 的 `zset`（有序集合）需要按分值排序、按排名范围取元素、按分值范围取元素。底层用「跳表 + 哈希表」组合实现。

## 二、核心原理
跳表按分值（score）有序存储元素，支持 $O(\log n)$ 插入与范围遍历；哈希表按成员（member）映射到分值，支持 $O(1)$ 查分。节点还存「跨度的 span」以 $O(\log n)$ 求排名。

## 三、形式化与数学基础
插入/删除/按排名取 $O(\log n)$；查分值 $O(1)$（哈希）。`span` 累加使 `zrank` 不必遍历。总空间 $O(n)$。

## 四、代码实现
```python
class ZNode:
    def __init__(self, member, score, level):
        self.member = member
        self.score = score
        self.forward = [None] * (level + 1)
        self.span = [0] * (level + 1)
class ZSet:
    def __init__(self):
        self.head = ZNode(None, 0, 32)
        self.hmap = {}
    def add(self, member, score):
        self.hmap[member] = score
        update = [None] * 33
        cur = self.head
        for i in range(32, -1, -1):
            while cur.forward[i] and (cur.forward[i].score < score or
                  (cur.forward[i].score == score and cur.forward[i].member < member)):
                cur = cur.forward[i]
            update[i] = cur
        lvl = random_level()
        node = ZNode(member, score, lvl)
        for i in range(lvl + 1):
            node.forward[i] = update[i].forward[i]
            update[i].forward[i] = node
```

## 五、与其他技术对比
Redis 未用红黑树：跳表范围查询缓存友好、实现简单，且 zrank 借助 span 高效。哈希表补充分值查询。

## 六、常见误区
忽略同分值时按 member 字典序排序，会破坏稳定性；误以为跳表单独即可 $O(1)$ 查成员分值（需哈希配合）。

## 七、与开源书/权威来源对应
Redis 源码 `t_zset.c`；CyC2018/CS-Notes 的 Redis 对象与数据结构章节。

## 八、面试题
为什么 zset 用跳表+哈希而非平衡树？span 字段的作用？

## 九、演进与趋势
Redis 在较小 zset 时退化为紧凑的 listpack 以省内存，超过阈值再转跳表。

## 十、小结
Redis zset 以跳表保证有序与范围操作、以哈希保证按成员查分，span 字段加速排名计算。
