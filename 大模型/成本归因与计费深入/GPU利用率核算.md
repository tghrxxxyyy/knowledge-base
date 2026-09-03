# GPU利用率核算

> 对应 GPU 利用率（nvidia-smi）/ 实际算力利用；vLLM 吞吐。MFU 衡量算力利用。

## 一、背景与挑战

按 token 计费掩盖 GPU 占用真相；低利用率时单请求隐性成本高。

## 二、核心原理

记录每请求占用 GPU 秒与 MFU（模型算力利用率）；常驻卡折旧摊入，得真实单价。

## 三、数学形式

有效利用率 $U = \frac{tokens\cdot flops\_per\_tok}{gpu\_peak\cdot T}$；单价随 $U$ 反比。

## 四、代码实现

```python
util = torch.cuda.utilization()
gpu_sec = elapsed * (util / 100)
```

## 五、与其他对比

- 与 Token计费模型（表象）对照真实。
- 与 综合成本优化（提利用率）衔接。

## 六、常见误区

- 只看 smi 占用忽略算力空闲（MFU 低）。
- 常驻成本漏算致亏损。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 为何看 MFU 而非占用率？答：占用率高但 kernel 不满，真实算力利用仍低。

## 九、演进

占用率 → MFU → 按有效算力计价。

## 十、小结

GPU 利用率核算揭示真实成本，利用率是降本核心杠杆。
