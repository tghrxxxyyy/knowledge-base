# 磁盘IO栈

> 对应 OSTEP 第 35-38 章“磁盘与 IO 栈”与 Linux 块层。

## 一、背景与挑战
一次文件写要穿越 VFS、页缓存、文件系统、块层、IO 调度器、设备驱动，最终由磁盘 DMA 完成。理解各层职责才能定位性能瓶颈。

## 二、核心原理
分层（自上而下）：
1. 系统调用 / VFS
2. 页缓存（命中则免 IO）
3. 具体文件系统（ext4/btrfs）生成 bio
4. 块层（blk-mq）队列 + IO 调度（mq-deadline/bfq/none）
5. 设备驱动与硬件队列（NVMe 多队列）

## 三、形式化 / 数学基础
IO 延迟 $L = L_{queue} + L_{sch} + L_{dev}$，其中设备侧 $L_{dev} = \\frac{\\text{寻道}}{}+\\frac{\\text{旋转延迟}}{}+\\frac{\\text{传输}}{}$。吞吐受设备带宽与队列深度约束，调度器旨在合并/排序减少寻道。

## 四、代码实现
提交 bio（块层示意）：

```c
struct bio *b = bio_alloc(dev, 1, REQ_OP_READ, GFP_KERNEL);
bio_add_page(b, page, len, off);
submit_bio(b);                 /* 进入 blk-mq 队列, 由驱动发往设备 */
```

## 五、与其他技术对比
HDD 依赖调度合并寻道；SSD/NVMe 随机性能好，常用 `none` 调度仅做队列分发；多队列（blk-mq）让每 CPU 映射硬件队列降低锁争用。

## 六、常见误区
- 认为“顺序写一定快”：仅 HDD 明显，NVMe 顺序优势小。
- 忽略 IO 调度对混合负载的影响。
- 混淆 IOPS 与带宽：小随机看 IOPS，大顺序看带宽。

## 七、与开源书 / 权威来源对应
- OSTEP 代码仓库：https://github.com/remzi-arpacidusse/ostep-code
- 参考 Love《Linux Kernel Development》。

## 八、面试题
1. 一次写经历哪些层？
2. 为何 NVMe 常用 none 调度？
3. IOPS 与带宽的区别？

## 九、演进与趋势
blk-mq 多队列、io_uring 轮询模式与 NVMe 低延迟持续压缩软件栈开销，使 CPU 而非设备渐成瓶颈。

## 十、小结
磁盘 IO 栈分层解耦：页缓存吸收热访问，文件系统与块层生成并调度 bio，调度策略随介质（HDD/SSD/NVMe）而变。
