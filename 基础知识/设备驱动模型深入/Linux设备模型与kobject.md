# Linux设备模型与kobject

> 对应 Corbet、Rubini & Kroah-Hartman《Linux Device Drivers》（LDD3）第 14 章 The Linux Device Model 与 Love《Linux Kernel Development》第 17 章 The Device Model；并参考内核文档 `Documentation/core-api/kobject.rst`。

## 一、背景与挑战

2.6 之前，设备、驱动、总线、电源管理信息分散且难统一。缺少一个统一的对象层次，热插拔、电源状态、sysfs 导出都难以系统化。

设备模型（driver model）用一套统一的「总线-设备-驱动」关系描述硬件，并向用户态暴露 sysfs。

其基石是 `kobject`。它要同时解决：对象生命周期管理（何时释放）、层次化组织（父/子）、与 sysfs 的自动映射、以及事件（uevent）发送。

## 二、核心原理

`kobject` 是内核对象的最小单位，内嵌引用计数 `kref`、父指针 `parent`、名称与所属 `kset`（同类集合）。

通过 `kobject_add` 把它挂入层次，自动在 sysfs 创建对应目录。

`device`、`driver`、`bus_type` 等结构均内嵌 `kobject`，从而形成统一树（如 `/sys/devices` → `/sys/bus`）。

`kref_get`/`kref_put` 管理引用；最后一个引用释放时触发 `kobj_type->release` 回调释放包含 `kobject` 的结构体。

`kset` 是 `kobject` 的集合，同时作为 uevent 的发送点（含 `uevent_ops` 过滤/填充环境变量）。

## 三、形式化与数学基础

引用计数操作：

$$kref\_get: c \leftarrow c+1;\quad kref\_put: c \leftarrow c-1,\ c=0 \Rightarrow release$$

对象生命周期由最后一个引用释放触发 `release` 回调，避免悬空指针。

层次深度 $d$ 下 sysfs 查找为 $O(d)$ 目录遍历；`container_of` 由成员地址反推宿主结构：

$$container\_of(ptr, type, member) = (type*)((char*)ptr - offsetof(type, member))$$

## 四、代码实现

```c
struct my_device {
    struct kobject kobj;   // 内嵌 kobject（组合而非继承）
    int id;
};
static void my_release(struct kobject *k) {
    // 用 container_of 反推宿主并释放
    kfree(container_of(k, struct my_device, kobj));
}
static struct kobj_type my_ktype = {
    .release = my_release,
    .sysfs_ops = &kobj_sysfs_ops,
};
int init(void) {
    kobject_init_and_add(&dev.kobj, &my_ktype, NULL, "mydev%d", dev.id);
    return 0;
}
```

`kobject_put(&dev.kobj)` 递减引用，归零时调用 `my_release`。

## 五、与其他技术对比

| 机制 | 关系 | 生命周期 | sysfs |
| --- | --- | --- | --- |
| `kobject` | 节点 | kref 引用计数 | 自动建目录 |
| `kset` | 集合/容器 | 含 kobject | 自动建子目录 |
| `kref`（独立） | 无层次 | 引用计数 | 无 |
| 用户态对象 | 类继承 | GC/手动 | 无 |

`kobject` 类似 C++ 基类但用组合（内嵌）而非继承；相较用户态对象系统，它强调引用计数与 sysfs 自动导出。

相较单独 `kref`，`kobject` 额外提供层次（parent）与 uevent。

## 六、常见误区

1. 误以为 `kfree` 直接释放含 kobject 的结构：必须靠 `kref_put` 的 release 回调，否则引用未清即释放致 UAF。
2. 误以为 parent 必设：顶层 kobject 可无 parent（挂在 sysfs 根）。
3. 误以为 sysfs 文件即驱动逻辑：它只是属性接口，真正逻辑在 show/store 回调。
4. 误以为 `kobject_init` 即建目录：须 `kobject_add`/`kobject_init_and_add` 才进 sysfs。
5. 误以为 uevent 自动触发用户动作：仅发事件，具体行为由 udev 规则决定。

## 七、与开源书·权威来源对应

- Corbet LDD3 第 14 章完整讲 `kobject`/`kref`/`kset`/`ktype` 与 sysfs 导出。
- Love《LKD》第 17 章讲设备模型、`bus_type`/`device`/`driver` 内嵌 kobject 的关系。
- 内核 `kobject.rst` 详述 `kobject_init_and_add`、`release` 必须设置、及 `container_of` 用法。
- `driver-model/porting.txt` 描述 legacy 驱动迁移到设备模型的要点。

## 八、面试题

1. `kobject` 与 `kref` 关系？要点：kobject 内嵌 kref 实现引用计数生命周期，kref 归零触发 release。
2. `container_of` 宏作用？要点：由内嵌成员地址反推宿主结构指针，是内核组合模式的基石。
3. 为何不能直接 `kfree` 含 kobject 结构？要点：引用计数未归零即释放会 UAF，须走 release。
4. `kset` 与 `kobject` 区别？要点：kset 是同类 kobject 集合，兼作 uevent 发送点与子目录。

## 九、演进与趋势

- 设备模型演进支持异步 probe、设备树（device tree）描述硬件拓扑、以及统一属性组（attribute group）简化 sysfs。
- `component`/`aggregate` 框架处理多子设备（如显示管线）的协同绑定。
- `fw_devlink` 据设备树依赖自动排序 probe 顺序，减少显式 initcall 排序。

## 十、小结

`kobject` 用内嵌组合 + 引用计数把内核对象纳入统一层次，是 sysfs 与电源/热插拔管理的基础设施。

理解 `kref`/`container_of`/`release` 是编写正确、无 UAF 的内核对象代码的先决条件。
