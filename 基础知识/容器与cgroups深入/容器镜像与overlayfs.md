# 容器镜像与overlayfs

> 对应 Baumann 2015 容器/Unikernel 讨论与 kernel 文档 `overlayfs.rst`。

## 一、背景与挑战
镜像由多层构成，需高效叠加：只读层共享、容器可写层记录差异，且多层查找/写时复制正确。overlayfs 联合挂载正是容器存储驱动的经典实现。

## 二、核心原理
overlayfs 把 `lowerdir`（可多层只读）、`upperdir`（可写）、`workdir`（临时）合并为一视图。读从最上层向下找；写时把文件 COW 到 upper；删用 whiteout（`overlay.whiteout` 字符设备）遮蔽下层。提交容器即把 upper 固化为新镜像层。

## 三、形式化与数学基础
合并视图 $V$：
$$V(x) = first\_hit(x,\; upper \oplus lower_1 \oplus ... \oplus lower_k)$$
写复制单文件成本 $O(size(file))$ 到 upper；层深 $k$ 决定查找最坏 $O(k)$。空间节省：
$$Total = \sum lower + |upper_{diff}|$$

## 四、代码实现
```bash
mount -t overlay overlay -o \
  lowerdir=/img/l1:/img/l2,upperdir=/c/upper,workdir=/c/work \
  /merged
# 容器内写 /etc/hosts -> COW 到 upper，原层不变
# 提交：tar upper 作为新层
```

## 五、与其他技术对比
overlayfs 通用跨 FS；btrfs/ZFS 用子卷/COW 原生快照；aufs 早期但已弃。相较全量复制，overlay 省空间启动快。whiteout 处理删除是叠加特色。

## 六、常见误区
误以为写进镜像层：只进 upper，base 只读。误以为删文件立即释放：upper whiteout 仍占。误以为层越多越好：查找与 COW 成本随层增。

## 七、与开源书/权威来源对应
内核 overlayfs 文档；Docker 镜像分层与存储驱动；Baumann 2015。

## 八、面试题
问：容器写文件为何不影响基础镜像？答：COW 到 upperdir，下层只读。问：whiteout 是什么？

## 九、演进与趋势
erofs 只读镜像 + overlay 成主流；stargz/lazy-pull 按需拉层减少启动等待；OCI 镜像规范稳定。

## 十、小结
overlayfs 以只读层共享 + 可写层差分，实现容器镜像的高效叠加与提交，是容器存储核心。
