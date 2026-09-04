# ColBERT 延迟交互检索

> 对应 stanford-futuredata/ColBERT 开源仓库（Khattab & Zaharia 2020 原始论文思路）。

## 一、背景与挑战
双塔缺乏交互，交叉编码器无法扩展。ColBERT 提出「延迟交互」：在线保留 token 级向量，在打分阶段才做细粒度匹配。

## 二、核心原理
查询与文档各自经 BERT 得到 token 向量并做残差压缩（如 128 维）。文档向量离线建库。打分时对每个查询 token 取与文档 token 的最大相似度再求和（MaxSim），实现查询感知但可预索引的匹配。

## 三、形式化与数学基础
延迟交互分数：
$S(q,d) = \sum_{i=1}^{|q|} \max_{j=1}^{|d|} E_q(q_i)^\top E_d(d_j)$
其中 $|q|,|d|$ 为 token 数，MaxSim 使每个查询词匹配最相关的文档词。

## 四、代码实现
```python
def colbert_score(q_emb, d_emb):
    # q_emb: (Lq, h), d_emb: (Ld, h)
    sim = q_emb @ d_emb.T          # (Lq, Ld)
    return sim.max(axis=1).sum()   # MaxSim 求和
```

## 五、与其他技术对比
精度接近交叉编码器，吞吐接近双塔；代价是存储开销大（每文档需存 token 矩阵），需用压缩与残差减小维度。

## 六、常见误区
误区一：以为 ColBERT 存储与双塔相同，实际需存 token 级向量。误区二：忽略查询长度对打分成本的影响。

## 七、与开源书/权威来源对应
- stanford-futuredata/ColBERT 是延迟交互检索参考实现。
- Devlin et al. 2018 的 BERT 提供 token 编码器。
- Lewis et al. 2020 的检索增强强调交互质量。

## 八、面试题
1. MaxSim 相比点积有何检索学优势？
2. 如何压缩 ColBERT 的存储开销？
3. 延迟交互为何仍能做近似最近邻检索？

## 九、演进与趋势
ColBERTv2 引入残差压缩与质心索引，进一步降本；并与重排阶段融合形成多级检索。

## 十、小结
延迟交互在效率与精度间取得平衡，是大规模语义检索的重要架构。
