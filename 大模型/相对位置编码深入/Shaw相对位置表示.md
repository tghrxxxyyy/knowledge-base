# Shaw 相对位置表示

> 对应 Shaw, Uszkoreit, Vaswani, *Self-Attention with Relative Position Representations*, 2018（神经机器翻译）。

## 一、背景与挑战

机器翻译中词序高度依赖相对距离，绝对位置难表达“主谓隔多远”这类关系。

## 二、核心原理

在每一层注意力的键侧与值侧分别加相对位置表示：键侧加可学习的 $a_{i-j}$（相对距离向量），值侧加 $b_{i-j}$ 调整聚合权重；距离超阈值 $k$ 时裁剪到边界桶。

## 三、数学形式

$z_i = \sum_j \frac{\exp(e_{ij})}{\sum_{j'} \exp(e_{ij'})} (x_jW_V + b_{i-j})$，$e_{ij}=\frac{(x_iW_Q)(x_jW_K+a_{i-j})^T}{\sqrt d}$。

## 四、代码实现

```python
a = self.rel_k[clamp(i - j, -k, k)]          # 键侧相对向量
e = (q @ (k + a).transpose(-1, -2)) / d**0.5
w = torch.softmax(e, -1)
out = w @ (v + self.rel_v[clamp(i - j, -k, k)])
```

## 五、与其他对比

- 与 Transformer-XL 的分桶相对编码相似，但 XL 用正弦函数表示距离。
- 与 绝对位置编码深入 对比：位置信息进入注意力而非输入。

## 六、常见误区

- 值侧相对项 $b$ 常被忽略，其实它修正了值聚合。
- 距离裁剪桶数 $k$ 过小丢长距信息。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- Shaw 方案在键侧与值侧分别做了什么？答：键侧加相对向量调分数，值侧加相对向量调聚合。

## 九、演进

该工作确立“相对位置进注意力”范式，被 XL/T5/RoPE 继承发展。

## 十、小结

Shaw 的相对表示首次干净地把相对距离注入自注意力，是位置编码史上的关键一步。
