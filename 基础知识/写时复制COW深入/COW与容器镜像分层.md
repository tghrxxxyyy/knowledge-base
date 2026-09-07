# COW与容器镜像分层

> 对应 Baumann 2015 "Unikernels: Library Operating Systems for the Cloud"（容器/隔离思路）与 Menage 2004 cgroups 内核对容器支撑。

## 一、背景与挑战
容器镜像由多层（base、依赖、应用）堆叠，若每层复制会极占空间。容器运行时用写时复制叠加层：只读层共享，容器可写层仅记录差异，启动快且省空间。

## 二、核心原理
overlayfs/aufs 把多层只读目录与原可写目录联合挂载：读自上层向下查找，写时把文件 COW 到可写层（upperdir），删用白障（whiteout）标记。因此百个容器共享同一 base 层物理存储，各自 upperdir 仅含改动。

## 三、形式化与数学基础
N 个容器共享 base 层 $B$，各写层 $U_i$：
$$Total = |B| + \sum_i |U_i| \ll N \cdot |Image|$$
写时复制单个文件成本：$copy(file)$ 到 upperdir。查找深度 = 层数 $L$，最坏 $O(L)$。

## 四、代码实现
```c
// overlayfs 挂载：lower 只读共享，upper 容器可写
mount("overlay", "/container", "overlay", MS_PRIVATE,
      "lowerdir=/img/base:/img/deps,upperdir=/writable/upper,"
      "workdir=/writable/work");
// 容器内写 /etc/conf 被 COW 到 upper，不影响 base
```

## 五、与其他技术对比
overlayfs COW vs 全量拷贝镜像：省空间启动快；vs 快照克隆（btrfs subvolume）：overlay 更通用跨 FS。相较 VM 磁盘差分，容器层更轻。

## 六、常见误区
误以为容器写不影响镜像：会 COW 到 upper 但 base 不变。误以为删除文件释放空间：overlay 用 whiteout，仍占 upper。误以为层越多越快：查找与 COW 成本随层数增。

## 七、与开源书/权威来源对应
overlayfs 内核文档；Baumann 2015 讨论轻量隔离；Docker 镜像分层规范。

## 八、面试题
问：为什么启动 100 个容器不占 100 倍空间？答：只读层共享，仅写层存差异。问：whiteout 是什么？

## 九、演进与趋势
erofs 只读镜像 + overlay 成主流；stargz/lazy-pull 按需拉层；OCI 镜像规范持续演进。

## 十、小结
容器镜像用 COW 叠加层实现"共享只读 + 差分可写"，使高密度部署既省空间又快速启动。
