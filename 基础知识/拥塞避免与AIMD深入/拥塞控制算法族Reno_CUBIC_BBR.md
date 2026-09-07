# 拥塞控制算法族Reno/CUBIC/BBR

> 对应 RFC 5681 (Reno)、RFC 8312 (CUBIC)、Cardwell et al. 2016 (BBR)；参考 xiaolincoder/hello-http。

## 一、背景与挑战
不同网络环境（局域网、长肥管道、无线）对拥塞控制提出不同要求，催生多代算法。

## 二、核心原理
- Reno：AIMD，公平但高速恢复慢。
- CUBIC：以丢包为信号，用三次函数围绕 Wmax 凸性探测，适合高 BDP，Linux 默认。
- BBR：模型驱动，测量 BtlBw/RTprop，不依赖丢包。

## 三、形式化与数学基础
CUBIC 窗口函数（时间 t 自上次降窗）：
  W(t) = C*(t-K)^3 + Wmax,  K = (Wmax*β/C)^(1/3)
BBR：
  cwnd_target = BDP = BtlBw * RTprop
Reno：
  cwnd AI: +1/RTT, MD: *0.5

## 四、代码实现
// 选择算法（Linux）
sysctl -w net.ipv4.tcp_congestion_control=cubic
// 程序内按 socket 选择
setsockopt(fd, IPPROTO_TCP, TCP_CONGESTION, "bbr", 3);

## 五、与其他技术对比
Reno 简单公平；CUBIC 高吞吐友好；BBR 低延迟友好。混部时 BBR 更激进。

## 六、常见误区
1. 认为 CUBIC 一定优于 Reno——在浅缓冲无线链路 BBR 更稳。
2. 忽略算法选择对公平性影响。

## 七、与开源书/权威来源对应
- RFC 5681 / RFC 8312
- Cardwell et al. 2016
- xiaolincoder/hello-http

## 八、面试题
Reno/CUBIC/BBR 区别？CUBIC 为何适合高 BDP？BBR 何时更好？

## 九、演进与趋势
BBRv2、CUBIC+ 持续演进，算法可插拔成主流。

## 十、小结
三代算法演进反映从"反应丢包"到"主动建模"的拥塞控制发展史。
