# stride与上下文切换开销

> 对应 Hennessy & Patterson《Computer Architecture: A Quantitative Approach》多核与存储器层次章节；Love《Linux Kernel Development》进程调度章节；Kocher 等 2019《Spectre Attacks: Exploiting Speculative Execution》。

## 一、背景与挑战
步长预取器是有状态的硬件：它记住「上一次访问地址」与「推断出的步长」，并据此发出后续请求。一旦发生上下文切换，地址空间和访问局部性都换了主体，旧进程学到的步长对进程毫无意义。若硬件不隔离这些状态，新进程会继承一份错误的预取流。

后果有两层。性能层：错误步长持续发出无效预取，占用带宽与 MSHR，还可能驱逐新进程真正需要的数据，形成「切换后一段时间内性能反而下降」的冷启动代价。安全层：微架构状态若能被跨进程观测或影响，就成为侧信道或跨进程污染的载体，这在 Spectre/Meltdown 之后被明确纳入威胁模型。

## 二、核心原理
步长预取器通常以「表项」为单位保存状态，表项索引来自地址（或地址与 PC 的散列）。切换语义有三种处理方式：

- 全清空：在 `switch_mm` / ASID 变更时把整张表置为无效。实现简单，正确性强，但新进程每次切换都要重新学习，短时间片下预取几乎完全失效。
- 按 ASID（地址空间标识）打标：表项附带 ASID，命中要求 ASID 与地址同时匹配。避免跨进程污染，代价是额外的标签位与比较逻辑，并且 ASID 复用（回绕）时仍需失效。
- 按 PC/上下文标记：用触发缺失的指令地址参与索引，使同一进程不同阶段的流互不干扰；对跨进程问题只是间接缓解。

安全模型还要求：切换时清理的不只是预取表，还包括分支预测器、BTB、返回栈、填充缓冲等所有可被推测路径影响的微架构状态。这解释了为什么现代内核在切换或特权边界处会执行 IBPB/STIBP 之类的屏障。

## 三、形式化与数学基础
设进程 $P_A$、$P_B$ 的真实访问步长分别为 $s_A$、$s_B$。若不隔离，切换后表项仍保留 $(\text{last}=a_{last,A},\ \text{stride}=s_A)$，于是第一次缺失地址 $a_0$ 触发的预取序列为
$$\hat a_j = a_{last,A} + j\cdot s_A,\qquad \text{而实际需要 } a_0 + j\cdot s_B$$
偏差量的期望可以写成
$$E\big[|\hat a_j - (a_0 + j\,s_B)|\big] = \big|\Delta a + j\,(s_A - s_B)\big|$$
其中 $\Delta a = a_{last,A} - a_0$ 是地址空间的跨度。当 $\Delta a$ 与 $s_A - s_B$ 都非零时，偏差随 $j$ 线性增长，几乎全部预取都落在无关区域。

把无效预取比例记为 $\rho$，则切换后的有效缺失惩罚近似为
$$L_{eff} = (1-\rho)\,L_{mem} + \rho\,L_{mem} + \rho\,c_{bandwidth}$$
也就是说，无效预取不会降低延迟，只增加带宽与队列压力。若采用「全清空」策略，代价转化为冷启动：需要 $n_{learn}$ 次缺失才能重建步长（典型 2～3 次），每段时间片额外付出 $n_{learn}\cdot L_{mem}$。

## 四、代码实现
先用模拟量化「共享步长状态」的污染程度，再给出内核切换处的处理位置。
```python
# 共享 SDT（无 ASID 标签）与分区 SDT 的无效预取计数对比
class SDT:
    def __init__(self, tagged):
        self.t, self.tagged = {}, tagged
    def miss(self, asid, addr):
        key = (asid if self.tagged else 0, addr >> 12)   # 索引：页号(+ASID)
        last, stride = self.t.get(key, (None, None))
        bad = 0
        if last is not None and stride is not None:
            preds = [last + stride * j for j in (1, 2, 3)]
            bad = sum(1 for p in preds if (p >> 12) != (addr >> 12))  # 简单相关判定
        self.t[key] = (addr, addr - last if last is not None else 0)
        return bad

def run(tagged):
    sdt, total = SDT(tagged), 0
    for asid, base, stride in ((1, 0x10000, 64), (2, 0x90000, -256)):
        for i in range(200):
            total += sdt.miss(asid, base + i * stride)
    return total

print("shared-state pollution:", run(False))
print("asid-tagged pollution :", run(True))
```
```c
/* 内核视角：切换 mm 时处理推测状态（示意，具体接口以实现为准） */
void switch_mm(struct mm_struct *prev, struct mm_struct *next) {
    if (prev == next) return;
    /* 1) 更换页表基址 / ASID，使旧映射不可用 */
    load_new_asid(next);
    /* 2) 对可能携带跨进程信息的推测结构做屏障或失效 */
    speculation_barrier();
}
```

