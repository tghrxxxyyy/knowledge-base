# sysfs与uevent热插拔

> 对应 Corbet、Rubini & Kroah-Hartman《Linux Device Drivers》（LDD3）第 14 章 The Linux Device Model 与 Love《Linux Kernel Development》第 17 章 The Device Model；并参考内核文档 `Documentation/filesystems/sysfs.rst` 与 `Documentation/core-api/kobject.rst`。

## 一、背景与挑战

用户态如何查看/调节内核设备属性？设备热插拔（U 盘、网卡、GPU）时用户态如何得知并自动建节点、加载固件？

sysfs 提供内核对象的属性视图，uevent 提供内核→用户态的事件通道。

二者共同支撑 udev/devtmpfs 的自动配置。挑战在于：属性接口要结构化、可脚本化，事件要可靠送达且不丢，且权限与安全需可控。

## 二、核心原理

sysfs 是内存文件系统，把 `kobject` 层次导出为目录树（`/sys`），属性以文件呈现，读触发 `show`、写触发 `store` 回调。

kobject 状态变化（add/remove/change）经 `kobject_uevent` 发 `netlink` 广播（或经 `/sys/kernel/uevent_helper`），udev 据此创建设备节点、加载固件、设权限。

属性回调接收 `struct kobject *`、`struct kobj_attribute *`、缓冲区与长度，返回写入字节数。

`kobj_attribute` 用 `__ATTR(name, mode, show, store)` 声明，多个属性聚成 `attribute_group` 一次注册。

## 三、形式化与数学基础

uevent 序列（从内核到用户态）：

$$event \to kobject\_uevent(env) \to netlink(NLMSG) \to udevd \to mknod(/dev/x)$$

属性读写：$read \Rightarrow show(kobj,attr,buf)$；$write \Rightarrow store(kobj,attr,buf,len)$。

约定「一个属性一文件、单行值」，避免解析歧义；多值用多个文件或子目录。

netlink 广播为异步、best-effort，udev 需对启动前已存在的设备做冷插拔（coldplug）重放。

## 四、代码实现

```c
static ssize_t val_show(struct kobject *k, struct kobj_attribute *a, char *b) {
    return sprintf(b, "%d\n", my_val);          // 单行值，便于脚本解析
}
static ssize_t val_store(struct kobject *k, struct kobj_attribute *a,
                          const char *b, size_t len) {
    sscanf(b, "%d", &my_val);                   // 写即设置
    return len;
}
static struct kobj_attribute attr_val = __ATTR(val, 0644, val_show, val_store);

// kobject 加入 sysfs 后 /sys/.../val 可读写
static struct attribute *attrs[] = { &attr_val.attr, NULL };
static struct attribute_group grp = { .attrs = attrs };
sysfs_create_group(kobj, &grp);
```

## 五、与其他技术对比

| 接口 | 定位 | 结构 | 典型用途 |
| --- | --- | --- | --- |
| procfs | 进程/调试杂项 | 自由文本 | `ps`、调参 |
| sysfs | 设备/对象属性 | 一属性一文件 | 设备视图、调参 |
| configfs | 用户建内核对象 | 可创建目录 | 运行时配置（如 netconsole） |
| ioctl | 设备控制 | 二进制命令 | 复杂控制（渐被替代） |

procfs 偏进程/调试杂项；sysfs 强调结构化设备视图；configfs 允许用户态创建内核对象。

相较 ioctl，sysfs 文本接口更易脚本化、可权限管控。

## 六、常见误区

1. 误以为 sysfs 文件可放大块二进制：应单一小值，二进制用 `bin_attribute`。
2. 误以为 uevent 一定触发 udev：需用户态守护监听 netlink，否则仅留 `uevent_helper`。
3. 误以为写 sysfs 即持久：多为运行时，重启失效（除非驱动/固件写回非易失存储）。
4. 误以为 show/store 可长时间阻塞：sysfs 属性应轻量，重活不应放在属性回调。
5. 误以为属性名任意：同一 group 内属性名须唯一，且避免与目录冲突。

## 七、与开源书·权威来源对应

- Corbet LDD3 第 14 章讲 sysfs 属性、`kobject`、`attribute_group` 与 uevent。
- Love《LKD》第 17 章讲设备模型、`kobject`/`kset` 与 sysfs 导出。
- 内核 `sysfs.rst` 规定「一属性一文件、单行」约定与 `bin_attribute` 用法。
- `kobject.rst` 描述 `kobject_uevent` 的环境变量（ACTION/DEVPATH/SUBSYSTEM）格式。

## 八、面试题

1. 插 U 盘后 `/dev/sdX` 怎么来的？要点：内核 kobject_uevent 发 netlink，udev 据规则 mknod 并命名。
2. sysfs 与 procfs 区别？要点：sysfs 是设备/对象的结构化属性视图，procfs 偏进程/调试自由文本。
3. uevent 丢失怎么办？要点：udev 冷插拔重放已存在设备；关键事件可用 `udevadm monitor` 观测。
4. 为何一属性一文件？要点：避免解析歧义，便于 shell/规则单行读写与权限控制。

## 九、演进与趋势

- udev 并入 systemd，规则引擎更强，并引入 `hwdb` 做设备属性数据库。
- devtmpfs 内核预建节点，用户态仅做权限/符号链接，加速启动。
- `character device` 与 `gpio/led` 等子系统把属性进一步标准化为统一 ABI。

## 十、小结

sysfs + uevent 把内核设备对象与事件暴露给用户态，是热插拔与设备配置自动化的支柱。

二者以结构化属性与 netlink 事件替代散落的 ioctl/proc 接口，构成现代 Linux 设备用户态契约。
