# 容器镜像与overlayfs

> 对应 kernel 文档 overlayfs.rst 与 OCI 镜像规范；Docker 存储驱动实践。

## 一、背景与挑战

容器镜像由多层（layer）构成：每一层是上一层的差异（增/删/改文件）。运行时需要在这些只读层之上叠加一个可写层，让容器看到统一的文件系统视图，且容器内的写操作不能污染底层共享镜像。直接在 base 上拷贝代价太高，因此需要「联合挂载（union mount）」：把多层合并为一个目录，按需 COW（写时复制）。overlayfs 是 Docker 等主流运行时的默认存储驱动。

这一设计的本质是空间与时间的权衡：共享只读层让同主机上千个容器几乎零成本复用基础镜像；可写层只在真正修改时才复制文件，避免「每容器一份完整拷贝」的爆炸式磁盘占用。

但它也带来三类新问题：其一是「层深带来的查找与复制成本」；其二是「删除的语义化」（需要 whiteout 而非真删）；其三是「可写层的生命周期」——容器销毁即丢失，因此持久数据必须外挂卷，否则「改了半天全没了」是常见困惑。

## 二、核心原理

overlayfs 把若干目录联合成一个挂载点，关键目录有四个：一个或多个 `lowerdir`（只读，可多层）、一个 `upperdir`（可读写，容器层）、一个 `workdir`（内部临时目录，用于原子 COW 与白化操作）、以及挂载点 `merged`。读文件时自最上层向下查找（upper 优先，再逐层 lower）；首次写文件时把文件从 lower COW 复制到 upper，之后修改只影响 upper。

删除文件用 **whiteout（白化）** 机制：在 upper 中创建一个特殊的 `overlay.whiteout` 字符设备（主设备号 0），用它遮蔽下层同名文件，使合并视图「看不到」该文件——这正是叠加文件系统的「删除」实现。`Opaque whiteout`（`upper` 目录上设 `trusted.overlay.opaque=y`）则遮蔽整个下层目录内容。把容器提交（commit）时，把 upper 固化为新镜像层即可。

还需注意「目录合并语义」：同名目录在多层间会被**合并**（各层内容叠加可见），而不是简单覆盖；只有文件与符号链接才遵循「上层遮蔽下层」。这一差异是排查「文件明明删了却还在」「目录里多出下层的文件」问题的关键。

## 三、形式化与数学基础

合并视图 $V$ 对路径 $x$ 的解析（上层优先，$\oplus$ 表示层叠）：

$$ V(x) = first\_hit(x,\ upper \oplus lower_1 \oplus lower_2 \oplus \dots \oplus lower_k) $$

写复制单文件成本约为 $O(size(file))$（复制到 upper）；层深 $k$ 决定查找最坏 $O(k)$。磁盘空间节省近似：

$$ Total = \sum_{i} |lower_i| + |upper_{diff}| $$

即所有共享只读层只存一份，只有差异进入可写层。注意 `workdir` 不参与合并视图，仅用于保证 COW 的原子性（先写 work，再 rename 到 upper）。

| 操作 | 合并视图表现 | upper 中的实际状态 |
| --- | --- | --- |
| 读未修改文件 | 来自 lower | 无条目 |
| 首次写文件 | 复制到 upper 后修改 | 完整文件副本 |
| 删除文件 | 不可见 | whiteout 字符设备 |
| 删除目录内容 | 目录为空 | opaque 标记 |
| 新建文件 | 可见 | 普通文件 |

## 四、代码实现

```bash
# 手动用 overlayfs 联合挂载多层
mount -t overlay overlay -o \
  lowerdir=/img/layer1:/img/layer2,upperdir=/c/upper,workdir=/c/work \
  /merged

# 容器内写 /etc/hosts -> COW 到 upper，原层不变
echo "127.0.0.1 app" > /merged/etc/hosts
ls -l /c/upper/etc/hosts        # 差异只出现在 upper

# 删除文件：生成 whiteout 字符设备遮蔽下层
rm /merged/old.conf
# upper 中会出现 char device 0,0 名为 old.conf（白化）
```

```bash
# 查看与清理：定位「可写层吃满磁盘」的元凶
du -sh /var/lib/docker/overlay2/*/diff | sort -h | tail   # 各容器可写层大小
docker system df                                          # 镜像/容器/卷/缓存占用
docker image prune -a                                     # 回收未使用镜像层
# 注意：容器内的 rm 不会释放空间，whiteout 仍占 inode
```

