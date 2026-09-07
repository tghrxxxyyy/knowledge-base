# Meltdown 与用户态内核读

> 对应 Böhme, Kocher 等 2018《Meltdown》(USENIX Security，真实作者年份)。

## 一、背景与挑战
Meltdown 利用多数 x86 CPU 在权限检查完成前就推测执行数据读取，用户态程序可越权读内核物理内存，再用缓存侧信道提取。

## 二、核心原理
访问内核地址时，CPU 先返回数据（用于推测），稍后才因权限异常终止指令。但被读取的内核数据已用于索引用户态数组，留下缓存痕迹。异常被捕获，但泄漏已完成。

## 三、形式化与数学基础
推测窗口内：
$$data = Load(kernel\_addr) \quad \text{先于} \quad Exception(permission)$$
随后 $user\_array[data \times 4096]$ 命中缓存，攻击者测时延得 $data$ 字节，逐字节重建内核页。

## 四、代码实现
```c
// Meltdown泄漏内核字节(示意)
void leak(unsigned long kaddr) {
    uint8_t val = *(volatile uint8_t*)kaddr; // 触发异常(被捕获)
    user_arr[val * 4096]++;                  // 推测执行留下cache痕
}
// 缓解: KAISER/KPTI 不映射内核页到用户页表
```

## 五、与其他技术对比
Spectre 需构造 gadget、跨进程；Meltdown 直接越权读内核、无需 gadget，影响更大但仅 Intel 类乱序 CPU（ARM/AMD 多数权限检查更早，不易中招）。

## 六、常见误区
误以为异常阻止泄漏：异常在推测后才触发，缓存已留痕。误以为所有 CPU 都中招：部分架构权限检查更早。

## 七、与开源书/权威来源对应
Böhme et al. 2018 Meltdown；KAISER 论文（Gruss 等）；Linux KPTI 补丁。

## 八、面试题
问：为何 Meltdown 主要伤 Intel？答：其权限异常晚于数据返回，留出推测窗口。

## 九、演进与趋势
KPTI 分离内核/用户页表，硬件增加自动清缓存（VERW）、数据采样抑制。

## 十、小结
Meltdown 暴露了"权限检查晚于数据使用"的设计缺陷，KPTI 以性能代价换取隔离。
