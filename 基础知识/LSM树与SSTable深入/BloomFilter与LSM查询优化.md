# BloomFilter与LSM查询优化

> 对应 Chang et al. 2006（Bigtable 用 Bloom Filter 加速 SSTable 跳过），以及 Vonng/ddia 第 3 章。

## 一、背景与挑战
LSM 读需逐层查多个 SSTable，最坏情形读放大等于文件数。Bloom Filter 以少量内存为代价，把“某 key 不在该文件”的判定做到近乎零成本，从而跳过大量无关文件。

## 二、核心原理
每个 SSTable 对应一个 Bloom Filter：写入时把 key 经 $k$ 个哈希映射到 bit 数组置位；查询时若任一 bit 为 0 则 key 一定不在该文件（无假阴性），可安全跳过。它只优化“不存在”的查找与范围扫描前的文件剪枝。

## 三、形式化与数学基础
对 $n$ 个元素、$m$ 个 bit、$k$ 个哈希，误判率：
$$ P \approx \left(1 - e^{-kn/m}\right)^k $$
最优哈希数：
$$ k_{opt} = \frac{m}{n} \ln 2 $$
给定目标误判率 $P$，所需 bit 数：
$$ m = - \frac{n \ln P}{(\ln 2)^2} $$

## 四、代码实现
```python
# 简化 Bloom Filter（仅示意）
class Bloom:
    def __init__(self, m, k):
        self.bits = bytearray((m + 7) // 8)
        self.k = k
    def _set(self, h):
        self.bits[h >> 3] |= 1 << (h & 7)
    def add(self, key):
        for i in range(self.k):
            self._set(hash((key, i)) % (len(self.bits) * 8))
    def maybe(self, key):
        for i in range(self.k):
            h = hash((key, i)) % (len(self.bits) * 8)
            if not (self.bits[h >> 3] >> (h & 7)) & 1:
                return False
        return True
```

## 五、与其他技术对比
Bloom Filter 省内存但有误判（不省一次可能的错查）；Cuckoo Filter 支持删除且空间更优；SuRF（前缀）兼顾范围查询剪枝；位图适合低基数字段。

## 六、常见误区
1) 认为 Bloom Filter 能确认“存在”——只能说“可能存在”。
2) 误以为它能减少写放大——只优化读路径。
3) 过滤器本身不持久化会拖慢启动重建。

## 七、与开源书/权威来源对应
- Chang et al. 2006（Bigtable）。
- Vonng/ddia 第 3 章。
- cmu-db/15445-course（LSM 优化）。

## 八、面试题
1) Bloom Filter 为何无假阴性？
2) 给定误判率如何选 m 与 k？
3) 它减轻哪种放大？

## 九、演进与趋势
Cuckoo/SuRF 支持删除与范围剪枝、分层过滤器、基于热度动态调整过滤器精度。

## 十、小结
Bloom Filter 是 LSM 读放大的“第一道闸门”：用亚线性内存把不可能文件近乎零成本跳过，是点查性能的关键。
