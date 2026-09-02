# 特殊 Token 与对话模板

> 见「从零实现GPT/指令数据集」。

## 一、背景与挑战

模型用特殊 token 标记结构：`[BOS]/[EOS]` 起止、`[PAD]` 填充、`<|im_start|>` 等对话角色标记。模板错误会让微调/推理错位。

## 二、核心原理

不同模型模板不同(GPT-2 `<|endoftext|>`、LLaMA `<s>/</s>`、ChatML `<|im_start|>`)，SFT 与推理必须用同一模板。

## 三、代码实现

```python
# HuggingFace 自动应用 chat template
text = tok.apply_chat_template(messages, tokenize=False)
```

## 四、常见误区

- 训练用一套模板、推理另一套，能力骤降。

## 五、与开源书对应

- HF Tokenizers chat template 文档。

## 六、面试题

- 为何 SFT 与推理必须用相同对话模板？

## 七、小结

特殊 token 与模板是模型“语法”，一致性与正确性同等重要。
