# B树家族

> 对应 Bayer & McCreight 1972（B-Tree）与 Comer《The Ubiquitous B-Tree》(1979)。

## 一、背景与挑战
为磁盘/外存设计的多路平衡搜索树，降低树高、减少 I/O。B 树用于数据库索引，B+ 树叶子串成链表便于范围扫描。

## 二、核心原理
每个结点至多 m 个孩子（m 阶），关键字有序；插入可能分裂，删除可能合并/借位，全程保持平衡。B+ 树非叶仅作索引，数据全在叶子。

## 三、形式化 / 数学基础
m 阶 B 树：每结点关键字数 $\in [\lceil m/2\rceil-1,\, m-1]$。高度 $h \le \log_{\lceil m/2\rceil}((n+1)/2)$，故 I/O 次数 O(log_m n)。

## 四、代码实现
```python
class BNode:
    def __init__(self, leaf=False):
        self.keys = []
        self.children = []
        self.leaf = leaf
def split_child(parent, i, t):
    y = parent.children[i]
    z = BNode(y.leaf)
    mid = (len(y.keys) - 1) // 2
    z.keys = y.keys[mid + 1:]
    if not y.leaf:
        z.children = y.children[mid + 1:]
    parent.keys.insert(i, y.keys[mid])
    parent.children.insert(i + 1, z)
    y.keys = y.keys[:mid]
    y.children = y.children[:mid + 1] if not y.leaf else []
```

## 五、与其他技术对比
与二叉平衡树相比，B 树「矮胖」适合块设备；B+ 树比 B 树更适合范围查询与全表扫描。

## 六、常见误区
阶数定义混淆（孩子数 vs 关键字数）；分裂时中间关键字上提而非拷贝；B+ 树非叶不存数据。

## 七、与开源书 / 权威来源对应
- Comer 1979 综述
- CS-Notes: https://github.com/CyC2018/CS-Notes

## 八、面试题
B+ 树与 B 树区别；为什么数据库用 B+ 树而非哈希。

## 九、演进与趋势
LSM-Tree 与 B+ 树互补（写优化）；B* 树提高空间利用率。

## 十、小结
B 树家族以多路分支降低树高适配磁盘，B+ 树凭借叶子链表成为索引主流。
