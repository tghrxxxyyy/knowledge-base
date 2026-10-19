# Huffman 编码的贪心构造

> 对应 David A. Huffman, *A Method for the Construction of Minimum-Redundancy Codes*, Proc. IRE, 1952；与 CLRS 第 16.3 节（Huffman Codes）、Cover & Thomas《Elements of Information Theory》。

## 一、背景与挑战

数据压缩的最基础问题是：给定字符出现频率，如何给每个字符分配 0/1 码字，使**总编码长度最短**，且能唯一解码。定长编码浪费：ASCII 对 8 个符号用 3 bit，若某符号出现 90%，最优编码应给它 1 bit。变长编码若不要求前缀性，解码会歧义（如 `a=0, b=01` 时 "01" 是 `ab` 还是 `b`）。因此目标是：**前缀码（prefix code）** 中最小化加权总长
$$B = \sum_i f_i \cdot l_i$$
其中 $f_i$ 是频率（或概率），$l_i$ 是码长。

前缀码等价于**二叉树**：字符是叶子，码字是根到叶的路径（0 左 1 右），码长即叶深。于是问题变成：给定叶子权值，构造二叉树使 $\sum f_i d_i$ 最小——即**最优二叉搜索树的权值版本 / 最小加权外部路径长**。暴力枚举所有二叉树形状是卡特兰数级，$O(4^n / n^{3/2})$，完全不可行；动态规划（区间 DP）$O(n^3)$ 或 $O(n^2)$ 也可做，但 Huffman 的贪心是 $O(n\log n)$ 且极其简单。

Huffman 编码是 ZIP、gzip、JPEG、PNG、DEFLATE 等格式的基础组件，也是信息论课程的必讲内容。面试中常问：为什么合并最小的两个、如何建树、WPL 怎么算、与算术编码的差别、频率为 0/1 的边界。它是"贪心 + 交换论证"最漂亮的实例之一。

工程上还有两遍扫描与自适应两种形态：频率统计先行的静态 Huffman 需要先存码表（或用规范码短表），自适应 Huffman 则边编码边更新树。真实压缩器里 Huffman 往往不是终点，而是多阶段的一环——先 LZ77 去重复，再对字面量/匹配长度做熵编码。理解它的最优性，才能理解为什么"熵编码阶段的损失"只剩那不足 1 bit 的整数码长舍入。

## 二、核心原理

**算法**：把每个字符做成叶子节点，权为频率，放入最小堆。每次取出权最小的两个节点 $x, y$，合并为新内部节点 $z$，权 $f(z)=f(x)+f(y)$，$x,y$ 为左右孩子，$z$ 入堆。重复直到堆中只剩一个节点，即根。根到叶路径即码字。

**为何正确（贪心选择性质）**：频率最小的两个字符一定是最深的兄弟叶子。交换论证：设最优树 $T$ 中深度最深的兄弟是 $a,b$（叶）。若 $\{x,y\} \neq \{a,b\}$，交换 $x,y$ 与 $a,b$ 的位置，加权路径长
$$\Delta = (f(x)+f(y))(d_{deep} - d_{x}) + (f(a)+f(b))(d_{shallow} - d_{a}) \le 0$$
因为 $f(x)+f(y) \le f(a)+f(b)$ 且 $d_{deep} \ge d_{shallow}$，交换后不增。故存在最优树让最小的两个为兄弟。合并后递归构造子树，由最优子结构得整体最优。

**不变量**：每次合并后，问题化为 $n-1$ 个节点的同类问题；合并节点权是子树叶权和（子树加权路径长 $=$ 叶在原树中的深度贡献）。最终
$$\text{WPL} = \sum_{\text{内部节点 } z} f(z)$$
即所有内部节点权之和（每层贡献一次）。

**前缀性**：码字是路径，无任何码字是另一个的前缀（叶子不为内部节点），故即时可译（on-the-fly decoding）。

**边界条件**：
- 只有一个符号：码长为 0 或 1（单独处理，避免树退化）；
- 频率为 0：可不编码，或最后处理，不影响最优；
- 频率全相等：任意合并顺序都得到最优，但码长可能不同（仍最优 WPL）；
- 频率用整数计数与用概率浮点，WPL 尺度不同（概率时 $B$ 是期望 bit 数）。

**与算术/ANS**：Huffman 要求码长为整数 bit，对非 2 的幂概率有"舍入损失"；算术编码、ANS（Asymmetric Numeral Systems）用小数 bit，压缩率更高，但 Huffman 更简单、无专利负担、解码快，仍用于块压缩与预压缩阶段。

**自适应 Huffman**：频率未知时在线更新树（Vitter 算法、FGK），或两遍扫描（先统计再编码）。规范 Huffman（canonical Huffman）只存各码长，按长度与字典序重排，码表极短，是 JPEG/DEFLATE 的实际形态。

**解码机制**：解码器持有与编码器相同的树，按 bit 走左/右，落到叶子即输出字符并复位到根。也可用查表加速（前缀分桶）或规范码的长度分组表。这是"前缀性"带来的即时可译红利——无需回看或长度前缀。

