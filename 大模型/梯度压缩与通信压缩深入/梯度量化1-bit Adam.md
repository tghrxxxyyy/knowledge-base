# 梯度量化1-bit Adam

> 对应 Tang 2021 (1-bit Adam) 与 microsoft/DeepSpeed 通信压缩。

## 一、背景与挑战
分布式训练每步通信梯度量达 $2\\Psi$，跨节点带宽受限。1-bit Adam 将梯度压缩为 1 bit 符号以省带宽。

## 二、核心原理
预热阶段用全精度梯度收敛到稳定区；之后仅传 sign(g) 与误差补偿缓冲，接收方用符号近似更新，本地维护未发送精度(error feedback)保证最终收敛。

## 三、形式化与数学基础
压缩：
$ \\tilde g = \\mathrm{sign}(g + e),\\quad e \\leftarrow (g+e) - \\tilde g\\cdot \\|g\\|_1 $，
通信量由 $32\\Psi$ 降至 $1\\Psi$ + 缩放因子，带宽节省约 32 倍。

## 四、代码实现
```python
import torch
def compress_1bit(g, error_buf):
    compensated = g + error_buf
    sign = torch.sign(compensated)
    scale = compensated.abs().mean()        # 用均值近似缩放
    error_buf.copy_(compensated - sign * scale)
    return sign, scale                      # 仅传 sign + scale
```

## 五、与其他技术对比
SIGNSGD 纯符号无误差补偿易发散；1-bit Adam 加 error feedback 与预热更稳。QLoRA 量化权重非梯度压缩，领域不同。

## 六、常见误区
误区一：1-bit 始终可用——非凸早期易发散需预热。误区二：无精度损失——误差补偿非完美。误区三：压缩通信零成本，实际有本地计算开销。

## 七、与开源书/权威来源对应
Tang 2021 1-bit Adam(microsoft/DeepSpeed)；Bernstein 2018 SIGNSGD 基础。

## 八、面试题
问：1-bit Adam 为何需预热？答：早期梯度方向不稳，符号压缩易偏。问：误差补偿作用？答：累积未发送精度保证收敛。

## 九、演进与趋势
与 fp8 梯度、分层压缩结合；适配 ZeRO 分片通信。

## 十、小结
梯度量化以符号+误差补偿大幅省带宽，是跨节点通信瓶颈下的有效手段。
