# 闪存与FTL

> 对应 Remzi Arpaci-Dusseau《OSTEP》持久化章节 Flash/SSD；Micron/SK hynix NAND Flash 技术白皮书（公开定性）；Intel SDM 与 NVMe 规范中关于 LBA/命名空间的描述。

## 一、背景与挑战

NAND 闪存用浮栅或电荷俘获晶体管存储数据，以页（page，通常 4–16KB）为读写单位、以块（block，数 MB）为擦除单位。它的物理特性决定了「不能像磁盘那样原地改写」：要把一个已编程的页改成新值，必须先擦除整个块，而擦除代价高、还会磨损介质（P/E cycle 次数有限，SLC 数万次，TLC/QLC 数百到数千次）。CPU 与文件系统却仍按「逻辑块设备」模型读写 512B/4KB 的扇区，期望任意地址可覆盖写。

朴素做法是「暴露物理块给上层」，则文件系统必须自己处理擦除、磨损、坏块——这对上层不可接受。另一极端是「每次都擦除整个块再写」，随机写延迟会飙到毫秒级，且寿命迅速耗尽。工程上的解法是固件里的闪存转换层（Flash Translation Layer, FTL）：向上伪装成可任意覆盖写的块设备，向下把逻辑地址映射到物理页，用异地更新（out-of-place update）回避原地擦除。

理解 FTL 是理解 SSD 性能（读写放大）、寿命（磨损均衡）、掉电一致性（映射表持久化）的前提，也是存储工程师与体系结构面试的核心知识。

## 二、核心原理

**基本粒度**：
- **页（Page）**：读/编程（写）单位，例如 4KB、8KB、16KB。
- **块（Block）**：擦除单位，例如 256–1024 页，数 MB。
- **平面/通道/Die/Lun**：并行组织，SSD 内部多通道多 die 可并行读写，这是 SSD 吞吐的来源。

**FTL 映射**：维护逻辑页地址 LBA → 物理页地址 PPA 的映射表。粒度可以是页级（page-level，精细但表大）、块级（block-level，表小但更新差）、或混合（log-structured + 组相联）。现代 SSD 多为页级映射，映射表本身放在 DRAM 中加速，并周期性持久化到 NAND。

**异地更新（out-of-place update）**：写 LBA `x` 时不覆盖旧物理页，而是写到当前开放块（active/open block）中的新页，更新映射 `x → new_ppa`，把旧页标记为无效（invalid）。读则按映射直接读新页。这样避免了擦除阻塞写路径。

**垃圾回收（GC, Garbage Collection）**：块被写满后，其中既有有效页也有无效页。GC 选择牺牲块（victim），把其中有效页搬到新块，然后擦除整个块，供后续写使用。GC 是 SSD 写放大与性能抖动的主要来源。

**坏块管理与读重试**：NAND 会随磨损出现坏块，FTL 维护坏块表并替换；读干扰、数据保持（retention）导致错误率上升，需 ECC（BCH/LDPC）与读重试电压调整。

**开放块与日志结构**：FTL 通常维护少数「开放块」顺序追加写入，写满后再换新块，形成设备内部的日志结构（log-structured）。这使写入天然顺序化，降低编程干扰并简化 GC；随机主机写会被重定向到开放块顺序落盘，代价是旧页失效、需要 GC。读放大与映射表缓存命中率相关：映射表在 DRAM 中时读路径只是「查表+读页」，若映射被逐出到 NAND，则要额外读映射页。

**不变量**：
1. 任一 LBA 至多映射到一个有效 PPA（旧页失效）。
2. 有效页不得被擦除；擦除只对整块，且块内应尽量全为无效页。
3. 映射表更新与页编程的顺序必须在掉电后可恢复（见持久化与断电保护）。
4. 擦除次数高的块要被磨损均衡机制限流或搬迁冷数据。
5. 任何对主机确认完成的写，其数据与映射都必须在「掉电可恢复」的持久域中，或由 PLP 保证。

## 三、形式化与数学基础

**写放大（WA）**源于异地更新与 GC。设主机写入 $H$ 字节，GC 搬运有效页花费 $G$ 字节，则：

$$WA = \frac{H + G}{H} = 1 + \frac{G}{H}$$

若牺牲块中有效页比例为 $v$，每次 GC 搬运 $v \cdot B_{block}$ 字节，并回收 $(1-v) \cdot B_{block}$ 可写空间，则稳态近似：

$$WA \approx \frac{1}{1 - v}$$

$v \to 1$ 时 $WA \to \infty$（块几乎全有效，GC 低效）；$v \to 0$ 时 $WA \to 1$。这解释了随机小写导致高 WA：有效页分散在许多块，$v$ 高。

**映射表存储**：页级映射，LBA 空间 $S$，页大小 $P$，每项 $e$ 字节（通常 4B），则 DRAM 占用：

