# 容器与 Docker

## 〇、本体介绍

**容器（Container）是什么**：容器不是一个「小虚拟机」，而是一组**被 Linux 内核特性隔离起来的普通进程**。它通过 **Namespace** 让进程「看不见」宿主机和其他容器（视图隔离），通过 **cgroup** 限制它能用多少 CPU / 内存 / IO（资源约束），再通过 **UnionFS（联合文件系统）** 给它一套分层、可读写的文件系统视图。

**解决什么痛点**：VM 虚拟化的是「操作系统」，每台都要跑完整 Guest OS，启动分钟级、镜像 GB 级；容器虚拟化的是「进程」，共享宿主内核，启动秒级、镜像 MB 级。云原生时代要高密度、秒级扩缩，容器是天然选择。

**核心概念**：镜像（Image，只读模板）、容器（Container，镜像的运行实例）、仓库（Registry，镜像分发，如 Docker Hub / Harbor / ECR）。三者关系类比「类 / 对象 / 应用商店」。

**适用场景**：微服务部署、CI/CD 构建环境、批处理、任何需要「一次构建、处处运行」的场合。
**不适用场景**：强安全隔离（共享内核，隔离性弱于 VM）、需要自己内核模块或特定内核版本的工作负载。

---

## 一、容器 vs 虚拟机（面试必考）

| 维度 | 容器 | 虚拟机 |
|------|------|--------|
| 虚拟化对象 | 进程（共享宿主内核） | 操作系统（含 Guest OS 内核） |
| 隔离机制 | Namespace + cgroup | Hypervisor + 独立内核 |
| 启动时间 | 秒级 | 分钟级 |
| 镜像/实例体积 | MB 级 | GB 级 |
| 性能开销 | 近原生（无 Hypervisor） | 5%~15% 损耗 |
| 隔离强度 | 较弱（共用内核） | 强（独立内核） |
| 单机密度 | 上千 | 几十 |

> 形象记忆：**VM 像独栋房子，容器像同一栋楼里的独立房间**——牺牲一点隔离性，换极高启动速度与资源利用率。

---

## 二、Namespace：做什么「看得见」

Namespace 给进程一套独立的「视图」，让容器以为自己独占系统：

- **PID**：容器内进程从 PID 1 开始，看不到宿主进程。
- **Network**：独立的网络栈（网卡、IP、端口空间），这就是为什么每个 Pod 有独立 IP。
- **Mount**：独立的文件系统挂载树。
- **UTS**：独立的主机名 / 域名。
- **IPC**：独立的进程间通信（信号量 / 消息队列）。
- **User**：把容器内的 root 映射成宿主机的普通用户，降低容器逃逸危害。

---

## 三、cgroup：限定「用多少」

cgroup（control groups）对进程组的资源使用做**限制与统计**：

- **CPU**：`cpu.shares`（相对权重）、`cpu.cfs_quota_us` / `cpu.cfs_period_us`（绝对上限，如 2 核）。
- **Memory**：`memory.limit_in_bytes`，超限触发 **OOM Killer** 杀进程。
- **IO**：限制块设备读写速率。
- **PIDs**：限制容器内最大进程数（防 fork 炸弹）。

> 一句话：**Namespace 决定「能看到什么」，cgroup 决定「能用多少」**，二者配合，没有 Hypervisor、没有 Guest 内核，所以轻。

---

## 四、镜像分层与 UnionFS（OverlayFS）

Docker 镜像是一摞**只读层（layer）**，每条 Dockerfile 指令（FROM / RUN / COPY / ADD）生成一个层，层 ID 是该层内容的 SHA256（内容寻址）。

- **层共享**：两个镜像若 `FROM` 同一个基础镜像，该基础层在磁盘上只存一份，拉取时也只下载本地没有的层。
- **容器可写层**：容器启动时，在只读镜像层之上加一层**薄薄的可写层**。读向下穿透到镜像层；写落在可写层（Copy-on-Write，修改文件时先把它从镜像层「拷贝上来」再改）。
- **易失性**：容器删除，可写层随之消失，镜像层不变——所以**容器内写的数据不持久，必须挂卷（Volume）**。

> 这就是为什么容器是 **ephemeral（易失）** 的：任何不写进 Volume 的数据，容器一删就没。

---

## 五、Dockerfile 最佳实践（生产级）

1. **多阶段构建（Multi-stage）**：一个 stage 编译（含 SDK/构建工具），另一个 stage 只放编译产物与运行时。`FROM ... AS build` → `COPY --from=build`。镜像可从 1GB+ 降到 50~100MB，生产镜像里没有源码和编译器。
2. **固定基础镜像 tag**：`FROM python:3.12.3-slim`，别用 `latest`（破坏可重现性）。
3. **按变更频率排指令**：少变的（装系统包）放前面、常变的（拷贝业务代码）放后面，充分利用**层缓存**（改前面的指令会使后面所有层失效）。
4. **合并 RUN + 清理**：`apt-get update && apt-get install -y ... && rm -rf /var/lib/apt/lists/*`，减少层体积。
5. **非 root 运行**：创建 `appuser` 后 `USER appuser`，降低容器逃逸后拿到宿主 root 的风险。
6. **.dockerignore**：排除 `.git`、`node_modules`、`__pycache__`，缩小构建上下文、加速构建。
7. **HEALTHCHECK**：`HEALTHCHECK CMD curl -f http://localhost:8080/health || exit 1`，供编排器判断健康。

---

## 六、容器网络模式

