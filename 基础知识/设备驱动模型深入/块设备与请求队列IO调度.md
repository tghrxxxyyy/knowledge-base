# 块设备与请求队列IO调度

> 对应 Corbet、Rubini & Kroah-Hartman《Linux Device Drivers》（LDD3）第 16 章 Block Drivers 与 Bovet & Cesati《Understanding the Linux Kernel》第 14 章 The Block I/O Layer；并参考内核文档 `Documentation/block/`。

## 一、背景与挑战

磁盘（HDD）寻道代价高，若按进程提交顺序盲目服务，磁头来回抖动吞吐骤降。

块层（block layer）的核心职责是把上层文件系统/应用的随机、乱序 I/O 组织成「对硬件友好」的请求流。

它用请求队列与 I/O 调度器合并、排序、重排请求，以提升吞吐、降低延迟，并向文件系统屏蔽设备差异（HDD/SSD/NVMe）。

挑战在于：不同介质特性迥异，单一策略无法兼顾；队列深度、并发度、顺序性需按设备调。

## 二、核心原理

块设备通过 `blk_init_queue`（传统单队列）或 blk-mq 的 `blk_mq_init_queue` 注册请求队列 `request_queue`。

上层用 `bio` 描述一段连续扇区的 I/O（`bi_sector`/`bi_iter`/`bi_bdev`），多个 `bio` 经合并聚合成 `request`（`struct request` 含 `bio` 链表、起止扇区、方向）。

I/O 调度器（elevator/mq-deadline/bfq/none）对队列做合并（相邻扇区）与排序（电梯算法）。

驱动从队列取 `request` 下发硬件（如 NVMe 提交到 SQ/CQ），完成调用 `blk_end_request_all`/`blk_mq_end_request`。

`plug`/`unplug` 机制在提交期暂存请求，批量 unplug 时一次性调度，减少抖动。

## 三、形式化与数学基础

电梯（SCAN/LOOK）调度的平均寻道距离近似：

$$E[seek] \approx \frac{1}{3}\cdot(C - 1)$$

其中 $C$ 为柱面数（SCAN 下磁头扫到端点返回）。

合并使有效请求数由 $N$ 降为 $N'$：吞吐 $\propto N'/N$，且顺序流下 $N' \ll N$。

对 HDD，调度目标是最小化总寻道；对 SSD/NVMe，目标转为公平与并发，排序收益骤减。

## 四、代码实现

```c
// 传统单队列驱动：从队列取请求并下发硬件
static void my_request_fn(struct request_queue *q) {
    struct request *rq;
    while ((rq = blk_fetch_request(q)) != NULL) {
        // 遍历 rq->bio 链，把数据搬入/搬出设备
        ops_for_each_bio(rq, transfer_chunk);
        blk_end_request_all(rq, BLK_STS_OK);   // 通知块层完成
    }
}

// 现代 blk-mq：实现 queue_rq 回调，由多队列框架并发调用
static blk_status_t my_queue_rq(struct blk_mq_hw_ctx *hctx,
                                const struct blk_mq_queue_data *bd) {
    issue_to_hw(bd->rq);
    return BLK_STS_OK;
}
```

## 五、与其他技术对比

| 设备 | 推荐调度 | 理由 |
| --- | --- | --- |
| HDD | mq-deadline/bfq | 寻道贵，需排序合并 |
| SATA SSD | mq-deadline/none | 随机近似常数，合并即可 |
| NVMe | none（无调度） | 高并发队列，硬件自带并行 |

相较字符设备，块设备支持缓冲、电梯调度、多队列与 `bio` 聚合；`none` 调度把排序交给设备固件。

## 六、常见误区

1. 误以为请求按提交序到达驱动：调度器会重排、合并，顺序不保证（除非加屏障 `REQ_PREFLUSH`/`FUA`）。
2. 误以为 `bio` 与 `request` 等同：多个 `bio` 合并为一 `request`，一个 `request` 可跨多个 `bio`。
3. 误以为 SSD 不需要调度：仍需限流/合并，但排序收益低；错误排序反而增延迟。
4. 误以为 `blk_end_request` 可延迟任意久：超时由块层/SCSI 栈管控，过长触发 I/O 错误。
5. 误以为 barrier 自动保证持久：需 `REQ_PREFLUSH` + 设备写回确认才算落盘。

## 七、与开源书·权威来源对应

- Corbet LDD3 第 16 章讲 `request_queue`、注册、`bio`/`request` 与 `end_request`。
- Bovet & Cesati 第 14 章讲电梯算法、I/O 调度器与「电梯」合并逻辑。
- 内核 `Documentation/block/` 描述 blk-mq、mq-deadline、bfq 的配置与语义。
- 内核 `block/bfq-iosched.c` 给出权重公平调度的实现细节。

## 八、面试题

1. 为什么 HDD 需要 I/O 调度而 SSD 不必？要点：HDD 寻道贵需排序合并；SSD 随机访问近似常数。
2. `bio` 与 `request` 区别？要点：bio 连续扇区段，request 是调度/下发单元，可聚多 bio。
3. blk-mq 解决什么？要点：消除单队列锁瓶颈，按 CPU/硬件队列映射实现高并发（NVMe 关键）。
4. 如何保证写顺序/持久？要点：用 `REQ_PREFLUSH`/`FUA`/barrier 请求，而非依赖提交序。

## 九、演进与趋势

- 多队列块层（blk-mq）按 CPU 核设软件队列、映射硬件队列，消除单队列锁瓶颈，适配 NVMe 高并发。
- 调度器细分化：mq-deadline（低延迟）、bfq（权重公平，桌面交互）、none（高速设备）。
- 区（zoned）设备与 `zonefs`、写入放大控制成为新调度关注点。

## 十、小结

块层用请求队列 + 调度器把无序随机 I/O 变为有序高效磁盘访问，是存储栈性能核心。

blk-mq 把并发交给多队列框架，使 Linux 能充分发挥 NVMe 等现代设备的并行能力。
