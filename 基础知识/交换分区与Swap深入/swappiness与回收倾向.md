> 对应 Linux 内核 Documentation（admin-guide/sysctl/vm.rst 的 swappiness）与 Tanenbaum《Modern Operating Systems》。

## 一、背景与挑战
系统同时持有文件页（可丢弃重读）与匿名页（必须换出才回收）。内核该优先丢文件缓存还是换出匿名页？这影响「文件 IO 缓存命中」与「匿名页换入延迟」的权衡。挑战是给出一个可调、且自适应负载的倾向参数。

## 二、核心原理
swappiness（默认 60，范围 0–200 在较新内核，旧版 0–100）影响 shrink 时文件页与匿名页的扫描比例。值越高，越倾向换出匿名页、保留文件缓存；值越低，越倾向回收文件页、保留匿名页。计算上，它参与 get_scan_count 决定两类链表的扫描额度。

## 三、形式化与数学基础
在 mm/vmscan.c 的近似中，匿名与文件的「压力」比例与 swappiness 相关（简化）：
```
anon_ratio = swappiness / (swappiness + 200 - swappiness)   # 旧模型
# 新模型（>=5.8）更精细，但趋势一致：
scan_anon  ∝ swappiness
scan_file  ∝ 200 - swappiness
```
当 swappiness=0，内核尽量避免换出匿名页（除非内存极度紧张）；=100 表示文件与匿名同权；更高则进一步偏向匿名。

## 四、代码实现
```c
// mm/vmscan.c（简化 get_scan_count）
static void get_scan_count(struct lruvec *lruvec, struct scan_control *sc,
                           unsigned long *nr)
{
    int swappiness = mem_cgroup_swappiness(memcg);
    ap = swappiness;                  // 匿名权重
    fp = 200 - swappiness;            // 文件权重
    if (ap <= 0) {                    // swappiness=0 几乎不扫匿名
        nr[LRU_INACTIVE_ANON] = 0;
        nr[LRU_ACTIVE_ANON]   = 0;
    }
    // 按 ap/fp 比例分配扫描额度
}
```

## 五、与其他技术对比
- vfs_cache_pressure：调节目录/inode 缓存回收，正交于 swappiness。
- min_free_kbytes：影响水线，与 swappiness 共同决定何时开始回收。
- 数据库负载常把 swappiness 调低，保护匿名工作集。

## 六、常见误区
- 误区：swappiness=0 完全禁止 swap。实际仅在能回收文件页时避免匿名换出，极端紧张仍会换出。
- 误区：值越高系统越慢。高值保留文件缓存，反而利于读多负载。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/admin-guide/sysctl/vm.rst 权威解释 swappiness。
- Tanenbaum《Modern Operating Systems》讨论页回收策略权衡。
- GitHub CyC2018/CS-Notes 的「内存管理」概括该参数。

## 八、面试题
1. swappiness 调节的是哪两类页的回收比例？
2. swappiness=0 是否意味着永不 swap？
3. 数据库服务器为何倾向调低 swappiness？

## 九、演进与趋势
旧版 0–100 模型在 5.8 改为 0–200 以更好区分「文件优先」与「匿名优先」；与 PSI 驱动的自动调参工具（如系统 oomd/anomaly）结合，趋于运行时自适应。

## 十、小结
swappiness 是文件缓存与匿名页回收之间的主旋钮，合理设置能在「缓存命中」与「换入延迟」间取得负载适配的平衡。
