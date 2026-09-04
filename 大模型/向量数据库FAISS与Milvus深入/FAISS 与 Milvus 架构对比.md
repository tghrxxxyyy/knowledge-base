# FAISS 与 Milvus 架构对比

> 对应 facebookresearch/faiss 向量检索库与 Kwon et al. 2023 vLLM 高效服务及 run-llama/llama_index 集成。

## 一、背景与挑战
FAISS 是单机向量检索算法库，需自行搭服务、管理元数据与扩展。Milvus 等系统在此基础上提供分布式、多索引、元数据过滤与生产级服务。理解二者定位差异才能选型。

## 二、核心原理
FAISS 提供索引内核（IVF/PQ/HNSW 等）与计算原语，无内置服务/持久化。Milvus 类系统以 FAISS/自有引擎为底层，叠加分片、副本、写入流水线与查询语言，形成完整向量数据库。

## 三、形式化与数学基础
检索延迟模型可分解为：
$T = T_{\text{index}} + T_{\text{filter}} + T_{\text{net}}$
FAISS 仅优化 $T_{\text{index}}$；系统层还要优化过滤与网络/分布式开销，整体 $T$ 受架构影响。

## 四、代码实现
```python
# FAISS: 库，需自己服务化
import faiss
idx = faiss.IndexFlatL2(128); idx.add(data)
# 系统层通常提供: connect(); create_collection(); insert(); search(filter=...)
```

## 五、与其他技术对比
相比 FAISS 轻量可控，系统方案更易扩展与运维但更重。小规模/嵌入式用 FAISS，企业级多租户用向量数据库。二者底层算法同源。

## 六、常见误区
误区一：FAISS 就是数据库，实则需自建服务。误区二：系统一定更慢，现代向量库底层仍用同类算法并做了优化。

## 七、与开源书/权威来源对应
- facebookresearch/faiss 是底层索引基石。
- Kwon et al. 2023 vLLM 体现高效服务化思路。
- run-llama/llama_index 可对接多种向量后端。

## 八、面试题
1. 为什么 FAISS 不等于向量数据库？
2. 生产系统额外解决了哪些问题？
3. 何时应直接嵌 FAISS 而非上向量库？

## 九、演进与趋势
向量库走向存算分离、GPU 加速与混合检索（向量+标量过滤），底层继续借鉴 FAISS 算法。

## 十、小结
FAISS 提供算法内核，向量数据库提供工程外壳，二者是「引擎」与「整车」的关系。