$$M_{map} = \frac{S}{P} \cdot e$$

例：1TB SSD，4KB 页，$e=4$B，$M_{map} = 2^{28} \times 4B = 1GB$，约占容量 0.1%，这是消费级 SSD 配 DRAM 缓存的原因；无 DRAM 的 DRAM-less SSD 用 HMB（主机内存缓冲）或块级映射折中。

**擦除寿命**：块擦除上限 $N_{pe}$，有效物理块数 $N$，总写入字节上限约 $N \cdot B_{block} \cdot N_{pe} / WA$。寿命公式常写成：

$$Endurance \approx \frac{N \cdot B_{block} \cdot N_{pe}}{WA \cdot W_{host}}$$

其中 $W_{host}$ 为单位时间主机写入（DWPD 指标的基础）。

## 四、代码实现

下面实现一个页级映射 FTL 模拟器：异地更新、无效页标记、贪心 GC，统计写放大与擦除次数。

```python
"""页级映射 FTL 模拟器：异地更新 + 贪心 GC"""
from collections import defaultdict

PAGE_SIZE = 4
BLOCK_PAGES = 16
N_BLOCKS = 8


class FTL:
    def __init__(self):
        # ppa = block_id * BLOCK_PAGES + page_in_block
        self.n_pages = N_BLOCKS * BLOCK_PAGES
        self.mapping = {}          # lba -> ppa
        self.page_valid = [False] * self.n_pages   # ppa 有效位
        self.block_used = [0] * N_BLOCKS           # 已用页
        self.block_erase = [0] * N_BLOCKS
        self.open_block = 0
        self.host_writes = 0
        self.nand_writes = 0     # 含 GC 搬运
        self.gc_runs = 0

    def _alloc_page(self):
        b = self.open_block
        if self.block_used[b] >= BLOCK_PAGES:
            self._gc()
            b = self.open_block
            if self.block_used[b] >= BLOCK_PAGES:
                raise RuntimeError("FTL full")
        ppa = b * BLOCK_PAGES + self.block_used[b]
        self.block_used[b] += 1
        return ppa

    def _invalidate(self, ppa):
        if ppa is not None:
            self.page_valid[ppa] = False

    def write(self, lba):
        self.host_writes += 1
        self.nand_writes += 1
        old = self.mapping.get(lba)
        self._invalidate(old)
        ppa = self._alloc_page()
        self.page_valid[ppa] = True
        self.mapping[lba] = ppa

    def read(self, lba):
        return self.mapping.get(lba)

    def _gc(self):
        """选已用页最多的非开放块作牺牲块（贪心），搬有效页"""
        victim = max(
            (b for b in range(N_BLOCKS) if b != self.open_block),
            key=lambda b: self.block_used[b],
            default=None,
        )
        if victim is None:
            return
        self.gc_runs += 1
        # 找一个几乎空的块继续用作开放块；此处简单重用 victim 位置
        start = victim * BLOCK_PAGES
        valid_ppas = [start + i for i in range(BLOCK_PAGES) if self.page_valid[start + i]]
        # 擦除 victim
        for i in range(BLOCK_PAGES):
            self.page_valid[start + i] = False
        self.block_used[victim] = 0
        self.block_erase[victim] += 1
        # 搬运有效页到新位置（写到同一块前部，模拟 log）
        for ppa in valid_ppas:
            lba = next(l for l, p in self.mapping.items() if p == ppa)
            self.nand_writes += 1          # GC 写放大
            np = self._alloc_page_raw(victim)
            self.page_valid[np] = True
            self.mapping[lba] = np
        self.open_block = victim

    def _alloc_page_raw(self, b):
        ppa = b * BLOCK_PAGES + self.block_used[b]
        self.block_used[b] += 1
        return ppa

    def stats(self):
        wa = self.nand_writes / max(self.host_writes, 1)
        return {
            "host_writes": self.host_writes,
            "nand_writes": self.nand_writes,
            "WA": round(wa, 3),
            "gc_runs": self.gc_runs,
            "erase": self.block_erase,
        }


if __name__ == "__main__":
    ftl = FTL()
    # 顺序写 64 页：每页只写一次，GC 少
    for lba in range(64):
        ftl.write(lba)
    print("顺序写:", ftl.stats())

    # 随机覆盖写 64 个 LBA 各 8 次：异地更新多、GC 多
    ftl2 = FTL()
    for _ in range(8):
        for lba in range(32):
            ftl2.write(lba)
    print("随机覆盖写:", ftl2.stats())
```

预期输出：顺序写 WA 接近 1、GC 少；随机覆盖写产生大量无效页与 GC，WA 明显大于 1。这直观展示了 FTL 异地更新如何把「不可覆盖」的闪存伪装成可覆盖块设备，以及代价（写放大）从何而来。

## 五、与其他技术对比

