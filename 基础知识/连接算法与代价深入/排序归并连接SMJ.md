# 排序归并连接SMJ

> 对应 Garcia-Molina《Database Systems: The Complete Book》第 14 章（Sort-Merge Join），以及 Silberschatz《Database System Concepts》第 15 章。

## 一、背景与挑战
当两个表已按连接键排序（或排序代价可接受）时，排序归并连接（SMJ）可用单遍归并完成连接，且天然产出有序结果，适合范围连接与需排序下游的场景。

## 二、核心原理
先确保两表按连接键排序（外部排序，若尚未有序），再用双指针归并：相等键匹配输出，重复键做笛卡尔积式配对。复杂度由排序与归并组成。

## 三、形式化与数学基础
排序代价（外部排序，缓冲 $B$）：
$$ Cost_{sort} = 2|R|\lceil \log_{B-1}(\lceil |R|/B \rceil) \rceil $$
归并代价：
$$ Cost_{merge} = |R| + |S| $$
总代价约 $O(|R|\log|R| + |S|\log|S| + |R|+|S|)$。

## 四、代码实现
```python
# 排序归并连接（仅示意，假设已排序）
def smj(R, S):
    i = j = 0
    while i < len(R) and j < len(S):
        if R[i].k < S[j].k: i += 1
        elif R[i].k > S[j].k: j += 1
        else:
            # 处理重复键
            j2 = j
            while j2 < len(S) and S[j2].k == R[i].k:
                emit(R[i], S[j2]); j2 += 1
            i += 1
```

## 五、与其他技术对比
SMJ 需排序但输出有序、省去哈希、适合磁盘友好顺序 IO；Hash Join 通常更快但不保证有序、需内存。SMJ 对不等连接（范围）更自然。

## 六、常见误区
1) 认为 SMJ 一定慢——已排序时极优。
2) 忽略重复键导致的局部笛卡尔积。
3) 误以为不需内存——外部排序也吃缓冲。

## 七、与开源书/权威来源对应
- Garcia-Molina《Database Systems: The Complete Book》第 14 章。
- Silberschatz《Database System Concepts》第 15 章。
- cmu-db/15445-course（join algorithms）。

## 八、面试题
1) SMJ 的代价组成？
2) 为何适合范围连接？
3) 重复键如何处理？

## 九、演进与趋势
并行外部排序、向量化归并、与列式排序结合、GPU 归并。

## 十、小结
SMJ 以“先排序后归并”换取有序输出与磁盘友好 IO，是排序已就绪场景的优选连接。
