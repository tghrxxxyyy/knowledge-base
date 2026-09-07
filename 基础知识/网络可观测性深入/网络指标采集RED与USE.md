# 网络指标采集RED与USE

> 对应 Brendan Gregg 的 RED/USE 方法论；参考 Google SRE Book 与 xiaolincoder/hello-http。

## 一、背景与挑战
网络设备与服务的健康需可量化。RED 面向请求服务，USE 面向资源，二者覆盖"服务"与"资源"两面。

## 二、核心原理
- RED（服务）：Rate/Errors/Duration，描述服务对外表现。
- USE（资源）：Utilization/Saturation/Errors，描述底层资源。
网络场景：接口带宽利用率、队列饱和、丢包错误。

## 三、形式化与数学基础
RED：
  Rate = rx/tx_packets per sec
  Errors = (drop + err) / total
  Duration = RTT / p95 handshake
USE：
  Utilization = bytes / bandwidth
  Saturation = qlen / qmax
  Errors = ifErrorCount

## 四、代码实现
# 从 /proc/net/dev 采集（Python）
with open("/proc/net/dev") as f:
    for line in f.readlines()[2:]:
        ifc, data = line.split(":")
        fields = data.split()
        rx, tx, drop = int(fields[0]), int(fields[8]), int(fields[3])
        print(ifc, "rx", rx, "drop", drop)

## 五、与其他技术对比
USE 看资源瓶颈，RED 看用户体验，结合才能既知"卡在哪"也知"影响多大"。

## 六、常见误区
1. 只看利用率忽略饱和度——队列深但利用率不高仍会丢包。
2. 平均延迟掩盖长尾 p99 问题。

## 七、与开源书/权威来源对应
- Brendan Gregg RED/USE 方法论
- Google SRE Book
- xiaolincoder/hello-http

## 八、面试题
RED 与 USE 分别看什么？为何要同时采集？

## 九、演进与趋势
eBPF 直接暴露 socket 级 RED/USE，粒度更细。

## 十、小结
RED+USE 提供从用户到资源的完整指标视角，是网络监控框架。