## 五、与其他技术对比
| 策略 | 跨进程污染 | 切换代价 | 硬件成本 | 安全性 |
| --- | --- | --- | --- | --- |
| 全清空 | 无 | 每次切换都冷启动 | 极低 | 高 |
| ASID 打标 | 无（ASID 未回绕时） | 仅冷启动一次 | 中（标签 + 比较） | 高 |
| PC 参与索引 | 部分缓解 | 冷启动按 PC 分摊 | 中 | 中（仍有别名） |
| 不处理 | 严重 | 无 | 无 | 低，可被利用为侧信道 |

## 六、常见误区
- 认为预取器状态是「纯性能状态」，共享无害。它会影响其它进程的缓存内容与延迟，属于可观测状态。
- 认为清了预取表就安全了。分支预测器、填充缓冲、BTB 同样需要处理，遗漏一项仍可构造泄露。
- 认为 ASID 打标可永久解决问题。ASID 位数有限，回绕复用后旧标签会错误命中，仍需在回绕点失效。
- 忽略长表项的别名问题。地址散列索引会让不同页的流映射到同一条表项，切换只是把这种别名放大。
- 只关注切换时刻而忽略迁移。线程在核间迁移同样等于换上下文，表项的局部性同样失效。

## 七、与开源书·权威来源对应
- Hennessy & Patterson：多道程序与多核场景下讨论缓存与预取器状态对性能可预测性的影响，说明为何需要上下文感知的替换与预取。
- Love《Linux Kernel Development》进程调度章节：给出上下文切换、`switch_mm`、ASID/PCID 使用等实现背景。
- Bovet & Cesati《Understanding the Linux Kernel》：进程地址空间与 TLB 刷新路径的细节，是理解切换代价的基础。
- Kocher 等 2019（Spectre）：确立「推测执行留下的微架构状态可跨边界泄露信息」这一威胁模型。
- Lipp 等 2018（Meltdown）：说明跨特权边界缓存状态泄露的可行性，推动切换时刷新推测结构的工程实践。

## 八、面试题
1. 为什么上下文切换要处理预取器状态？要点：避免用错步长产生无效预取与缓存污染，同时防止跨进程信息泄露。
2. 全清空和 ASID 打标的取舍是什么？要点：全清空简单但每次切换冷启动；ASID 打标只在首次学习，需额外标签位并处理回绕。
3. 不隔离预取状态会怎样影响性能曲线？要点：切换后先出现一段无效预取造成的带宽浪费与命中率下降，再随重新学习恢复。
4. 为什么 ASID 回绕也要求失效？要点：旧 ASID 标签会与新进程地址匹配，产生错误命中，等价于跨进程污染。
5. 线程迁移与上下文切换在预取视角有何共同点？要点：两者都改变地址-局部性映射，使基于历史地址的表项失效。

## 九、演进与趋势
硬件层面趋向「按上下文分区 + 选择性刷新」：给表项加 ASID/PC 标签，只在必要时清扫受影响集合，兼顾安全与冷启动。安全层面趋向「分类分级刷新」：把推测状态按泄露风险分类，特权边界使用更强屏障，普通切换使用较轻成本。软件层面则通过更长的调度时间片、批处理与绑核来减少切换频率。具体指令与语义以厂商官方最新文档为准。

## 十、小结
步长预取器的状态是进程相关的历史信息，不是可以全局共享的优化缓存。切换必须隔离或重置，否则既损失性能又打开侧信道；工程上的核心权衡在于「刷新强度」与「重新学习成本」之间如何配平。
