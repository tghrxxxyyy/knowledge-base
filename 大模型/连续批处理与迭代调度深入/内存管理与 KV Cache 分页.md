# 内存管理与 KV Cache 分页

> 对应 Kwon 2023 vLLM; Dao 2022 FlashAttention; Ainslie 2023 GQA。

## 一、背景与挑战
KV Cache 随序列增长，传统连续预留造成碎片与浪费，限制并发数。

## 二、核心原理
PagedAttention 把 KV Cache 切成固定页（block），按需分配，序列逻辑连续、物理离散，类似操作系统虚拟内存。

## 三、形式化与数学基础
序列长度 L 需块数 ⌈L/b⌉。显存占用：
$ M = n_{seq} \cdot \lceil L/b \rceil \cdot b \cdot 2 \cdot n_{layers} \cdot d_{head} \cdot n_{heads} \cdot \text{prec} $
分页使碎片降至不足一块。

## 四、代码实现
```python
class BlockTable:
    def alloc(self, seq):
        self.table[seq] = []
    def append(self, seq, block):
        self.table[seq].append(block)   # 逻辑块 -> 物理块映射
```

## 五、与其他技术对比
连续缓存浪费 30%+ 显存；分页把利用率推到近 100%，直接提升并发。

## 六、常见误区
误区：分页有额外查表开销。块粒度大时开销可忽略，收益远大于成本。

## 七、与开源书/权威来源对应
Kwon et al. 2023 PagedAttention in vLLM。见 vllm-project/vllm。

## 八、面试题
问：PagedAttention 如何实现 Copy-on-Write？
答：分支序列共享物理块，写时才复制，省去 beam 多份 KV。

## 九、演进与趋势
分页与量化、分离式传输结合，成为显存管理标准。

## 十、小结
KV 分页把碎片与浪费降到最低，是连续批处理可扩展的关键。
