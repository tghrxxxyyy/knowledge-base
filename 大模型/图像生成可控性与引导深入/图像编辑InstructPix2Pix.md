# 图像编辑InstructPix2Pix

> 对应 Brooks et al. 2023 「InstructPix2Pix: Learning to Follow Image Editing Instructions」。

## 一、背景与挑战

传统图像编辑需掩码或强结构约束。InstructPix2Pix 让用户用自然语言指令（「把猫换成狗」）直接编辑图像，无需指定区域。挑战是训练数据稀缺与编辑保真-遵循权衡。

## 二、核心原理

用 GPT-3 合成编辑指令、用 Stable Diffusion 生成配对图，得到大规模（指令, 原图, 编辑图）三元组。训练时以原图+指令为条件，预测编辑后图；推理用 CFG 双引导（图像引导 + 指令引导）平衡保真与遵循。

## 三、数学形式

条件噪声预测：
\hat{\epsilon} = \epsilon_\theta(x_t, c_I, c_T)
双 CFG：
\epsilon = \epsilon_u + s_I(\epsilon_{cI}-\epsilon_u) + s_T(\epsilon_{cT}-\epsilon_{cI})
其中 s_I 控制保真（原图一致性），s_T 控制指令遵循。

## 四、代码实现

```python
def ip2p_cfg(model, x, t, img_cond, txt, s_i=1.5, s_t=7.5):
    e_u = model(x, t, None, None)
    e_i = model(x, t, img_cond, None)
    e_t = model(x, t, img_cond, txt)
    return e_u + s_i*(e_i-e_u) + s_t*(e_t-e_i)
```

## 五、与其他对比

相比 InstructGPT 文本编辑，这里是像素编辑；相比 SDEdit（加噪重绘）无需指定强度；双 CFG 使保真与遵循解耦可调。数据靠合成，降低人工成本。

## 六、常见误区

以为需手工掩码，实则指令驱动；混淆 s_I/s_T 作用；忽略合成数据噪声；直接套用普通 CFG 参数。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Q：InstructPix2Pix 数据？答：GPT-3 造指令 + SD 造配对图。
- Q：双 CFG？答：图像保真与指令遵循分离引导。
- Q：优势？答：自然语言编辑，无需掩码。

## 九、演进

从合成数据到真实指令数据；视频编辑扩展；与 LLM 指令解析结合。

## 十、小结

InstructPix2Pix 把自然语言指令引入图像编辑，以双 CFG 解耦保真与遵循，开启了指令式图像编辑范式。
