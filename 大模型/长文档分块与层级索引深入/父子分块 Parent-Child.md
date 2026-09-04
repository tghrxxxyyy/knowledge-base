# 父子分块 Parent-Child

> 对应 run-llama/llama_index 的 ParentDocumentRetriever 与 facebookresearch/faiss 向量检索。

## 一、背景与挑战
小块检索精准但上下文不足，大块上下文全但检索噪声大。父子分块用小块做检索、用其父大块喂给 LLM，兼得两者。

## 二、核心原理
文档先切为大父块，父块再切为小子块并对子块建向量索引。检索命中子块后，回溯其所属父块（或兄弟子块）作为上下文传给生成器。

## 三、形式化与数学基础
设父块 $P_i$ 含子块 $\{c_{i,1},\dots\}$，检索得子块 $c^*$：
$\text{context} = P_{g(c^*)} \quad\text{或}\quad \bigcup_{j} c_{g(c^*),j}$
其中 $g$ 返回子块所属父块，保证生成上下文完整。

## 四、代码实现
```python
def parent_child_retrieve(q, child_index, parent_map, k=4):
    child_hits = child_index.search(q, k)
    parents = {parent_map[c] for c in child_hits}
    return [parent_text(p) for p in parents]
```

## 五、与其他技术对比
相比单一大小分块，父子分块在检索精度与生成上下文间取得平衡；代价是需维护子-父映射并可能返回较大上下文。

## 六、常见误区
误区一：父块越大越好，过大又回到噪声问题。误区二：只回父块忽略相邻子块，可能缺关键句。

## 七、与开源书/权威来源对应
- run-llama/llama_index 的 ParentDocumentRetriever。
- facebookresearch/faiss 承载子块向量。
- Lewis et al. 2020 检索基础。

## 八、面试题
1. 父子分块如何解决小块上下文缺失？
2. 父块大小如何取舍？
3. 与层级索引有何异同？

## 九、演进与趋势
结合语义边界自动定父子粒度，并把兄弟子块按相关性裁剪以控上下文长度。

## 十、小结
父子分块用小检大答，是平衡检索精度与生成质量的经典技巧。
