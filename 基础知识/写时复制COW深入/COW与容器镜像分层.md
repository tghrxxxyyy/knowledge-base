# COW与容器镜像分层

> 对应 Rosenblum & Ousterhout 1992（写时复制思想的源头）、Merkel 2014 *Docker: Lightweight Linux Containers for Consistent Development and Deployment*，以及 Linux 内核 `Documentation/filesystems/overlayfs.rst`。

## 一、背景与挑战

容器镜像由多层堆叠：基础发行版、运行时依赖、应用制品。若每个容器都持有一份完整副本，宿主机磁盘与内存会被成倍浪费——一个 500 MiB 的镜像跑 100 个实例就是 50 GiB。但容器又必须拥有可写文件系统，因为进程会写日志、临时文件与配置。

镜像分层的解法是**联合挂载 + 写时复制**：所有只读层在所有容器间共享，每个容器只额外挂一个可写层，写操作触发 COW 把文件提到可写层。启动一个容器因此接近 $O(1)$，空间占用只与「实际被改动的文件」相关。代价集中在两点：**copy-up 的首次写成本**（整个文件被复制，哪怕只改一个字节）与**层数带来的查找开销**（读路径要自顶向下逐层搜索）。

## 二、核心原理

以 overlayfs 为例，挂载时指定三类目录：`lowerdir`（一到多个只读层，冒号分隔，**靠前者优先级更高**）、`upperdir`（容器可写层）、`workdir`（内核做原子操作如 rename 的临时目录，必须与 `upperdir` 同一文件系统）。核心规则：

1. **读**：自上层向下查找，第一个命中的文件即结果；同路径在多层存在时高层遮蔽低层。
2. **写（copy-up）**：文件若只在 lower 存在，内核先整体复制到 upper（含权限、所有者、扩展属性），再在 upper 上执行写。**copy-up 以文件为粒度**。
3. **删除**：无法从只读层真正删除，改为在 upper 创建 **whiteout** 标记，使读路径认为该文件不存在。
4. **目录**：删除整个目录时用 opaque 标记，使下层该目录内容全部被遮蔽。
5. **rename**：跨层 rename 不能直接完成，需先 copy-up 再改名，因此 `workdir` 上的原子 rename 是必需的。

多个容器共享同一批只读层，**页缓存也随之共享**：同一份基础镜像的库文件在各容器间只有一份内存副本，这是容器密度能远超虚拟机的重要原因。

## 三、形式化与数学基础

设基础层为 $B$，$N$ 个容器各有可写层 $U_i$，则总空间占用为

$$Total = |B| + \sum_{i=1}^{N} |U_i| \;\ll\; N\cdot |Image|$$

若容器 $i$ 的改动集为 $C_i$，则 $|U_i| = \sum_{f \in C_i}\text{copy-up}(f)$，而 copy-up 的粒度代价是

$$\text{cost}(copy\text{-}up(f)) = |f| \quad(\text{与改动字节数无关})$$

这正是 overlayfs 最被诟病的性质：修改 1 GiB 数据库文件的 1 个字节，也要复制 1 GiB。读路径查找深度为层数 $L$，最坏需逐层探测 $C_{lookup} = O(L)$，内核用 dentry cache 与 inode cache 摊销这部分成本。

## 四、代码实现

```bash
# overlayfs 挂载：lower 只读共享，upper 容器可写，work 供内核做原子操作
mount -t overlay overlay \
  -o lowerdir=/img/app:/img/deps:/img/base,\
     upperdir=/writable/upper,workdir=/writable/work \
  /container

# 容器内写 /etc/conf 触发 copy-up，base 层不受影响
# 容器内删 /usr/lib/x.so 在 upper 生成 whiteout，base 层文件仍在
```

```c
/* 同一语义在内核 API 下的表达 */
mount("overlay", "/container", "overlay", 0,
      "lowerdir=/img/app:/img/deps:/img/base,"
      "upperdir=/writable/upper,workdir=/writable/work");
```

镜像构建侧的分层原则与运行侧直接相关：**把变化频率低的层放在下面**（基础库、依赖），应用代码放在上面，这样重建时只需重推最上层并最大化层缓存复用。

## 五、与其他技术对比

