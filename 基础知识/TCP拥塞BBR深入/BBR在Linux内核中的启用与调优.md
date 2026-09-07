# BBR在Linux内核中的启用与调优

> 对应 Linux 内核 Documentation/networking/ip-sysctl.txt 与 torvalds/linux net/ipv4/tcp_bbr.c。

## 一、背景与挑战
要在生产环境用 BBR，需要内核支持并正确选择拥塞控制算法，同时理解可调参数，避免与 fq 排队规则冲突。

## 二、核心原理
BBR 依赖 pacing（由 fq 排队规则提供），因此推荐搭配 `sch_fq`。启用通过 sysctl 设置默认拥塞控制并加载模块。

## 三、形式化与数学基础
可用带宽估计需 pacing 速率精确：
  pacing_rate = BtlBw * pacing_gain
BBR 设置 cwnd 上界：
  cwnd = BDP * cwnd_gain (cwnd_gain 默认 2)

## 四、代码实现
# 启用 BBR
modprobe tcp_bbr
sysctl -w net.ipv4.tcp_congestion_control=bbr
sysctl -w net.core.default_qdisc=fq
# 验证
sysctl net.ipv4.tcp_congestion_control
# 查看某连接
ss -tinp | grep -i bbr

## 五、与其他技术对比
CUBIC 默认无需 fq 也能工作；BBR 与 fq 配合才能发挥 pacing 优势。

## 六、常见误区
1. 未设置 fq 导致 BBR pacing 退化、效果打折。
2. 在虚拟化 vhost 场景下 BDP 估计受后端限制，需结合实际测试。

## 七、与开源书/权威来源对应
- torvalds/linux Documentation/networking/ip-sysctl.txt
- torvalds/linux net/ipv4/tcp_bbr.c
- xiaolincoder/hello-http

## 八、面试题
如何启用 BBR？为何推荐 fq？如何验证某连接用了 BBR？

## 九、演进与趋势
内核逐步提供 per-route、per-socket 的 BBR 参数，便于更细粒度调优。

## 十、小结
BBR 的部署离不开 fq 与正确的 sysctl，调优围绕 pacing、cwnd_gain 与测量窗口展开。
