# 网络命名空间API与setns

> 对应 Linux man setns(2)/unshare(2)/clone(2)；参考 man network_namespaces(7)。

## 一、背景与挑战
程序需要动态加入某 netns（如容器运行时、网络agent），而不必 fork 新进程。setns 让已运行进程切换网络视图。

## 二、核心原理
- unshare(CLONE_NEWNET)：当前进程脱离，新建 netns。
- clone(CLONE_NEWNET)：子进程带新 netns 出生。
- setns(fd, CLONE_NEWNET)：把当前进程加入已有 netns（fd 来自 /proc/<pid>/ns/net 或 /var/run/netns/）。

## 三、形式化与数学基础
ns 文件描述符绑定：
  fd = open("/proc/<pid>/ns/net", O_RDONLY)
  setns(fd, 0)  // 加入该 netns
此后进程创建 socket 落入目标 netns 的栈。
  p.netns_id = target

## 四、代码实现
// 加入指定命名空间
int fd = open("/var/run/netns/ns1", O_RDONLY);
if (setns(fd, CLONE_NEWNET) < 0) perror("setns");
close(fd);
// 之后创建的 socket 属于 ns1
int s = socket(AF_INET, SOCK_STREAM, 0);

## 五、与其他技术对比
unshare 适合初始化隔离；setns 适合在运行中切换，常用于运维/监控工具。

## 六、常见误区
1. setns 后已打开的 socket 仍属旧 netns——仅影响之后创建的对象。
2. 忘记 bind mount /var/run/netns 使 ip netns 可见。

## 七、与开源书/权威来源对应
- Linux man setns(2), unshare(2), clone(2)
- network_namespaces(7)
- xiaolincoder/hello-http

## 八、面试题
setns 与 unshare 区别？如何查看进程的 netns？

## 九、演进与趋势
eBPF 程序可 attach 到具体 netns，实现细粒度可观测。

## 十、小结
setns/unshare/clone 是操作 netns 的系统调用三件套，是容器与网络工具的底层。
