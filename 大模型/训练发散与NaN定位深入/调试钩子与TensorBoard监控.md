# 调试钩子与TensorBoard监控

> 对应 pytorch/pytorch `register_hook` 与 huggingface/transformers 训练日志。

## 一、背景与挑战
NaN 出现时层层级联，需定位首个异常张量。钩子（hook）能在前向/反向中拦截张量并检查。

## 二、核心原理
`register_forward_hook` / `register_full_backward_hook` 在模块输入输出处插入检查，发现非有限值即记录模块名与形状。

## 三、形式化与数学基础
对模块 m，钩子接收 `(input, output)`，可断言 `torch.isfinite(output).all()`，失败则抛错并保留栈信息。

## 四、代码实现
```python
def make_hook(name):
    def hook(module, inp, out):
        if isinstance(out, torch.Tensor) and not torch.isfinite(out).all():
            raise RuntimeError(f"NaN/Inf at {name}")
    return hook
for n, m in model.named_modules():
    m.register_forward_hook(make_hook(n))
```

## 五、与其他技术对比
TensorBoard 看宏观曲线（loss/grad_norm）；钩子看微观张量，二者互补定位。

## 六、常见误区
钩子仅在 debug 开启，生产中忘记删除会拖慢训练。

## 七、与开源书/权威来源对应
pytorch/pytorch autograd 钩子文档；huggingface/transformers 默认记录 grad_norm、loss 到日志。

## 八、面试题
问：如何用钩子定位首个 NaN？答：逐模块前向钩子断言有限性，首个抛错即来源。

## 九、演进与趋势
`torch.utils.tensorboard` 与异常检测自动化集成。

## 十、小结
钩子 + 监控是 NaN 定位的微观与宏观双视角。