- **Bridge（默认）**：容器连到虚拟网桥 `docker0`，同网桥内互通；`-p 8080:80` 把容器端口映射到宿主。
- **Host**：共享宿主网络命名空间，无 NAT 开销、无端口隔离，性能高但隔离差。
- **None**：只有 loopback，用于无需网络的批处理。
- **Overlay**：跨主机的虚拟网络（VXLAN 封装），用于 Swarm / K8s。

---

## 七、数据持久化

容器可写层易失，持久化靠：

- **Named Volume**（推荐，数据库首选）：由 Docker 管理，独立于容器生命周期。
- **Bind Mount**：把宿主目录挂进容器，适合开发热重载。
- **tmpfs**：纯内存，不落盘，适合敏感临时文件。

---

## 八、镜像仓库与分发

- 公有：Docker Hub（默认）；私有：Harbor、阿里云 ACR、腾讯云 TCR、AWS ECR、GitHub Packages。
- 工作流：`docker build -t myapp:1.0 .` → `docker tag` → `docker push`。
- 生产建议开启**镜像扫描（Trivy / Clair）**与**签名（cosign）**，防供应链投毒。

---

## 九、容器安全要点

- 非 root 运行、加 `USER`。
- 最小基础镜像（distroless / slim），减少攻击面。
- 只读根文件系统（`--read-only`）+ 独立 writable 卷。
- 限制能力（`--cap-drop ALL`，按需 `--cap-add`）。
- 配合 **Seccomp / AppArmor** 与 **Pod Security Admission**（K8s 侧）。

---

## 十、与其他板块的关系

- **Kubernetes 核心**：K8s 的 Pod 本质就是「共享 Network/IPC Namespace 的一组容器」，底层正是 Namespace + cgroup。
- **CI/CD**：镜像构建是多阶段流水线的产物，GitOps 以镜像 tag 为交付单元。
- **源码系列 / Nacos 等**：这些中间件最终都打成镜像在容器里跑。

---

## 十一、速查表

| 动作 | 命令 |
|------|------|
| 构建镜像 | `docker build -t myapp:1.0 .` |
| 起容器（后台） | `docker run -d -p 8080:80 --name web myapp:1.0` |
| 看运行容器 | `docker ps` / 含停止 `docker ps -a` |
| 看镜像层 | `docker image history myapp:1.0` |
| 看资源占用 | `docker stats` |
| 进容器 | `docker exec -it web sh` |
| 清理 | `docker system prune -a` |

---

## 面试高频问题（20+ 条）

1. **容器和虚拟机本质区别？** 容器虚拟化进程（共享内核，Namespace+cgroup），VM 虚拟化 OS（独立内核）。容器轻、快、密度高，隔离弱。
2. **Docker 有哪几个核心组件？** 镜像（只读模板）、容器（运行实例）、仓库（分发）。
3. **镜像为什么分层？好处？** 基于 OverlayFS，每条指令一层；多镜像共享基础层省存储、构建用缓存加速、拉取只下缺失层。
4. **容器和镜像的关系？** 镜像静态模板 = 类，容器是镜像运行实例 = 对象；一个镜像可起多个互不干扰的容器。
5. **Namespace 有哪几种、各隔离什么？** PID/Net/Mount/UTS/IPC/User，分别隔离进程视图、网络、挂载、主机名、IPC、用户。
6. **cgroup 管什么？** CPU（shares/quota）、内存（超限 OOM）、IO、PIDs。Namespace 管「看见什么」，cgroup 管「用多少」。
7. **容器进程和宿主进程是什么关系？** 容器进程就是宿主上的普通进程，只是被 Namespace/cgroup 约束，共享宿主内核。
8. **UnionFS / 可写层原理？** 只读镜像层 + 顶部可写层；读穿透、写落到可写层（CoW）；容器删则可写层丢。
9. **为什么容器数据要挂卷？** 可写层随容器销毁而消失，Volume 独立于容器生命周期才持久。
10. **多阶段构建是什么、为什么用？** 编译 stage + 运行 stage，最终镜像只含产物与运行时，体积从 GB 降到 MB，且无源码/编译器。
11. **Dockerfile 怎么减小镜像？** 固定 tag、合并 RUN+清理、多阶段、.dockerignore、slim 基础镜像。
12. **层缓存规则？** 指令不变则复用；改了前面的指令，其后所有层缓存全失效——故少变的放前、常变放后。
13. **Bridge / Host / None 网络区别？** Bridge 默认虚拟网桥；Host 共享宿主网络无 NAT；None 仅 loopback。
14. **容器的隔离性弱点？** 共享内核，一个容器逃逸可能影响宿主；需非 root + 降权 + Seccomp 兜底。
15. **ENTRYPOINT 和 CMD 区别？** ENTRYPOINT 定义不可变的可执行入口，CMD 是其默认参数；`docker run` 传参会覆盖 CMD。
16. **HEALTHCHECK 作用？** 由运行时/编排器定期探测，判断容器「业务健康」而非「进程存活」。
17. **镜像扫描为什么重要？** 防基础镜像带漏洞/后门（供应链安全），配合 Trivy/cosign 签名校验。
18. **容器资源超限会怎样？** 内存超限被 OOM Killer 杀；CPU 超限被限流（throttling）。
19. **docker exec 和 docker attach 区别？** exec 在容器内新开进程（如 shell）；attach 附着到容器主进程的标准流。
20. **K8s 为什么弃用 Docker 作运行时？** K8s 1.24 起用 CRI 标准，containerd/CRI-O 更轻；dockershim 被移除（注意：容器镜像与 Dockerfile 仍通用）。
21. **User Namespace 的安全价值？** 把容器内 root 映射为宿主普通用户，即便逃逸也拿不到宿主 root 权限。
22. **Copy-on-Write 对性能影响？** 首次修改大文件需先拷贝层数据，有写放大；频繁写大文件应放 Volume。