| 维度 | HDD | 原始 NAND | SSD（FTL） | ZNS SSD |
|------|-----|-----------|------------|---------|
| 覆盖写 | 可原地 | 不可（先擦） | 逻辑可覆盖 | 分区顺序写 |
| 写放大 | ~1 | 取决于上层 | 1.5–5×+ | 接近 1 |
| 随机写 | 慢（寻道） | 需 GC | 有抖动 | 主机管理 GC |
| 寿命管理 | 机械寿命 | 有限 P/E | 磨损均衡 | 主机+固件 |
| 复杂度 | 机械 | 低 | FTL 复杂 | 接口约束 |

取舍：FTL 让 SSD 对上透明、易用，但付出 WA、GC 延迟、DRAM 映射表成本；ZNS/Open-Channel 把部分 FTL 责任上移，换更低 WA 与更可预测延迟，适合数据库/对象存储等可感知分区的工作负载。

## 六、常见误区

1. **「SSD 可以像 HDD 一样任意覆盖写且无代价」**——错。物理上仍是异地更新+GC，覆盖写会产生写放大与延迟抖动，接口上「可覆盖」是 FTL 伪装。
2. **「FTL 只是简单查表，没有复杂度」**——错。映射持久化、掉电恢复、GC、磨损均衡、坏块管理、读干扰处理都在 FTL，占固件大部分复杂度。
3. **「擦除次数少就寿命长，与写入量无关」**——寿命同时取决于 P/E 次数、写放大、有效容量与预留空间；WA 越高，主机写越多，寿命越短。
4. **「TRIM 可有可无」**——错。TRIM/DISCARD 告知 FTL 哪些 LBA 已无效，可显著降低 GC 有效页搬运与 WA；不 TRIM 的文件删除会让 SSD 以为数据仍有效。
5. **「映射表在 DRAM 就不怕掉电」**——DRAM 易失，映射表必须定期持久化（或有电容），否则掉电后映射丢失、数据不可访问；企业级 SSD 的 PLP 正是为此。

## 七、与开源书/权威来源对应

1. Remzi Arpaci-Dusseau《OSTEP》第 36–38 章（Flash-based SSDs）：FTL、GC、日志结构思想，https://github.com/remzi-arpacidusse/ostep-code 。
2. Hu, Ching-Lin 等《Performance Analysis and Optimization of SSD Write Amplification》（USENIX/存储会议多篇经典）；OpenSSD 项目（https://openssd.org ）与 FlashSim：可运行 FTL 模拟。
3. Micron《NAND Flash Design and Use Considerations》、SK hynix NAND 技术文档（公开白皮书）：页/块/P-E 特性定性描述。
4. NVMe 规范（NVM Express Base）：LBA、命名空间、Dataset Management（TRIM）命令语义。

## 八、面试题

**1. 为什么 SSD 不能像磁盘那样原地覆盖写？**
答：NAND 页编程后不能直接改值，须擦除整个块（毫秒级且磨损介质）。因此更新走异地写新页+更新映射，旧页标记无效，由 GC 回收。

**2. FTL 的作用是什么？**
答：维护 LBA→PPA 映射，隐藏擦除、异地更新、坏块与磨损差异，对上呈现标准块设备。页级映射最灵活但表大，块级省 DRAM 但更新差。

**3. 什么是写放大？来源是什么？**
答：实际写入闪存量与主机写入量之比。主要来自异地更新后的 GC（搬运有效页）、映射表持久化、磨损均衡搬迁、以及内部日志/缓冲刷回。$WA \approx 1/(1-v)$，$v$ 为牺牲块有效页比例。

**4. TRIM 有什么用？**
答：文件系统删除块后告知 SSD 哪些 LBA 无效，FTL 可提前视为无效页，减少 GC 搬运与写放大，提升性能与寿命。

## 九、演进与趋势

Open-Channel SSD 与 ZNS（Zoned Namespaces）把顺序写入约束暴露给主机，让文件系统/数据库直接管理 GC，显著降 WA 与尾延迟（如 Linux ZoneFS、RocksDB 支持 ZNS）。计算存储（SmartSSD）把压缩、检索、RAID 下推到 FTL 附近。3D NAND（TLC/QLC、PLC）与更高堆叠层数带来更大容量但更低 P/E，需要更强 ECC 与 LDPC、读重试、以及主机侧写整形。NVMe 2.0、KVSSD、以及 CXL-attached 闪存拓展接口。模拟器与开源固件（LightNVM、OpenSSD Cosmos+）继续推动 FTL 研究；工业界则用机器学习预测数据热度做分层放置与 GC 调度。

## 十、小结

FTL 用页级映射与异地更新把不可覆盖、有限寿命的 NAND 伪装成可任意读写的块设备，代价是写放大、GC 抖动与映射表持久化复杂度。理解页/块粒度、GC 有效页搬运、TRIM 与映射表 DRAM 依赖，是分析 SSD 性能与寿命的基础。
