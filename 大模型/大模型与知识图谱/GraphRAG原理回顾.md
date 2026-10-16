# GraphRAG 原理回顾

> 对应 Microsoft GraphRAG (Edge et al., 2024) 及开源仓库 github.com/microsoft/graphrag；社区变体 LazyGraphRAG、RAPTOR 层次摘要；与本仓库「RAG」「Agentic检索与GraphRAG前沿」「大模型与知识图谱」互补。把实体关系图与社群摘要接进检索增强的经典范式回顾。

## 一、背景与挑战

朴素向量 RAG 把文档切块嵌入，对局部片段召回有效，但两类问题长期难解：

1. **全局问题**：「这批合同整体风险主题是什么？」「全书有哪些反复出现的技术债模式？」——答案分散在无数 chunk 中，没有哪个 chunk 单独包含结论。
2. **结构关系问题**：实体之间的多跳关系（A 的供应商 B 是否同时服务竞品 C）需要**联结与聚合**，向量相似度只能找「文风像的句子」，不能做关系推理。

知识图谱（KG）擅长结构查询，但传统 KG 问答路径死板、覆盖依赖抽取质量；LLM 擅长总结与表达，但缺全局实体结构。GraphRAG 的主张：**用 LLM 从语料构建实体-关系图 + 社群检测 + 分层摘要**，查询时把「局部实体子图」与「全局社群摘要」一起喂给生成模型，兼得结构与语言。

挑战在于：图构建是一次性重成本 LLM 调用；垃圾进则垃圾图；小数据集上 ROI 可能不如「多路召回 + 重排」。

## 二、核心原理

### 2.1 索引流水线（以 Microsoft GraphRAG 为纲）

```text
语料
 → 分块
 → LLM 实体/关系抽取（名称、类型、描述、来源 chunk）
 → 实体合并（同名/共指消解启发式）
 → 动态社区检测（Leiden 等）
 → 社群摘要（LLM 对社区成员实体+关系生成要点）
 → （可选）社区嵌入，建向量索引
```

- **节点**：实体，带类型与自然语言描述（往往是 LLM 生成的浓缩传记）。
- **边**：关系，带权重（共现/抽取置信）与描述。
- **社区**：图划分得到的簇；**上层社区覆盖更粗主题**，形成摘要树。
- **查询资源库**：实体表、关系表、社区摘要、原始 chunk——多种「证据类型」。

### 2.2 两类经典查询模式

| 模式 | 适用 | 机制 |
| --- | --- | --- |
| **Local Search** | 具体实体/关系问答 | 以 query 实体为锚，扩展邻居与相关 chunk，拼进上下文 |
| **Global Search** | 主题、对比、全景 | 用社区摘要作中间答案，LLM map-reduce 汇总 |

Global 是 GraphRAG 相对向量 RAG 的差异化能力：先让各社区「各说各的摘要」，再全局综合，避免「随机 chunk 采样」的偏差。

### 2.3 抽取与合并细节

抽取 prompt 要求输出结构化 JSON（实体名、类型、描述、关系三元组）；合并阶段常用归一化名称 + 嵌入相似度或 LLM 判等。描述质量决定后续检索——过短没信息，过长污染上下文。社区划分用 Leiden 等可重复算法，层级由分辨率/迭代合并控制。

## 三、形式化与数学基础

把索引结果视为带权图 $G=(V,E)$，$V$ 实体，$E$ 关系。社区划分 $\mathcal{C}=\{C_1..C_m\}$ 最大化模块度或类似目标：

$$ Q=\frac{1}{2|E|}\sum_{ij}\Big(A_{ij}-\frac{k_i k_j}{2|E|}\Big)\delta(c_i,c_j) $$

每个社区生成摘要文本 $s(C_i)$，并可嵌入 $e(s(C_i))$。查询 $q$ 时：

- Global：检索相关社区集 $\mathcal{C}_q$，对 $\{s(C):C\in\mathcal{C}_q\}$ 做 LLM 汇总；
- Local：实体锚点 $v^*$，取 $B$ 跳邻居 $\mathrm{N}_B(v^*)$ 对应子图与源 chunk 的并集为上下文 $X(q)$。

相关度可用混合分：

$$ \text{score}(q,X)=\lambda_1 s_{\text{vec}}+\lambda_2 s_{\text{graph}}+\lambda_3 s_{\text{summary}} $$

