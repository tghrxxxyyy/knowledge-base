# 伪LRU与分段LRU

> 对应 Hennessy & Patterson《Computer Architecture: A Quantitative Approach》缓存替换小节。

## 一、背景与挑战
真 LRU 在大相联度下状态开销与更新延迟过高。伪 LRU（PLRU）以树近似；分段 LRU 将行分级以更好抵抗扫描。

## 二、核心原理
分段 LRU（如 IBM zARCH 的 segment LRU）把组分为"已保护段"与"未保护段"。新块进入未保护段，命中则提升到保护段，替换优先选未保护段，从而扫描块不会驱逐热块。

## 三、形式化与数学基础
设保护段容量 $P$，未保护段 $U$，扫描长度为 $S$。若 $S > U$，扫描块填满未保护段后被替换，保护段热块存活：
$$Survive_{hot} = \mathbb{1}[S \le U]$$
命中率提升对扫描负载显著。

## 四、代码实现
```c
// 两段式LRU: hot与cold链表
#define WAYS 8
int order[WAYS]; // 0最久
void hit(int way) {
    // 移到hot端(末尾)
    for (int i=0;i<WAYS;i++) if(order[i]==way){ for(;i<WAYS-1;i++)order[i]=order[i+1]; order[WAYS-1]=way; break; }
}
int victim(void) { return order[0]; } // 最久未用
```

## 五、与其他技术对比
PLRU 仅近似全序，分段 LRU 显式区分冷热，对扫描更鲁棒；代价是需管理两段迁移。

## 六、常见误区
误以为 PLRU 与分段 LRU 等价；二者机制不同。误把段大小设得过小失去保护。

## 七、与开源书/权威来源对应
量化方法"近似LRU与分段"；Intel 优化手册提及缓存替换提示。

## 八、面试题
问：分段 LRU 如何抵抗一次性扫描？答：扫描块留冷段，热块在保护段不被替换。

## 九、演进与趋势
与 DIP、基音感知策略结合，按负载动态选择。

## 十、小结
伪 LRU 省状态，分段 LRU 抗扫描，二者是硬件可实现的实用近似。
