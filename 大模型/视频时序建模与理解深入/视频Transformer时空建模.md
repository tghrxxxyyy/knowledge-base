# 视频Transformer时空建模

> 对应 Arnab et al. 2021 「ViViT: Video Vision Transformer」及 Bertasius et al. 2021 「TimeSformer」。

## 一、背景与挑战

视频比图像多一维时间，直接展开为帧序列 token 量爆炸。如何在时空联合建模与计算成本间平衡，是视频理解核心。挑战包括长程依赖、帧间冗余与位置编码设计。

## 二、核心原理

ViViT 提出多种分解：联合时空注意力（高开销）、因子化注意力（先空间后时间）、轴向注意力等。TimeSformer 采用 divided attention：对每个 token 先在其所属帧内做空间自注意力，再跨时间做时间自注意力，复杂度由 O((TN)^2) 降为 O(TN^2+NT^2)。

## 三、数学形式

时空位置嵌入分解为 E_{pos}=E_{space}+E_{time}。Divided attention：
z^{sp} = \mathrm{MSA}_{space}(\mathrm{LN}(z))+z
z^{time}= \mathrm{MSA}_{time}(\mathrm{LN}(z^{sp}))+z^{sp}
其中空间注意力仅在同帧 token 间，时间注意力仅跨帧同位置。

## 四、代码实现

```python
def divided_attn(x, n_frames, n_patch):
    x = x.reshape(-1, n_frames, n_patch, x.size(-1))
    sp = spatial_attn(x)                 # 帧内
    tm = temporal_attn(sp.transpose(1,2).reshape(-1,n_frames,x.size(-1)))
    return tm
```

## 五、与其他对比

相比 3D CNN（I3D、SlowFast），Transformer 长程建模更强、可扩展；相比 uniform 时空注意力，因子化大幅降算力；TimeSformer 在长视频上尤占优。代价是数据需求大。

## 六、常见误区

以为直接用 ViT 逐帧即可，实则忽略时间交互；混淆帧内与跨帧注意力顺序；忽略位置编码需含时间维；误用过多帧致 OOM。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer

## 八、面试题

- Q：TimeSformer divided attention 好处？答：分解时空注意力，降复杂度且长程更优。
- Q：视频位置编码？答：空间+时间可分解嵌入。
- Q：为何不直接时空联合？答：计算随 (TN)^2 爆炸。

## 九、演进

从 ViViT 到 VideoMAE 自监督；与 LLM 结合做视频对话；时空 token 压缩（如压缩感知）降序列长度。

## 十、小结

视频 Transformer 通过时空分解注意力在性能与效率间取得平衡，是视频理解从 CNN 走向统一多模态建模的关键一步。
