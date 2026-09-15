# 网络命名空间 API 与 setns

> 对应 Linux man setns(2) / unshare(2) / clone(2) / network_namespaces(7) / ioctl_nsfs(2)。

## 一、背景与挑战

容器运行时、网络 agent、抓包与监控工具经常需要在**运行中**进入某个已存在的网络命名空间：在容器网络栈里执行诊断、为容器插入规则、或从宿主侧读取容器的套接字状态。重启进程不现实，`fork` 一个新进程去执行命令也会带来额外的进程模型复杂度。

`setns(2)` 就是为此设计的：让调用线程加入一个已有的命名空间。它的语义边界（哪些调用可行、影响范围多大、对已打开对象是否生效）是使用中最容易踩坑的部分。

## 二、核心原理

操作 netns 的系统调用构成"三件套"：

- `clone(CLONE_NEWNET)`：创建**新** netns，子进程在其中出生；
- `unshare(CLONE_NEWNET)`：当前进程脱离当前 netns，切换到**新** netns；
- `setns(fd, CLONE_NEWNET)`：加入**已有** netns，fd 指向该命名空间实例。

netns 实例通过 **nsfs** 以文件形式暴露，路径有两类：

- `/proc/<pid>/ns/net`：某进程所属的 netns（随进程生命周期）；
- `/var/run/netns/<name>`：`ip netns add` 创建的 bind mount，作为独立引用让 netns 在无进程时也存活。

命名空间 fd 还可以用 `ioctl(NS_GET_NSTYPE)` 查询类型、`NS_GET_USERNS` 获取所属 user namespace、`NS_GET_PARENT` 获取父级（用于层级化 ns 如 user ns）。

`setns` 的关键语义：它只改变**调用线程**的命名空间指针，且只影响此后创建的对象——已经打开的套接字仍归属旧 netns。此外，若调用线程与其他线程共享文件系统属性（CLONE_FS），则无法加入新的 netns/UTS/IPC 命名空间，因为 `/proc/net`、`/sys` 挂载视图会随之失效；正确做法是让一个**单线程**辅助进程执行 setns 后再派生子进程。

## 三、形式化与数学基础

把 `setns` 的作用写成状态转移。设调用线程为 $t$，目标命名空间为 $n$，已有打开对象集合为 $O_{t}$：

$$t.ns_{net} \leftarrow n,\qquad O_t \text{ 保持不变}$$

即"引用绑定"只对新建对象生效：

$$\forall o \in O_t:\ o.ns_{net} = n_{old},\qquad \forall o' \notin O_t \text{ 且 } create(o') \text{ 之后}:\ o'.ns_{net} = n$$

前置条件可形式化为需同时满足：

$$Has\,(t, n.user\_ns, CAP\_SYS\_ADMIN) \;\land\; \neg shares\_CLONE\_FS(t, sibling\_threads)$$

这两个条件解释了 rootless 容器（user ns 内持有 CAP_SYS_ADMIN）与多线程程序（需拆出单线程辅助进程）两种典型场景。

## 四、代码实现

```c
/* 进入已有 netns，并在其中创建一个套接字 */
#define _GNU_SOURCE
#include <fcntl.h>
#include <sched.h>
#include <stdio.h>
#include <unistd.h>
#include <sys/socket.h>

int main(void) {
    int fd = open("/var/run/netns/ns1", O_RDONLY | O_CLOEXEC);
    if (fd < 0) { perror("open"); return 1; }
    if (setns(fd, CLONE_NEWNET) < 0) { perror("setns"); return 1; }
    close(fd);
    /* 此后创建的套接字属于 ns1（之前的仍属旧 ns） */
    int s = socket(AF_INET, SOCK_STREAM, 0);
    return s < 0 ? 1 : 0;
}
```

