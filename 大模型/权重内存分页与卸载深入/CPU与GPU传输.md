# CPU/GPU传输与带宽

> 对应 PCIe/NVLink 带宽对卸载的影响。

## 一、背景与挑战

卸载代价由传输带宽决定；PCIe 相对算力极慢，需精细调度。

## 二、核心原理

用 `non_blocking` 拷贝 + 独立流；优先 NVLink（多卡）高带宽；量化（INT8/4）减半字节直接减半传输时间。

## 三、数学形式

传输时间 $t_{tx}=\frac{\text{bytes}}{\text{bw}_{pcie}}$；量化使 bytes 减半则 $t_{tx}$ 减半。

## 四、代码实现

```python
stream = torch.cuda.Stream()
with torch.cuda.stream(stream):
    w = cpu_w.to('cuda', non_blocking=True)
```

## 五、与其他对比

- 与 张量核心与混合精度推理深入：量化同时减显存与传输。
- 与 权重内存分页与卸载深入 总览：传输是卸载核心成本。

## 六、常见误区

- 忘了同步流致用到未传完数据。
- 高估 PCIe 实际带宽（协议开销）。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 为何量化利于卸载？答：参数字节减半，传输时间近似减半，缓解 PCIe 瓶颈。

## 九、演进

同步拷 → 异步双流 → NVLink + 量化。

## 十、小结

传输带宽决定卸载代价，异步与量化是两大杠杆。
