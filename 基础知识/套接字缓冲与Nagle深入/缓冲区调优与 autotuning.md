# 缓冲区调优与 autotuning

> 对应 Linux Documentation/networking/ip-sysctl.txt 的 tcp_rmem/tcp_wmem 与 RFC 7323，结合 xiaolincoder/hello-http。

## 一、背景与挑战
固定大小的 socket 缓冲难以适配从局域网到跨洋长肥管道的巨大差异。缓冲过小限制吞吐（管道填不满），过大浪费内存并增加延迟。Linux 的 TCP 缓冲 autotuning 自动按实际网络条件调整，是现代默认最佳实践。

## 二、核心原理
tcp_rmem/tcp_wmem 各为三元组 (min, default, max)，单位字节。autotuning 在 [min, max] 区间内依据实测吞吐、RTT 与空闲内存动态设置每个 socket 的实际缓冲（即「真实窗口/BDP」）。SO_RCVBUF/SO_SNDBUF 的手动设置在开启 autotuning 时仅设定上限（且内核仍翻倍）。窗口缩放（WSOPT）使 max 可远大于 64KB。

## 三、形式化与数学基础
目标缓冲 ≈ BDP = BtlBw · RTprop。autotuning 使 rcv_buf 趋近 BDP 且不超 max。吞吐上限 ≈ min(窗口, cwnd) / RTT；当窗口 < BDP 时吞吐被流控限制，故高 BDP 网络需足够大的 tcp_*mem max 与 WSOPT。

## 四、代码实现
```bash
sysctl -w net.ipv4.tcp_rmem="4096 87380 16777216"
sysctl -w net.ipv4.tcp_wmem="4096 16384 16777216"
sysctl -w net.ipv4.tcp_window_scaling=1
sysctl -w net.ipv4.tcp_moderate_rcvbuf=1   # 开启接收自动调优
```

## 五、与其他技术对比
手动 SO_SNDBUF 设定在 autotuning 下仅作上限；老旧系统无 autotuning 时需手工按 BDP = 带宽·延迟 计算并设置。UDP 无 autotuning 概念，其缓冲仅影响排队与丢包率。

## 六、常见误区
误区一：调大 SO_RCVBUF 一定能提速——受 max 与对端窗口共同限制。误区二：autotuning 永不超限——仍在 max 内。误区三：缓冲越大越稳——过大增加内存压力与重传代价，且延迟上升。

## 七、与开源书/权威来源对应
Linux ip-sysctl.txt 文档 tcp_rmem/tcp_wmem；RFC 7323 窗口缩放；xiaolincoder/hello-http 给出高 BDP 调优示例；Kurose & Ross 讨论 BDP。

## 八、面试题
autotuning 依据什么调整？BDP 怎么算？为何还要 WSOPT？手动 SO_RCVBUF 的作用边界？

## 九、演进与趋势
BBR 与 autotuning 协同：BBR 测量 BtlBw/RTprop 后，内核更易把缓冲设到合适 BDP；部分场景用 BBR 可弱化对大缓冲的依赖，但仍需足够的 max 上限支撑高吞吐。

## 十、小结
TCP 缓冲 autotuning 按 BDP 自动调整收发缓冲，结合窗口缩放，使单台机器在不同网络条件下都接近最优吞吐，是默认应开启的关键机制。
