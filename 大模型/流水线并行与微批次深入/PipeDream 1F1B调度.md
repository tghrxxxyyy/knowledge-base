# PipeDream 1F1B调度

> 对应 Narayanan 2019 (PipeDream) 与 Narayanan 2021 调度分析。

## 一、背景与挑战
GPipe 需缓存全部微批激活，显存压力大。1F1B(one-forward-one-backward)在稳定期让每个设备交替执行前向与反向，尽早释放激活。

## 二、核心原理
 warm-up 阶段各设备依次做前向建立微批；进入稳定期后，每收到一个下游反向依赖，设备执行一次前向并立即对该微批执行反向，使激活随反向即时释放。

## 三、形式化与数学基础
稳定期每个设备同时持有微批数约 $p$，激活显存：
$ M_{\\mathrm{act}} \\approx p \\cdot \\mathrm{act}_{\\mathrm{stage}} $，
气泡比仍为 $(p-1)/(m+p-1)$ 但显存由 $O(mp)$ 降为 $O(p)$。

## 四、代码实现
```python
# 概念：稳定期交替 1F1B
for step in range(m + p - 1):
    if step < warmup:
        a = stage(recv_prev())
        send_next(a); cache.append(a)
    else:
        a = cache.pop(0)
        a.backward()              # 立即反向释放激活
        if has_next_forward:
            a2 = stage(recv_prev()); send_next(a2)
```

## 五、与其他技术对比
比 GPipe 省激活但需处理权重版本(因前向与反向间参数已更新)，需用 2BW 缓存旧权重。Megatron 1F1B 同思路。

## 六、常见误区
误区一：1F1B 无权重版本问题——实际反向用的应是前向时的旧参数。误区二：气泡为零——warm-up/cool-down 仍有空闲。误区三：微批可任意大，受 $p$ 约束。

## 七、与开源书/权威来源对应
Narayanan 2019 PipeDream；Narayanan 2021 给出 1F1B 与 2BW 形式化。

## 八、面试题
问：1F1B 为何需旧权重？答：反向须用前向对应版本参数，否则更新错位。问：显存优势？答：激活由 $O(mp)$ 降至 $O(p)$。

## 九、演进与趋势
PipeDream-2BW 显式缓存多版本权重；与 ZeRO-3 组合成 3D 并行。

## 十、小结
1F1B 以版本管理换激活显存，是吞吐与显存兼得的主流调度。
