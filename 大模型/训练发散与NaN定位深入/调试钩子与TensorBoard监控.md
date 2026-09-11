# 调试钩子与TensorBoard监控

> 对应 pytorch/pytorch `register_forward_hook`/`register_full_backward_hook` 与 autograd 异常检测文档。

## 一、背景与挑战

训练发散时，NaN 往往在几十层模块间悄悄传递后才在 loss 上暴露。工程师面对的是一个「哪一层先坏」的因果定位问题。逐层打印日志会淹没输出、拖慢训练；只盯 loss 曲线又太迟，无法指出病灶。

调试钩子（hook）的价值在于：它能在前向/反向传播的任意模块边界非侵入式地拦截张量，检查数值并记录上下文，从而把「黑盒训练」变成「可观测流水线」。而 TensorBoard 这类监控面板则负责把长周期的标量趋势（loss、grad_norm、lr、scale）可视化，提供宏观视角。二者一微观一宏观，缺一不可。

## 二、核心原理

PyTorch 提供三类钩子：

- `register_forward_hook`：模块前向完成后调用，签名 `(module, input, output)`；
- `register_forward_pre_hook`：前向前调用，可查看/修改输入；
- `register_full_backward_hook`：反向传播到该模块时调用，查看输入/输出梯度。

典型调试模式是：给所有子模块注册前向钩子，断言输出全部有限；一旦某模块输出非有限，立即抛出并携带模块名，从而定位「首个异常算子」。反向钩子则用于判断梯度是在哪一层变成 inf/NaN。

监控侧，训练循环定期写入 `SummaryWriter`：`loss`、`grad_norm`、`lr`、`scale`、各层梯度范数与激活统计。曲线突变点与钩子抛错点互相印证，能迅速区分「前向坏」还是「反向坏」。

## 三、形式化与数学基础

设模型由模块序列 $m_1, \dots, m_n$ 复合，前向为 $h_0 = x,\ h_i = m_i(h_i)$。对每个模块挂前向钩子并检查输出是否有限：

$$
\text{ok}_i = \bigwedge_{t \in h_i} \text{isfinite}(t),\qquad
i^\* = \min\{\, i \mid \lnot \text{ok}_i \,\}
$$

$i^\*$ 即首个异常模块：其上游 $h_{i^\*-1}$ 仍有限、下游 $h_{i^\*}$ 已坏。反向侧同理定义 $j^\* = \min\{i \mid \lnot\text{isfinite}(g_i)\}$。此外梯度范数 $\|\nabla_\theta L\|_2 = \sqrt{\sum_i g_i^2}$ 若在 $T$ 步内出现数量级突变，即为发散前兆。

## 四、代码实现

```python
# 1) 前向钩子：定位首个非有限输出
import torch

def make_finite_hook(name):
    def hook(module, inputs, output):
        tensors = output if isinstance(output, (list, tuple)) else (output,)
        for t in tensors:
            if isinstance(t, torch.Tensor) and not torch.isfinite(t).all():
                raise RuntimeError("non-finite output at module: " + name)
    return hook

for name, mod in model.named_modules():
    if name:                       # 跳过根模块
        mod.register_forward_hook(make_finite_hook(name))
```

```python
# 2) 训练循环写入 TensorBoard
from torch.utils.tensorboard import SummaryWriter

writer = SummaryWriter("runs/exp1")
for step, (x, y) in enumerate(loader):
    opt.zero_grad()
    loss = model(x).loss
    loss.backward()
    gnorm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    opt.step()

    if step % 10 == 0:
        writer.add_scalar("train/loss", loss.item(), step)
        writer.add_scalar("train/grad_norm", gnorm.item(), step)
        writer.add_scalar("train/lr", sched.get_last_lr()[0], step)
writer.close()
```

## 五、与其他技术对比

| 手段 | 观察粒度 | 开销 | 事后可追溯 | 适用场景 |
| --- | --- | --- | --- | --- |
| 前向/反向钩子 | 模块级张量 | 中（断言逐张量） | 否，需复现 | 精确定位首个坏模块 |
| `set_detect_anomaly` | 算子级 | 高（保留计算图） | 是（打印栈） | 单步事故复盘 |
| TensorBoard 标量 | 指标级趋势 | 低 | 是 | 长周期宏观监控 |
| 逐层日志打印 | 模块级 | 中 | 部分 | 小模型粗查 |
| 梯度直方图 | 分布统计 | 中 | 是 | 判断数值分布漂移 |

## 六、常见误区

- **钩子长期开启**：张量断言与栈信息会显著拖慢训练，应只在排障窗口挂载，事后移除。
- **只钩前向忽略反向**：NaN 常在反向产生，只查前向会漏诊。
- **钩子泄漏**：保存 hook 句柄以便 `remove()`，否则反复注册导致重复执行。
- **把 TensorBoard 当唯一真相**：曲线只反映已记录指标，未记录的隐藏坏值仍会漏掉。
- **使用 in-place 修改**：反向钩子中修改梯度会破坏 autograd 语义。
- **过度记录**：每步都写全量直方图会拖慢 IO，应降频采样。

## 七、与开源书·权威来源对应

pytorch/pytorch 的 autograd 文档说明了 `register_hook`、`register_forward_hook`、`register_full_backward_hook` 的签名与使用约束；`torch.autograd.set_detect_anomaly` 官方说明给出逆序追踪 NaN 的原理；`torch.utils.tensorboard` 提供标量与直方图写入接口。具体 API 行为与新增钩子类型以官方最新文档为准。

## 八、面试题

- **问：如何用钩子定位首个 NaN？** 答：逐模块注册前向钩子断言输出有限，首个抛错的模块即病灶。
- **问：前向钩子与反向钩子分别回答什么问题？** 答：前者答「哪层输出先坏」，后者答「梯度在哪层变坏」。
- **问：为什么要移除钩子？** 答：钩子逐张量执行有开销，生产训练需关闭。
- **问：TensorBoard 与钩子如何互补？** 答：TensorBoard 给宏观趋势与历史，钩子给微观张量现场，二者印证。

## 九、演进与趋势

调试工具正从「手动插桩」走向「框架内建可观测」。PyTorch 的 Compile/Inductor 在编译期插入张量校验成为可能；`torch.profiler` 与时序分析可同时给出耗时与数值异常；W&B、TensorBoard 等平台把梯度直方图、参数分布、异常断点集中呈现。趋势是与分布式训练栈集成，让每个 rank 的数值健康在统一面板呈现，并把「检测—定位—回滚」串成自动流水线。

## 十、小结

钩子提供逐模块、非侵入式的微观数值观测，TensorBoard 提供长周期宏观趋势，二者结合才能既知道「何时坏」又知道「哪里坏」。工程上要记住：钩子是排障期工具，事后须移除；监控要覆盖 loss、grad_norm、lr、scale 等先行指标，才能在发散前捕获信号。