**WPL 的直观意义**：每合并一次，把两子树的权加进总代价，相当于"这两个符号的码长都加 1，代价增加 $f(x)+f(y)$"。最终 $\mathrm{WPL} = \sum_{\text{内部节点}} f(z)$，实现上累加合并值即可，不必真的走到叶子深度。

## 三、形式化与数学基础

**问题形式**：给定 $n$ 个符号，权 $f_1,\dots,f_n > 0$，求满二叉树 $T$（$n$ 个叶子）最小化
$$\mathrm{WPL}(T) = \sum_{i=1}^n f_i \cdot d_T(i)$$

**最优子结构**：设 $x,y$ 是最小权叶子，可并成 $z$。则原问题最优值等于 $f(z)$ 加上 $n-1$ 个节点（$z$ 代替 $x,y$）子问题的最优值：
$$\mathrm{OPT}(f_1,\dots,f_n) = f(x)+f(y) + \mathrm{OPT}(f_1,\dots,f_z,\dots)$$
因为 $d(x)=d(y)=d(z)+1$，故 $f(x)d(x)+f(y)d(y) = (f(x)+f(y))d(z) + f(x)+f(y)$。

**贪心选择**：存在最优树使最小两权 $x,y$ 为兄弟。证明（交换）：取最优树中最深兄弟 $a,b$，若 $\{a,b\}\ne\{x,y\}$，交换后
$$\mathrm{WPL}' - \mathrm{WPL} = (f(x)+f(y) - f(a)-f(b))(d_{deep}-d_{shallow}) \le 0$$
故可调整为含 $x,y$ 兄弟的最优树。

**与信息论**：若 $p_i$ 为概率，熵 $H = -\sum p_i \log_2 p_i$。Huffman 满足
$$H \le L_{\mathrm{huff}} < H + 1$$
即期望码长不超过熵加 1 bit。证明：由 Kraft 不等式与最优性，$L \ge H$；Huffman 每个码长为 $\lceil -\log p_i \rceil$ 的上界构造可得 $L < H+1$。

**Kraft 不等式**：前缀码存在 $\iff \sum_i 2^{-l_i} \le 1$。Huffman 的树结构自动满足。

**WPL 等于内部节点权和**：每次合并把 $f(x)+f(y)$ 计入总代价一层，递推得
$$\mathrm{WPL} = \sum_{z \in \text{internal}} f(z)$$
这给出 $O(n\log n)$ 实现：堆上合并时累加 `total += f(x)+f(y)`。

**复杂度**：堆 $O(n\log n)$；若先排序再用两队列可 $O(n\log n)$（排序）甚至 $O(n)$（计数排序权值有界时）。

## 四、代码实现

```python
import heapq


def huffman_tree(freqs):
    """
    freqs: dict {char: freq}
    返回 (codes, wpl)。codes: {char: '01...'}; wpl 加权路径长。
    """
    if not freqs:
        return {}, 0
    if len(freqs) == 1:
        ch = next(iter(freqs))
        return {ch: "0"}, 0

    # (freq, tie, char_or_None, left, right)
    heap = []
    for i, (ch, f) in enumerate(sorted(freqs.items())):
        heap.append((f, i, ch, None, None))
    heapq.heapify(heap)
    uid = len(heap)

    while len(heap) > 1:
        f1, _, ch1, l1, r1 = heapq.heappop(heap)
        f2, _, ch2, l2, r2 = heapq.heappop(heap)
        node = (f1 + f2, uid, None,
                (f1, uid * 2, ch1, l1, r1),
                (f2, uid * 2 + 1, ch2, l2, r2))
        heapq.heappush(heap, node)
        uid += 1

    root = heap[0]
    codes = {}

    def walk(node, prefix):
        f, _, ch, left, right = node
        if left is None and right is None:
            codes[ch] = prefix if prefix else "0"
            return
        walk(left, prefix + "0")
        walk(right, prefix + "1")

    walk(root, "")
    wpl = sum(freqs[c] * len(code) for c, code in codes.items())
    return codes, wpl


def huffman_wpl_only(freqs):
    """只求加权路径长: 合并时累加, O(n log n)"""
    if not freqs:
        return 0
    heap = list(freqs.values())
    heapq.heapify(heap)
    total = 0
    while len(heap) > 1:
        a = heapq.heappop(heap)
        b = heapq.heappop(heap)
        total += a + b
        heapq.heappush(heap, a + b)
    return total


def encode_decode_demo(text):
    """完整小示例: 统计、建树、编码、解码"""
    freqs = {}
    for ch in text:
        freqs[ch] = freqs.get(ch, 0) + 1
    codes, wpl = huffman_tree(freqs)
    encoded = "".join(codes[ch] for ch in text)

    # 解码
    rev = {v: k for k, v in codes.items()}
    decoded = []
    buf = ""
    for bit in encoded:
        buf += bit
        if buf in rev:
            decoded.append(rev[buf])
            buf = ""
    assert "".join(decoded) == text
    return codes, encoded, wpl


if __name__ == "__main__":
    # CLRS 16.3 经典例子
    freqs = {"a": 5, "b": 9, "c": 12, "d": 13, "e": 16, "f": 45}
    codes, wpl = huffman_tree(freqs)
    assert wpl == 224
    assert wpl == huffman_wpl_only(freqs)

    # 前缀性
    for c1, code1 in codes.items():
        for c2, code2 in codes.items():
            if c1 != c2:
                assert not code2.startswith(code1)

    # 单字符
    c1, w1 = huffman_tree({"x": 10})
    assert w1 == 0 and c1 == {"x": "0"}

    # 往返
    text = "abracadabra"
    codes2, enc, w2 = encode_decode_demo(text)
    assert sum(freqs.values()) * 1 <= len(enc)  # 粗略
    print("all tests passed")
```

