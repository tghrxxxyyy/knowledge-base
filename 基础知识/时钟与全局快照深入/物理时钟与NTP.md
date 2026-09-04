# 物理时钟与 NTP

> 对应 Mills《Internet Time Synchronization: The Network Time Protocol》(1991)。

## 一、背景与挑战
分布式系统常需要“真实时间”来排序事件、设置 TTL、生成时间戳。但各机器晶体振荡器有偏差，物理时钟无法完全同步，NTP 用来把偏差控制在毫秒级。

## 二、核心原理
- NTP 分层(stratum)：从权威时钟源(stratum 0，如 GPS/原子钟)逐级向下同步。
- 算法：客户端向服务器发请求，记录 t1(发)、收 t2、服务器回 t3、客户端收 t4；估算单向延迟 δ=(t4-t1)-(t3-t2)，偏移 θ=((t2-t1)+(t3-t4))/2，据此调钟。
- 步跳 vs 平滑( slewing )：差异大时步进校正，小时钟平滑调整避免应用受影响。

## 三、形式化 / 数学基础
偏移估计：
θ = ((t2 - t1) + (t3 - t4)) / 2
往返延迟：
δ = (t4 - t1) - (t3 - t2)
不确定性：真实偏移 ∈ [θ - δ/2, θ + δ/2]。
NTP 通常把机器间偏差控制在数毫秒到几十毫秒；公网更差。

## 四、代码实现
```python
# 简化 NTP 偏移估算(假设对称延迟)
def estimate(client_t1, server_t2, server_t3, client_t4):
    offset = ((server_t2 - client_t1) + (server_t3 - client_t4)) / 2
    delay  = (client_t4 - client_t1) - (server_t3 - server_t2)
    return offset, delay
```

## 五、与其他技术对比
- NTP：毫秒级，软件实现，广泛使用。
- PTP(IEEE 1588)：硬件时间戳，微秒/纳秒级，用于工业/金融。
- TrueTime：Google 用原子钟+GPS 提供有界误差时钟区间。

## 六、常见误区
- 误区：物理时钟可完全同步。总有误差，不能用于精确全局序。
- 误区：用本地时间做全局排序安全。时钟回拨/跳变会破坏顺序。

## 七、与开源书 / 权威来源对应
- Mills NTP 论文(1991)。
- Kleppmann《DDIA》第 8 章“Unreliable Clocks”。
- DDIA 中文: https://github.com/Vonng/ddia

## 八、面试题
1. NTP 如何估算时钟偏移与延迟？
2. 为什么物理时钟不能作为全局排序依据？
3. TrueTime 与 NTP 的区别？

## 九、演进与趋势
混合逻辑时钟(HLC)结合物理与逻辑时钟，Spanner 用 TrueTime 实现外部一致。

## 十、小结
物理时钟经 NTP 同步仍有不可忽略误差，不能单独用于强一致全局排序；需与逻辑时钟/有界误差机制结合。