```bash
# 等价命令行：进入 ns1 执行命令
nsenter --net=/var/run/netns/ns1 ip addr show
ip netns exec ns1 ss -lntp
# 反向操作：把宿主某网卡放入 ns1
ip link set eth1 netns ns1
```

## 五、与其他技术对比

| 维度 | clone | unshare | setns |
| --- | --- | --- | --- |
| 作用对象 | 新建子进程 | 当前进程 | 当前线程 |
| 结果 | 子进程在新 ns | 进程迁入新 ns | 线程加入已有 ns |
| 典型用途 | 容器启动 | 沙箱初始化 | 运维/诊断/agent |
| 是否保留原 ns 引用 | 是（父进程） | 否（需先 open 保存） | 是（fd 可继续持有） |
| 多线程约束 | 无 | 有（需单线程） | 有（CLONE_FS 限制） |

`nsenter` 是 `setns` 的命令行封装；`ip netns exec` 内部同样是 setns + exec。

## 六、常见误区

1. **以为 setns 会改写已打开的套接字**：不会，只有之后创建的对象落入目标 netns；数据库/服务进程热迁移网络时必须重建连接。
2. **忘记 bind mount 导致 `ip netns list` 为空**：netns 只有被挂载或进程引用才存活，无引用即被销毁。
3. **在多线程进程中直接 setns**：共享 CLONE_FS 时会失败（EINVAL），应先用单线程辅助进程完成切换再 fork。
4. **忽略 capability 检查的目标**：需要的是**目标命名空间所属 user namespace** 中的 CAP_SYS_ADMIN，而非当前 ns 中的。
5. **以为 setns 可以回退**：未保存原 netns 的 fd，就无法再切回去。

## 七、与开源书·权威来源对应

- Linux man pages：`setns(2)`、`unshare(2)`、`clone(2)`、`network_namespaces(7)`、`ioctl_nsfs(2)`、`namespaces(7)`。
- Kerrisk《The Linux Programming Interface》命名空间与 clone/unshare 章节。
- Love《Linux Kernel Development》进程创建与命名空间相关说明。
- `nsenter(1)`、`ip-netns(8)` 手册中的行为描述。
- 具体的 capability 判定细节与错误码随内核版本变化，以官方文档最新版本为准。

## 八、面试题

1. **setns 与 unshare 的区别？** 要点：setns 加入已有命名空间、影响调用线程；unshare 创建新命名空间、迁移当前进程。
2. **如何查看某进程的 netns？** 要点：`readlink /proc/<pid>/ns/net`、`lsns -t net`、`ip netns pids <name>`。
3. **setns 后原来的套接字怎么办？** 要点：仍绑定原 netns，需要在新 ns 中重新创建；跨 ns 传递可用已有连接或 UNIX 域套接字。
4. **为什么多线程程序 setns 会失败？** 要点：线程共享文件系统属性（CLONE_FS），切换会使挂载视图失效，故内核拒绝。
5. **netns 文件描述符有什么额外能力？** 要点：可通过 nsfs ioctl 查询类型（NS_GET_NSTYPE）、所属 user ns（NS_GET_USERNS）、父 ns（NS_GET_PARENT）。

## 九、演进与趋势

nsfs 的 ioctl 接口让工具能以编程方式探索命名空间层级（如把容器内 ns 映射到宿主 ns）；eBPF 支持把程序挂载到特定 netns，使可观测与策略下发无需进入该 ns。容器运行时进一步通过 `open_tree`/`move_mount` 等新挂载 API 精细管理 netns 文件的生命周期；rootless 场景下 user ns + netns 的组合也在持续完善。

## 十、小结

`clone`/`unshare`/`setns` 是操作 netns 的系统调用三件套：创建、迁移、加入。理解 setns 的两个硬约束（只影响本线程与之后创建的对象、需目标 user ns 的 CAP_SYS_ADMIN 且不受 CLONE_FS 限制），就掌握了容器与网络工具进行命名空间操作的全部底层机制。
