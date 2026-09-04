# AVL树

> 对应 Adelson-Velsky & Landis 1962 原始论文。

## 一、背景与挑战
最早的自我平衡 BST。要求每个结点左右子树高度差（平衡因子）不超过 1，保证严格 O(log n) 高度。

## 二、核心原理
维护高度与平衡因子；插入/删除后若失衡，按四种情形（LL、RR、LR、RL）单/双旋转恢复平衡。

## 三、形式化 / 数学基础
$bh = h(left) - h(right) \in \{-1,0,1\}$。AVL 树最小结点数满足 $N(h) = N(h-1)+N(h-2)+1$，高度 $h = O(\log n)$。

## 四、代码实现
```python
class AVL:
    def __init__(self, key):
        self.key = key
        self.h = 1
        self.left = self.right = None
    def rotate_right(y):
        x = y.left
        y.left = x.right
        x.right = y
        y.h = 1 + max(AVL._h(y.left), AVL._h(y.right))
        x.h = 1 + max(AVL._h(x.left), AVL._h(x.right))
        return x
    def _h(t):
        return t.h if t else 0
```

## 五、与其他技术对比
与红黑树相比，AVL 查询更快（更平衡）但插入删除旋转更多；适合读多写少。

## 六、常见误区
旋转后未更新高度；平衡因子符号弄反；LR/RR 旋转选择错误。

## 七、与开源书 / 权威来源对应
- Adelson-Velsky & Landis 1962
- CS-Notes: https://github.com/CyC2018/CS-Notes

## 八、面试题
「平衡二叉树」判断是否 AVL；手写插入与四种旋转。

## 九、演进与趋势
加权平衡树（WBT）；与红黑树在工程中的取舍讨论。

## 十、小结
AVL 用严格平衡因子 + 四种旋转保持 O(log n)，查询性能极佳，代价是更多旋转。
