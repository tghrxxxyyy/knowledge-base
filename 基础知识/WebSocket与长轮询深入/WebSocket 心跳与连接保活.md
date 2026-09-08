# WebSocket 心跳与连接保活

> 对应 RFC 6455 第 5.5 节 ping/pong 控制帧与 xiaolincoder/hello-http 的连接管理建议。

## 一、背景与挑战
长连接经过 NAT、代理、负载均衡时，空闲连接可能被中间设备因超时断开。应用层需要心跳探测对端存活，避免发送已死连接或堆积半开连接。

## 二、核心原理
WebSocket 定义 ping（0x9）与 pong（0xA）控制帧。一方发送 ping，对端必须尽快回 pong，载荷可原样回显。应用层常定时（如每 30s）发 ping，若在若干周期内未收到 pong 则判定连接失效并关闭。也可依赖 TCP keepalive 作为更底层补充。

## 三、形式化与数学基础
设心跳间隔为 T_h，允许丢失次数为 k，则判定死连接的超时 T_dead ≈ k·T_h。期望保活开销为每 T_h 一个控制帧（载荷通常 ≤125 字节），带宽成本 O(1/T_h)。

## 四、代码实现
```python
import asyncio, websockets
async def heartbeat(ws):
    while True:
        try:
            await ws.ping()
            await asyncio.sleep(30)
        except Exception:
            await ws.close(); break
```

## 五、与其他技术对比
TCP keepalive 默认关闭且探测周期长（常 2 小时），不适合应用级快速失败；WebSocket ping/pong 位于应用协议层，及时且可携带应用状态。HTTP 长轮询靠超时重连实现类似效果但开销更大。

## 六、常见误区
误区一：ping 必须由客户端发——任一方都可发。误区二：pong 可延迟——RFC 要求尽快回复。误区三：心跳能探测应用卡死——只能探测连接存活，不保证业务逻辑健康。

## 七、与开源书/权威来源对应
RFC 6455 第 5.5.2/5.5.3 节规定 ping/pong 行为；xiaolincoder/hello-http 讨论代理超时；Kleppmann《DDIA》提及故障检测与超时。

## 八、面试题
ping/pong 的作用？为何不能只靠 TCP keepalive？心跳间隔如何取舍？半开连接是什么？

## 九、演进与趋势
在移动网络下，自适应心跳（按网络类型调整间隔）被广泛采用以省电；QUIC 的 CONNECTION_CLOSE 与 PING 帧提供了传输层保活能力。

## 十、小结
WebSocket 用心跳 ping/pong 在应用层维持连接存活、快速发现断连，是长连接服务稳定运行的必要机制。