## 五、与其他技术对比

| 维度 | overlayfs | aufs | btrfs/zfs | 全量拷贝 |
| --- | --- | --- | --- | --- |
| 是否内核原生 | 是（主线） | 否（已弃用） | 是（子卷 COW） | 否（浪费空间） |
| 白化/删除 | whiteout 字符设备 | 类似 | 子卷快照 | 直接删 |
| 多层查找 | O(k) | O(k) | 快照链 | 无 |
| 启动速度 | 快 | 快 | 中 | 慢 |

overlayfs 通用、跨文件系统；btrfs/ZFS 用子卷与原生快照实现 COW，但要求底层是对应文件系统；aufs 早期但已弃。相较全量复制，overlay 显著省空间、启动快，但层过多会拖慢查找与 COW。

| 镜像格式 | 特点 | 启动优化 |
| --- | --- | --- |
| 传统 tar 层 | 简单通用 | 需完整拉取 |
| stargz/eStargz | 可分块按需拉取 | 免解压、按需读 |
| Nydus | 元数据与数据分离 | 秒级启动 |

## 六、常见误区

- 误以为写操作进了基础镜像层。错，只写入 upperdir，base 只读不变。
- 误以为删文件立即释放空间。错，upper 中的 whiteout 仍占 inode，需 `docker image prune` 才真正回收。
- 误以为层越多越好。错，层深增加查找与 COW 成本，且每层都带来元数据开销。
- 误以为 overlay 替代了卷持久化。错，容器可写层随容器销毁而消失，持久数据应走 volume/挂载。
- 误以为 workdir 参与合并视图。错，workdir 仅内部原子操作使用。
- 误以为同名目录会像文件一样整体遮蔽。错，目录在多层间是**合并**的，只有目录内的同名文件才被遮蔽。

## 七、与开源书·权威来源对应

- 内核文档 `Documentation/filesystems/overlayfs.rst`（lowerdir/upperdir/workdir、whiteout）。
- OCI Image Specification（镜像层、diff、whiteout 约定）。
- Docker 官方文档「Use the overlay storage driver」。
- Baumann 2015「Unikernels: Library Operating Systems for the Cloud」关于轻量隔离与镜像的讨论。

## 八、面试题

1. 容器写文件为何不影响基础镜像？（COW 到 upperdir，下层只读。）
2. whiteout 是什么？如何表示删除？（upper 中的 `overlay.whiteout` 字符设备，遮蔽下层同名文件。）
3. `lowerdir` 多层的查找顺序？（从最上层 lower 向下，upper 优先于所有 lower。）
4. 为什么层太多会慢？（每层查找 O(k)，COW 复制成本随文件增大。）
5. 同名目录在多层间如何处理？（目录内容合并可见，不同于文件的整体遮蔽。）
6. `workdir` 为何必须与 upperdir 同一文件系统？（COW 依赖 `rename` 的原子性，跨文件系统无法保证。）

## 九、演进与趋势

erofs（Enhanced Read-Only File System）只读镜像 + overlay 成为高密度场景主流；stargz/lazy-pull 按需拉取单层内某个文件，缩短大镜像启动等待。OCI 镜像规范稳定，但「镜像内容寻址 + 去重」让同层在节点间零拷贝复用；eStargz 与 Nydus 进一步把元数据与数据分离，实现「秒级」启动。

另一个方向是「更少复制」：overlayfs 的 metacopy 特性允许只复制元数据（权限、扩展属性）而不复制数据，直到真正写入内容才触发完整 COW；data-only lower 层与 `redirect_dir` 则支持目录重命名与更细的层间引用。这些特性都在把「写放大」进一步推迟，服务于函数计算等「启动极频繁、写入极少」的场景。

## 十、小结

overlayfs 以「只读层共享 + 可写层差分（COW + whiteout）」实现容器镜像的高效叠加与提交，是容器存储核心。理解 upper/lower/work 三角与白化机制，是排查「容器改了文件但镜像没变」或「磁盘被可写层吃满」类问题的前提。落地时牢记三点：持久数据必须挂卷、删除不会立刻释放空间、同名目录是合并而非遮蔽。
