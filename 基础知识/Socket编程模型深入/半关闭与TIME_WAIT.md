# 半关闭与TIME_WAIT

> 对应 RFC 793 (TCP 状态机) 与 Stevens《UNIX Network Programming》ch2；参考 xiaolincoder/hello-http。

## 一、背景与挑战
TCP 全双工，关闭需双向独立。TIME_WAIT 保证最后 ACK 可靠与旧报文消散，但会带来端口占用问题。

## 二、核心原理
- 半关闭：shutdown(fd, SHUT_WR) 发送 FIN 仍可读，用于"我说完了但听你说完"。
- TIME_WAIT：主动关闭方在发送最终 ACK 后保持 2*MSL，防止延迟报文干扰新连接。

## 三、形式化与数学基础
TIME_WAIT 时长：
  T = 2 * MSL  (通常 60s)
连接唯一性：由 (src_ip, src_port, dst_ip, dst_port) 四元组决定。
主动关闭方端口在 TIME_WAIT 内不可立即重用，除非 SO_REUSEADDR。

## 四、代码实现
// 半关闭示例：客户端发完请求后关闭写端
shutdown(fd, SHUT_WR);          // 发送 FIN
char buf[1024];
while (read(fd, buf, sizeof buf) > 0)  // 继续读响应
    ;
close(fd);                      // 进入 TIME_WAIT（主动方）

## 五、与其他技术对比
被动关闭方直接进入 CLOSE_WAIT -> LAST_ACK；主动方才经历 TIME_WAIT。

## 六、常见误区
1. 认为 TIME_WAIT 是 bug——它是 TCP 正确性的必要设计。
2. 滥用 SO_LINGER 强制 RST 会丢数据。

## 七、与开源书/权威来源对应
- RFC 793 (TCP)
- Stevens《UNIX Network Programming》
- xiaolincoder/hello-http

## 八、面试题
为何需要 TIME_WAIT？半关闭用途？大量 TIME_WAIT 怎么处理？

## 九、演进与趋势
TCP 快速回收（已废弃）被安全风险取代，现靠连接复用（长连接）缓解。

## 十、小结
TIME_WAIT 与半关闭体现 TCP 全双工关闭的严谨性，理解状态机才能排错。
