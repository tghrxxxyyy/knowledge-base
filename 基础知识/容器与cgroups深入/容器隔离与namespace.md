# 容器隔离与namespace

> 对应 Menage 2004 "Adding Generic Process Containers to the Linux Kernel"（cgroups 早期）与 Baumann 2015 "Unikernels"（轻量隔离思路）。

## 一、背景与挑战
容器要在单一内核上让进程组"误以为"拥有独立系统：独立 PID、网络、挂载、主机名等。Linux 用 namespace 把全局资源视图按进程隔离，是容器隔离的第一支柱。

## 二、核心原理
`clone(CLONE_NEWPID|CLONE_NEWNET|...)` 创建新 namespace，进程在该命名空间内看到受限/独立视图。六种常用：mount、pid、net、ipc、uts、user。同一命名空间内进程共享视图，跨命名空间默认不可见。namespace 可嵌套（pid 树）。

## 三、形式化与数学基础
设资源 $R$ 的全局视图 $G$，进程 $p$ 属命名空间 $ns(p)$：
$$view_R(p) = G|_{ns(p)}$$
跨 ns 可见性默认 false；user namespace 可映射宿主 uid 0 → 容器内 root（非特权用户跑容器）。隔离维度 $D=6$ 决定隔离粒度。

## 四、代码实现
```c
// 创建带独立 PID/网络/UTS 命名空间的子进程
clone(child_fn, stack,
      CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWUTS | SIGCHLD, arg);
// 在子进程内：sethostname、ip netns、看到 PID 从 1 开始
```

## 五、与其他技术对比
namespace 提供视图隔离但不限资源（靠 cgroups）；VM 隔离更强（独立内核）。相较 chroot，namespace 多维且含 pid/net。user namespace 让非特权用户拥有 root 视图。

## 六、常见误区
误以为 namespace 等于容器：还需 cgroups 限资源。误以为新 PID ns 看不到宿主进程：确实从 1 开始独立。误以为 net ns 自带网络：需配 veth/bridge。

## 七、与开源书/权威来源对应
内核 namespace 文档；Menage 2004 容器基元；OSTEP 容器章。

## 八、面试题
问：容器隔离靠什么？答：namespace 视图隔离 + cgroups 资源限制。问：user namespace 作用？

## 九、演进与趋势
time namespace（容器时钟）、cgroup namespace 隔离；rootless 容器依赖 user namespace 普及。

## 十、小结
namespace 把全局资源切割成每容器独立视图，是容器"看起来像独立系统"的关键。
