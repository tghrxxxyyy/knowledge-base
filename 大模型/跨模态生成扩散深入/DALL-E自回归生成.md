# DALL-E自回归生成

> 对应 Ramesh et al., *Zero-Shot Text-to-Image Generation (DALL-E)*, 2021；van den Oord et al., *VQ-VAE*, 2017。

## 一、背景与挑战

除扩散外，另一种路线是把图像离散化为 token，与文本 token 拼接做自回归生成。

## 二、核心原理

用 VQ-VAE 把图像编码为离散码本索引序列；文本与图像 token 拼在一起，用 Transformer 自回归预测图像 token，再解码回图像。DALL-E 2 则转向扩散（unCLIP）。

## 三、数学形式

自回归似然：

$$p(x|y) = \prod_{i=1}^{n^2} p_\theta(x_i | x_{<i}, y)$$

$x_i$ 为图像离散 token。

## 四、代码实现

```python
img_tokens = vqvae.encode(x)            # [n*n]
seq = concat(text_tokens, img_tokens)
logits = transformer(seq)
```

## 五、与其他对比

- 与 潜在扩散与SD 对照两种文生图范式。
- 与 多模态指令微调深入 共享离散 token 思路。

## 六、常见误区

- 把自回归与扩散混为一谈；二者训练目标不同。
- 忽视码本坍塌影响多样性。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 自回归文生图流程？答：图像离散化为 token，与文本拼序列，Transformer 自回归生成后解码。

## 九、演进

VQ-VAE → DALL-E → unCLIP(扩散) → 统一 tokenizer。

## 十、小结

离散 token 自回归是文生图的重要路线，与扩散互补。
