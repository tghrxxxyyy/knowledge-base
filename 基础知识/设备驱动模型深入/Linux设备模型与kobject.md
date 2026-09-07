# Linux设备模型与kobject

> 对应 Corbet《Linux Device Drivers》第 14 章设备模型与 Love《Linux Kernel Development》第 17 章。

## 一、背景与挑战
2.6 之前，设备、驱动、总线、电源管理信息分散且难统一。设备模型（driver model）用一套统一内核对象层次描述"总线-设备-驱动"关系，并向用户态暴露 sysfs。其基石是 `kobject`。

## 二、核心原理
`kobject` 是内核对象的最小单位，内嵌引用计数 `kref`、父指针 `parent`、名称与 `kset`（同类集合）。通过 `kobject_add` 把它挂入层次，自动在 sysfs 创建对应目录。`device`、`driver`、`bus_type` 等结构均内嵌 `kobject`，从而形成统一树。

## 三、形式化与数学基础
引用计数：
$$kref\_get: c \leftarrow c+1;\quad kref\_put: c \leftarrow c-1,\; c=0 \Rightarrow release$$
对象生命周期由最后一个引用释放触发 `release` 回调，避免悬空指针。层次深度 $d$ 下 sysfs 查找为 $O(d)$ 目录遍历。

## 四、代码实现
```c
struct my_device {
    struct kobject kobj;   // 内嵌 kobject
    int id;
};
static void my_release(struct kobject *k) {
    kfree(container_of(k, struct my_device, kobj));
}
int init(void) {
    kobject_init_and_add(&dev.kobj, &my_ktype, NULL, "mydev%d", dev.id);
    return 0;
}
```

## 五、与其他技术对比
`kobject` 类似 C++ 基类但用组合（内嵌）而非继承；相较用户态对象系统，它强调引用计数与 sysfs 自动导出。相较 `kref` 单独使用，`kobject` 额外提供层次与 uevent。

## 六、常见误区
误以为 `kfree` 直接释放含 kobject 的结构：必须靠 `kref_put` 的 release 回调。误以为 parent 必设：顶层 kobject 可无 parent。误以为 sysfs 文件即驱动逻辑：它只是属性接口。

## 七、与开源书/权威来源对应
Corbet LDD 第 14 章完整讲 kobject/kref/kset；Love LKD 第 17 章讲设备模型与 sysfs。

## 八、面试题
问：kobject 与 kref 关系？答：kobject 内嵌 kref 实现引用计数生命周期。问：container_of 宏作用？

## 九、演进与趋势
设备模型演进支持异步 probe、设备树（device tree）描述硬件、以及统一设备属性组（attribute group）简化 sysfs。

## 十、小结
kobject 用内嵌组合 + 引用计数把内核对象纳入统一层次，是 sysfs 与电源/热插拔管理的基础设施。
