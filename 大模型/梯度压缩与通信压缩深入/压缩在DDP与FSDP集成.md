# 压缩在DDP与FSDP集成

> 对应 pytorch/pytorch DDP 钩子 与 Zhao 2023 FSDP 通信。

## 一、背景与挑战
DDP 的 all-reduce 与 FSDP 的 reduce-scatter 是通信热点，将梯度压缩嵌入这些原语需挂钩通信前后处理。

## 二、核心原理
在 DDP 的 `_communicate_hook` 或 FSDP 的梯度分片后插入压缩/解压：发送端压缩，接收端聚合前解压并误差补偿，保持优化器语义不变。

## 三、形式化与数学基础
DDP 梯度同步：
$ g = \\mathrm{all\\text{-}reduce}(g_{\\mathrm{local}}) \\Rightarrow \\tilde g = \\mathrm{all\\text{-}reduce}(\\mathcal C(g_{\\mathrm{local}}+e)) $，
FSDP 则在 reduce-scatter 阶段对各分片压缩，量省 $1/N$ 维上仍显著。

## 四、代码实现
```python
import torch.distributed as dist
def ddp_compress_hook(state, bucket):
    g = bucket.buffer()
    cg = compress(g + state.ef)          # 压缩
    fut = dist.all_reduce(cg, async_op=True)
    return fut
# model.register_comm_hook(state, ddp_compress_hook)
```

## 五、与其他技术对比
DeepSpeed 内置 1-bit Adam 通信钩子；PyTorch 需自定义 comm hook。FSDP 压缩点更细(每层分片)。

## 六、常见误区
误区一：钩子任意改梯度——须保证聚合语义与 EF 一致。误区二：压缩影响精度可忽略——需监控。误区三：DDP/FSDP 通用同钩子，实际接口不同。

## 七、与开源书/权威来源对应
pytorch/pytorch `register_comm_hook`；Zhao 2023 FSDP；Tang 2021 DeepSpeed 1-bit Adam。

## 八、面试题
问：压缩挂哪？答：DDP comm_hook / FSDP 分片后。问：为何需 EF？答：保证聚合等于真实梯度。

## 九、演进与趋势
原生 fp8 通信钩子；分片级自适应压缩。

## 十、小结
将压缩集成进 DDP/FSDP 通信原语，是大规模训练省带宽的最直接落点。
