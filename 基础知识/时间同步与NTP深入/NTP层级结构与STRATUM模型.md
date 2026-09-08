# NTP层级结构与STRATUM模型

> 对应 RFC 5905 的 Stratum 定义与 DDIA 第8章。

## 一、背景与挑战
若所有机器都直连 GPS，成本与单点风险太高。NTP 用层级（stratum）把时间从权威源逐级下发，每层在上层基础上叠加自身误差。如何既扩散时间又量化累积误差，是层级模型要解决的。

## 二、核心原理
Stratum 0 是真实时钟源（GPS、原子钟、无线电钟），不直接服务网络。Stratum 1 直接连 Stratum 0，向网络提供时间。Stratum N（N 大于等于 2）从 Stratum N-1 同步。每层在父节点误差上加上本跳的延迟与抖动，形成「误差随层级增长」的信任链。

## 三、形式化与数学基础
设第 \\(i\\) 层误差上界为 \\(E_i\\)，本跳抖动为 \\(j_i\\)，则
\\[
E_i = E_{i-1} + j_i
\\]
客户端通常选择最低可达 stratum 且延迟最小、偏差最小的组合，避免无谓加深层级。

## 四、代码实现
```python
# ntplib 查询可返回 stratum 与偏移
import ntplib
c = ntplib.NTPClient()
resp = c.request("pool.ntp.org")
print(resp.stratum, resp.offset, resp.delay)
```

## 五、与其他技术对比
NTP 层级是「信任传递」；PTP 用边界时钟或透明时钟在链路层转发，误差控制更紧；TrueTime 不分层，所有节点直接读本地原子钟加 GPS。

## 六、常见误区
1. 认为 stratum 越低一定越准：低 stratum 也可能网络远、抖动大。
2. 环路同步：A 跟 B、B 跟 A 会震荡，需用定向根避免。
3. stratum 16 表示「未同步」，常被误读为合法层级。

## 七、与开源书/权威来源对应
RFC 5905 定义 stratum 0 到 16；DDIA 说明 NTP 的精度随跳数下降。

## 八、面试题
问：stratum 16 代表什么？
答：代表该节点尚未与任何可靠时间源同步，不应作为时间参考。

## 九、演进与趋势
混合云场景下，企业常以本地 Stratum 1 设备为根，再经 NTP 下发，兼顾安全与精度。

## 十、小结
Stratum 模型用信任链扩散时间，代价是误差随层级累积；选源应综合层级、延迟与抖动。