## 五、与其他技术对比

| 维度 | Huffman | 定长编码 | 算术编码 | ANS / rANS |
|---|---|---|---|---|
| 码长 | 整数 bit | 固定 | 小数 bit | 小数 bit |
| 压缩率 | $H \le L < H+1$ | 差 | 接近 $H$ | 接近 $H$ |
| 速度 | 快 | 最快 | 慢 | 快 |
| 实现难度 | 低 | 低 | 高 | 中 |
| 用途 | ZIP/JPEG 阶段 | 简单场景 | JPEG2000/视频 | Zstd/brotli |

取舍：**要简单稳定用 Huffman**；**要极致压缩用算术/ANS**；Huffman 常作为多阶段压缩的第一阶段（预压缩 + 熵编码）。频率高度偏斜时 Huffman 收益巨大；均匀分布时收益小。

## 六、常见误区

1. **以为"频率最高就最短"自动成立**：只有当合并顺序支持时才成立；频率接近时码长可能相同。看树深，不要看频率单独排序。
2. **忽略前缀性，用非前缀变长码**：解码歧义，数据损坏。必须保证码字非前缀（叶子码）。
3. **合并顺序/堆比较元组写错**：频率相同时用 tie-break（如插入序号），否则 `TypeError`（节点含子树不可比较）或不稳定。
4. **WPL 与"总 bit 数"概念混淆**：WPL $=\sum f_i l_i$；若 $f$ 是次数，总 bit 就是 WPL；若是概率，WPL 是期望 bit/符号。
5. **单符号/空输入崩溃**：`len(freqs)<=1` 要特判，否则堆循环出错或码长定义不清。

## 七、与开源书/权威来源对应

- Huffman 1952, *A Method for the Construction of Minimum-Redundancy Codes*, Proc. IRE：原始论文。
- CLRS 第 16.3 节：贪心合并与最优子结构证明。
- Cover & Thomas, *Elements of Information Theory*, Chapter 5：熵、Huffman、Kraft 不等式。
- zlib / gzip / libjpeg 文档：Huffman 在 DEFLATE、JPEG 中的实际使用。

## 八、面试题

**1. 为什么 Huffman 是最优前缀码？**  
交换论证：最小两权必可为最深兄弟；合并后递归。加上最优子结构得整体最优。亦满足 $H \le L < H+1$。

**2. 若频率含 0 如何处理？**  
0 频率符号可不分配码字，或任意给长码；不影响 WPL。若必须编码，放在最后合并。

**3. 如何只求 WPL 不建码表？**  
堆中反复合并最小两个，`total += a+b`，直到一个。`total` 即 WPL，$O(n\log n)$。

**4. Huffman 与算术编码的区别？**  
Huffman 码长为整数 bit，非 2 幂概率有损失；算术编码用小数 bit，更接近熵，但实现复杂、有历史专利问题。现代常用 ANS 兼顾速度与压缩率。

## 九、演进与趋势

Huffman 之后的演进：**自适应 Huffman**（在线更新，Vitter）、**规范 Huffman**（canonical codes，短码表）、**长度受限 Huffman**（码长 $\le L$，用于硬件）、**算术/ANS**（Zstd、brotli、LZMA 内熵编码）、**上下文建模**（PPM、PAQ）与**深度学习压缩**。工程上，JPEG 的 DC/AC 系数、PNG 的 deflate、HTTP 的静态 Huffman（HPACK/QPACK）都用 Huffman；GPU/硬件解码器偏爱规范码表。研究方向包括在线 Huffman、动态序列的熵编码、与纠错码联合设计。

多符号/多进制 Huffman（$D$ 叉树）用于硬件字长受限场景；Package-merge 算法在码长上限约束下仍近似最优。现代压缩器（zstd、brotli）把 Huffman 与 ANS 作为可切换熵编码器，按块统计特征选择。机器学习侧，学习型离散分布驱动的熵编码、神经压缩（LLC）也在探索把"最优码长"与语义模型结合。

## 十、小结

Huffman 用"反复合并最小频率两节点"的贪心构造最优前缀码，交换论证保证最优，WPL 即内部节点权和，复杂度 $O(n\log n)$。它是信息论与压缩工程的基石：理解最深兄弟交换、前缀树对应与熵界 $H \le L < H+1$，就能把这套方法用到 ZIP、JPEG 与面试题里。
