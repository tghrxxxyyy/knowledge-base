# 块设备与请求队列IO调度

> 对应 Corbet《Linux Device Drivers》第 16 章块设备与 Bovet & Cesati《Understanding the Linux Kernel》第 14 章。

## 一、背景与挑战
磁盘（HDD）寻道代价高，若按进程提交顺序盲目服务，磁头来回抖动吞吐骤降。块层（block layer）用请求队列与 I/O 调度器合并、排序请求以提升吞吐、降低延迟。

## 二、核心原理
块设备通过 `blk_init_queue` 注册请求队列 `request_queue`，驱动从队列取 `request` 并下发硬件。I/O 调度器（elevator/mq-deadline/bfq）对队列做合并（相邻扇区）与排序（电梯算法）。提交经由 `bio` 描述一段连续扇区，聚合成 `request`。

## 三、形式化与数学基础
电梯调度平均寻道距离近似：
$$E[seek] \approx \frac{1}{3} \cdot (C - 1)$$
其中 $C$ 为柱面数（SCAN 算法）；合并使有效请求数由 $N$ 降为 $N'$，吞吐 $\propto N'/N$。

## 四、代码实现
```c
static void my_request(struct request_queue *q) {
    struct request *rq;
    while ((rq = blk_fetch_request(q)) != NULL) {
        // 处理 rq 的 bio 链，下发到硬件
        blk_end_request_all(rq, BLK_STS_OK);
    }
}
```

## 五、与其他技术对比
HDD 用 mq-deadline/bfq 重排序；SSD 随机性能好，常配 none（noop）减少无谓调度。相较字符设备，块设备支持缓存、电梯与多队列。

## 六、常见误区
误以为请求按提交序到达驱动：调度器会重排。误以为 `bio` 与 `request` 等同：多个 bio 合并为一 request。误以为 SSD 不需要调度：仍需限流与合并。

## 七、与开源书/权威来源对应
Corbet LDD 第 16 章 request_queue 与 bio；Bovet & Cesati 第 14 章电梯算法。

## 八、面试题
问：为什么 HDD 需要 I/O 调度而 SSD 不必？答：HDD 寻道贵，需排序合并；SSD 随机访问近似常数。问：bio 与 request 区别？

## 九、演进与趋势
多队列块层（blk-mq）按 CPU 核设软件队列映射硬件队列，消除单队列锁瓶颈，适配 NVMe 高并发。

## 十、小结
块层用请求队列 + 调度器把无序随机 I/O 变为有序高效磁盘访问，是存储栈性能核心。