| 维度 | overlayfs | aufs | btrfs subvolume | dm-thin 快照 | 全量拷贝镜像 |
| --- | --- | --- | --- | --- | --- |
| 实现位置 | VFS 联合挂载 | VFS 联合挂载 | 文件系统内部 | 块设备层 | 无 |
| COW 粒度 | 文件/目录 | 文件 | 块（extent） | 块 | 无 |
| 需特殊文件系统 | 否（可跑在 ext4） | 否 | 是 | 是 | 否 |
| 层数扩展性 | 差（$O(L)$ 查找） | 差 | 好 | 好 | 不适用 |
| 删除语义 | whiteout | whiteout | 原生删除 | 原生删除 | 原生删除 |
| 典型用途 | 容器根文件系统 | 早期容器 | 快照/子卷 | 云盘快照 | 无共享场景 |

## 六、常见误区

- **「容器写文件会污染镜像」**：写只作用于 upper 层，只读层不变，这是不可变基础设施的基础。
- **「删除文件就能释放空间」**：overlayfs 用 whiteout 标记删除，`upperdir` 仍占空间，且下层文件依然存在。
- **「层越多启动越快」**：层数增加会放大 dentry 查找与 inode 初始化成本，冷启动更慢，通常需控制在合理范围。
- **「copy-up 是增量的」**：copy-up 是整体复制，还可能触发下层目录元数据的复制；大文件随机小写应改用数据卷。
- **「overlayfs 与数据卷等价」**：数据卷直接绑定宿主机目录或独立块设备，完全绕开 copy-up 与 whiteout 语义。

## 七、与开源书·权威来源对应

- **Rosenblum & Ousterhout 1992**：写时复制与日志结构的思想源头，快照通过保留旧根/旧块实现。
- **Linux 内核 `Documentation/filesystems/overlayfs.rst`**：copy-up、whiteout、opaque、redirect、metacopy 与层数性能注意事项的权威说明。
- **OCI Image Format Specification**：镜像清单、层与内容寻址的标准化定义，以官方最新规范为准。
- **Merkel 2014（Linux Journal）**：容器镜像分层与联合文件系统的工程动机。
- **Menage 2004（Ottawa Linux Symposium）**：cgroups 的引入，为容器提供资源隔离的另一半能力。
- **Baumann et al. 2015, *Unikernels: Library Operating Systems for the Cloud* (ASPLOS)**：轻量隔离与镜像构成的对照视角。

## 八、面试题

**Q1：为什么启动 100 个容器不占 100 倍空间？**
要点：只读层在所有容器间共享（含页缓存），每个容器只有自己的 upper 层存差异。

**Q2：whiteout 是什么？**
要点：overlayfs 无法删除只读层文件，于是在 upper 层创建特殊标记，让读路径视该路径为不存在。

**Q3：copy-up 的粒度与代价？**
要点：以文件（含元数据与目录）整体复制，与改动字节数无关；大文件小改写应避免走 overlayfs。

**Q4：为什么需要 `workdir`？**
要点：跨层 rename 无法直接完成，需先 copy-up 再改名，而 rename 必须原子，`workdir` 提供同文件系统的操作空间。

**Q5：分层如何影响镜像拉取速度？**
要点：内容寻址让相同层可复用与并行下载；层少而大则并行度低，层多则查找与解压开销上升，需要权衡。

## 九、演进与趋势

- **只读镜像格式**：EROFS 等只读压缩文件系统作为 lower 层，提供更好的压缩率与读取性能。
- **按需拉取**：stargz、Nydus、zstd:chunked 允许内核在缺数据时按需拉取块，显著缩短大镜像冷启动时间。
- **内核侧增强**：overlayfs 的 `metacopy`（只复制元数据）、`redirect_dir`、`volatile` 挂载等特性减少不必要的 copy-up。
- **安全容器**：gVisor、Kata Containers 在隔离层引入独立内核或轻量虚拟机，镜像分发仍沿用 OCI 分层。
- **块级 COW 回归**：部分运行时用 dm-thin/btrfs 子卷做块级快照，规避文件级整体复制代价。

## 十、小结

容器镜像用「只读层共享 + 可写层差分」实现高密度部署：空间近似 $|B| + \sum|U_i|$，启动接近常数时间，页缓存也能跨容器复用。核心机制是联合挂载下的 lookup、copy-up 与 whiteout，主要代价是文件粒度的整体复制与层数带来的查找开销。理解这三点，就能判断一个工作负载该放镜像层还是该挂数据卷。
