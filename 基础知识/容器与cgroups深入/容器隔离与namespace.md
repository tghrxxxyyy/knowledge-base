# 容器隔离与namespace

> 对应 kernel 文档 namespaces.rst 与 Menage 2004 cgroups 提案；OSTEP 容器章。

## 一、背景与挑战

容器要在单一内核上让进程组「误以为」拥有独立系统：独立 PID、网络、挂载点、主机名等。若不做视图隔离，一个容器里的 `ps` 会看到宿主全部进程，改 `/etc/hostname` 会影响全局。Linux 用 namespace 把全局资源视图按进程切割，是容器「看起来像独立系统」的第一支柱。另一支柱 cgroups 负责资源限制（见同系列文档），二者互补：namespace 管「看到什么」，cgroups 管「能用多少」。

隔离的粒度取决于启用了哪些 namespace 类型。常见有六种，再加上较新的 cgroup namespace 与 time namespace，共八种。少开一种，就多暴露一层宿主视图，安全边界随之缩小。

还要认识到「namespace 不是安全边界」这一根本限制：它们共享内核，因此任何内核漏洞都可能成为逃逸通道；namespace 提供的是「视图与命名空间隔离」，而非「强隔离」。这正是容器需叠加 seccomp、capabilities、LSM（如 AppArmor/SELinux）的原因。

## 二、核心原理

`clone(CLONE_NEW*)` 或 `unshare()` 创建新 namespace，进程在该命名空间内看到受限/独立的资源视图。六种常用类型：Mount（挂载点树）、PID（进程号空间）、Network（网络栈）、IPC（System V IPC 与 POSIX 消息队列）、UTS（主机名/域名）、User（UID/GID 映射）。同一命名空间内进程共享视图，跨命名空间默认不可见。

PID namespace 可嵌套：子 namespace 中的进程在父空间里也有一个 PID（父可见子，子不见父），这正是「容器里 PID 从 1 开始、宿主仍能看到它真实 PID」的实现。User namespace 最特殊：它把容器内的 root（uid 0）映射到宿主的一个普通 uid，使「容器内 root」在宿主只是非特权用户——这是 rootless 容器能安全运行的基础。

Mount namespace 的一个关键细节是「传播类型」：`shared`（默认，挂载事件向外传播）、`private`、`slave`、`unbindable`。容器运行时通常先 `mount --make-rprivate /` 把挂载事件隔离，否则容器内挂载会「泄漏」到宿主——这是很多「容器挂了宿主也挂」问题的根因。

## 三、形式化与数学基础

设资源 $R$ 的全局视图为 $G$，进程 $p$ 所属命名空间为 $ns(p)$，其可见视图为全局在 $ns$ 上的投影：

$$ view_R(p) = G|_{ns(p)} $$

跨 ns 可见性默认 false；user namespace 的 UID 映射是一组区间映射：

$$ uid_{host} = map(uid_{container}),\quad (0 \mapsto k)\ \text{使容器内 root 映射为非特权宿主 uid } k $$

命名空间维度 $D=8$（mount/pid/net/ipc/uts/user/cgroup/time）决定隔离粒度；维度越多，暴露面越小。

| namespace | 隔离内容 | 典型可见效果 |
| --- | --- | --- |
| Mount | 挂载点树 | 各自独立的 `/proc`、根目录 |
| PID | 进程号空间 | 容器内 PID 从 1 起 |
| Network | 网络栈 | 独立 IP/端口/路由表 |
| IPC | 进程间通信对象 | 隔离共享内存与消息队列 |
| UTS | 主机名/域名 | 独立 hostname |
| User | UID/GID 映射 | 容器内 root ≠ 宿主 root |
| Cgroup | cgroup 根视图 | 只看到自身子树 |
| Time | 单调钟与启动时间 | 独立 boottime |

## 四、代码实现

```c
// 创建带独立 PID / 网络 / UTS 命名空间的子进程（容器起跑的最小原型）
pid_t pid = clone(child_fn, stack + STACK_SIZE,
        CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWUTS
        | CLONE_NEWIPC | CLONE_NEWNS | SIGCHLD, arg);
// 在子进程内：
sethostname("container-a", 11);   // 只改本 UTS ns 的主机名
// 看到 PID 从 1 开始，且 net ns 内只有自己的 lo/路由
```

```bash
# 运行时用 unshare 起一个隔离 shell（用户态验证）
unshare --pid --net --mount --uts --fork /bin/bash
# 此后 ps 只见本 ns 进程，ip addr 只见隔离网络栈
```