成本模型：索引期 LLM 调用次数约 $\mathcal{O}(|\text{chunks}| + |V| + |\mathcal{C}|)$，与图规模同阶；查询期 Local 接近一次 RAG，Global 接近对 $O(m')$ 个摘要的 map-reduce。

## 四、代码实现

```python
# 概念级：Microsoft GraphRAG 的使用形态（伪配置驱动）
# 1) 索引（昂贵，一次性）
# graphrag index --root ./ragtest
#
# 2) 本地搜索：实体驱动
# graphrag query --method local --root ./ragtest -q "供应商A的风险链路？"
#
# 3) 全局搜索：社区摘要驱动
# graphrag query --method global --root ./ragtest -q "整体有哪些合规主题？"

# 自建极简骨架
from dataclasses import dataclass

@dataclass
class Entity:
    name: str
    etype: str
    desc: str
    source_chunks: list[str]

@dataclass
class Community:
    id: str
    entity_names: list[str]
    summary: str
    level: int

def local_context(ent_index, query_entities, hops=1, max_chars=6000):
    nodes = expand(ent_index, query_entities, hops=hops)
    rels  = ent_index.relations(nodes)
    chunks= ent_index.chunks(nodes)
    return trim(render_subgraph(nodes, rels) + "\n\n" + "\n".join(chunks), max_chars)

def global_answer(communities, query, llm, top_k=20):
    picked = rank_summaries(communities, query)[:top_k]
    partials = [llm(f"基于社区摘要回答：\n{s}\n问题：{query}") for s in picked]
    return llm("综合以下各社区结论：\n" + "\n".join(partials))
```

自建时优先复用开源抽取与社区模块，把预算花在**抽取质量评测**与**摘要去重**上，而不是重写划分算法。

## 五、与其他对比

| 方案 | 全局主题 | 多跳关系 | 索引成本 | 查询延迟 |
| --- | --- | --- | --- | --- |
| 向量 RAG | 弱 | 弱 | 低 | 低 |
| 多路召回+重排 | 中 | 弱 | 低 | 中 |
| 传统 KGQA | 弱（模板） | 强 | 高（人工/抽取） | 中 |
| **GraphRAG** | **强** | 中～强 | **高（LLM 抽）** | 中～高 |
| RAPTOR 层次树 | 中～强 | 弱 | 中 | 中 |

与 **HyDE / 多查询扩展**：仍停留在文本查询改写，无实体图。与 **Agentic 检索**：Agent 可多次调用 Local Search 与工具，与 GraphRAG 正交可叠加。

## 六、常见误区

1. **小知识库也上 GraphRAG**——抽取与摘要成本可能超过收益；先试强 baseline。
2. **图构建完不用管质量**——共指错误会污染邻居扩展；要有实体消解与人工抽检。
3. **GraphRAG 替代向量库**——原始 chunk 检索仍在；图是**额外索引**不是唯一通路。
4. **Global 一定比向量全局好**——社区切错或摘要过粗时，会「自信地概括偏」。
5. **可以实时增删文档零成本**——增量维护图与社区摘要有工程难度，常需局部重建。

## 七、与开源书·权威来源对应

- Edge et al., *From Local to Global: A Graph RAG Approach to Query-Focused Summarization*, 2024。
- microsoft/graphrag 开源实现与文档。
- RAPTOR（层次聚类摘要树）、HippoRAG（记忆启发图检索）等对照工作。
- llm-universe、LangChain/LlamaIndex Graph 组件实践。
- 本仓库 RAG / Agentic 检索前沿篇章。

## 八、面试题

**1. GraphRAG 的社群摘要解决什么问题？**  
要点：全局/主题类问题需要跨文档综合；把社区当作「中层主题单元」先摘要再汇总，避免从 chunk 随机采样的偏置。

**2. Local 与 Global 查询差别？**  
要点：Local 以实体锚扩展子图与源块，答具体关系；Global 聚合社区摘要做 map-reduce，答全景主题。

**3. 索引为何贵？**  
要点：对每块做 LLM 实体/关系抽取，再对每个社区做 LLM 摘要，调用次数与语料块数和社区数同阶。

**4. 何时不该用 GraphRAG？**  
要点：数据量小、问题多为单段事实、预算紧、或实体噪声极大且无评测集时；先向量+重排基线。

**5. 如何评测 GraphRAG？**  
要点：构造全局/多跳/局部三类问题集，对比向量 RAG 的准确性与引用可追溯性；监控抽取幻觉率与摘要冲突率。

## 九、演进与趋势

- **LazyGraphRAG**：降低索引期抽取密度，查询时再精抽，平衡成本。
- **与 Agent 工具化**：把 Local/Global 变成 tool call，LLM 编排多跳。
- **动态图更新**：增量实体合并与社区局部修复。
- **多模态图**：表、图、截图节点与文本实体对齐。
- **评测标准化**：从开放问答转向「引用边完整性」「关系链准确率」等图特指标。

## 十、小结

GraphRAG = **LLM 抽图 + 社区分层摘要 + Local/Global 双查询**。它把 RAG 从「找相似段落」升级为「组织实体与主题」，特别擅长全局综述与多跳关系。工程上把它当**重索引方案**：先评估问题形态与预算，用可复现的开源流水线起盘，用分类评测集证明比向量基线多赚的准确率是否撑得起索引成本。