```bash
# user namespace：容器内 root 映射到宿主非特权 uid
unshare --user --map-root-user /bin/bash
id                    # 容器内显示 uid=0(root)，宿主侧实为普通用户
# 容器运行时通常还会隔离挂载传播，防止挂载事件泄漏到宿主
unshare --mount --propagation private /bin/bash
```

## 五、与其他技术对比

| 维度 | namespace | cgroups | chroot | VM |
| --- | --- | --- | --- | --- |
| 隔离内容 | 资源视图 | 资源用量 | 根目录 | 整系统 |
| 内核 | 共享 | 共享 | 共享 | 独立 |
| 典型用途 | 视图隔离 | 限额/计量 | 文件系统根 | 强隔离 |
| 安全边界 | 中 | 中 | 弱 | 强 |

namespace 提供视图隔离但不限资源（靠 cgroups）；VM 隔离最强（独立内核）。相较 chroot，namespace 多维且含 pid/net 等，远不止改根目录。User namespace 让非特权用户也能拥有「看起来是 root」的容器，是安全提升的关键。

| 加固层 | 作用 | 补充的缺口 |
| --- | --- | --- |
| capabilities | 裁剪特权 | 容器内 root 的实际权限 |
| seccomp-bpf | 限制系统调用 | 内核攻击面 |
| LSM（AppArmor/SELinux） | 强制访问控制 | 内核漏洞逃逸面 |
| user ns | 非特权运行 | 宿主权限放大 |

## 六、常见误区

- 误以为 namespace 等于容器。错，还需 cgroups 限资源，且常配 user ns 提安全性。
- 误以为新 PID ns 看不到宿主进程。错，容器内 PID 从 1 开始独立计数，但宿主仍可见其真实 PID。
- 误以为 net ns 自带网络。错，需配 veth/bridge/routing 才有连通性。
- 误以为 user ns 内 root 真有宿主特权。错，它映射到宿主非特权 uid，越权操作仍被拒。
- 误以为开了所有 ns 就绝对安全。错，共享内核意味着内核漏洞仍可逃逸，需配合 seccomp/capabilities。
- 误以为挂载污染不会外泄。错，默认 `shared` 传播类型会让容器内挂载传播到宿主，须设为 `private`。

## 七、与开源书·权威来源对应

- 内核文档 `Documentation/admin-guide/namespaces.rst`（各 ns 类型语义）。
- Menage 2004「Adding Generic Process Containers to the Linux Kernel」容器基元。
- OSTEP（Three Easy Pieces）容器章关于 namespace + cgroups 的组合。
- Bryant & O'Hallaron《CS:APP》关于进程与系统调用的视图隔离背景。

## 八、面试题

1. 容器隔离靠什么？（namespace 视图隔离 + cgroups 资源限制，常加 user ns 与 seccomp。）
2. user namespace 的作用？（把容器内 uid 0 映射到宿主非特权 uid，支撑 rootless 容器。）
3. PID namespace 为何嵌套？（父可见子真实 PID，子只见本 ns 从 1 起的视图。）
4. namespace 不限制什么？（不限制 CPU/内存，那由 cgroups 负责。）
5. 为何要设置挂载传播为 private？（默认 shared 会把容器内挂载事件传播到宿主，造成隔离泄漏。）
6. 容器内 PID 1 有何特殊职责？（接收并处理孤儿进程与信号，若不转发信号则容器无法优雅停止。）

## 九、演进与趋势

time namespace（容器时钟/启动时间隔离）与 cgroup namespace（让容器内看到自身 cgroup 根）补齐视图；rootless 容器依赖 user namespace 普及，大幅降低容器逃逸影响面。结合 seccomp-bpf 限制系统调用、capabilities 裁剪特权，形成「namespace + cgroups + seccomp + cap」的四层容器安全底座。产业侧的演进则是「把安全边界做厚」：gVisor 用用户态内核拦截系统调用、Kata Containers 用轻量 VM 提供独立内核、机密容器（Confidential Containers）用 TEE 保护内存，都是在「共享内核」之外补充更强隔离；与之配套的是更细的运行时策略（如 `RuntimeClass` 选择隔离级别），让「同主机多租户」在安全与开销间按需选择。

## 十、小结

namespace 把全局资源切割成每容器独立视图，是容器「看起来像独立系统」的关键；其中 PID 嵌套、user ns 的 UID 映射尤为精妙。它只解决「看到什么」，资源「用多少」仍需 cgroups，二者加安全加固共同构成现代容器隔离。实践中记住三条：新 ns 不会自动带来网络与主机名，user ns 的 root 不是真 root，挂载传播类型必须显式隔离。
