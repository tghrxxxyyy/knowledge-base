# KMP 与 AC 自动机（字符串匹配）

> KMP 解决**单模式串匹配**（在文本中找一个模式），AC 自动机解决**多模式串匹配**（在文本中同时找多个模式）。两者都是「**预处理模式串 → 利用已匹配信息避免重复比较**」的思路。本篇按「解决的问题 → 原理 → 模板 → 对比」拆解。

---

## 一、KMP（Knuth-Morris-Pratt）

### 1.1 要解决的问题

| 痛点 | 说明 |
|------|------|
| 暴力匹配 O(nm) | 文本长度 n，模式长度 m，每次失配从头比较 |
| 重复比较 | 已匹配的前缀信息没有利用 |

### 1.2 核心思想

```
next 数组（前缀函数）：next[i] = 模式串 [0..i] 中最长的相等前后缀长度

例：模式 "ABABC"
next[0] = 0
next[1] = 0 (A≠B)
next[2] = 1 (A==A)
next[3] = 2 (AB==AB)
next[4] = 0

匹配时失配 → 不回退文本指针，只移动模式指针到 next[j]
→ 文本指针最多前进 n 步，总时间 O(n+m)
```

### 1.3 代码模板

```cpp
// KMP 模板（C++）
vector<int> buildNext(string& pattern) {
    int m = pattern.size();
    vector<int> next(m, 0);
    for (int i = 1, len = 0; i < m; ) {
        if (pattern[i] == pattern[len]) {
            next[i++] = ++len;
        } else if (len) {
            len = next[len - 1];
        } else {
            next[i++] = 0;
        }
    }
    return next;
}

vector<int> kmpSearch(string& text, string& pattern) {
    vector<int> next = buildNext(pattern);
    vector<int> result;
    int n = text.size(), m = pattern.size();
    for (int i = 0, j = 0; i < n; ) {
        if (text[i] == pattern[j]) {
            i++; j++;
            if (j == m) {
                result.push_back(i - j);  // 匹配位置
                j = next[j - 1];
            }
        } else if (j) {
            j = next[j - 1];
        } else {
            i++;
        }
    }
    return result;
}
```

### 1.4 KMP 变体

| 变体 | 用途 |
|------|------|
| 最长公共前后缀 | next 数组本身 |
| 最小循环节 | 若 n % (n - next[n-1]) == 0，循环节长度 = n - next[n-1] |
| 字符串周期 | 利用 next 数组判断 |

---

## 二、AC 自动机（Aho-Corasick）

### 2.1 要解决的问题

| 痛点 | 说明 |
|------|------|
| 多模式匹配 | 文本中同时找 N 个模式串（如敏感词过滤） |
| KMP 不适用 | 对每个模式跑 KMP 是 O(N*(n+m))，太慢 |

### 2.2 核心思想

```
AC 自动机 = Trie（前缀树）+ KMP（失配指针）

构建：
  1. 把所有模式串插入 Trie
  2. BFS 构建 fail 指针（类似 KMP 的 next 数组，但是树上的）
  3. fail[x] = 节点 x 的最长真后缀在 Trie 中的位置

匹配：
  1. 沿 Trie 边走（匹配成功继续）
  2. 失配时沿 fail 指针跳转（不回退文本指针）
  3. 到达输出节点（Output）= 匹配到某个模式串
```

### 2.3 代码模板

```cpp
// AC 自动机模板（C++）
struct AhoCorasick {
    static const int CHARSET = 26;
    struct Node {
        int next[CHARSET], fail, end;
        Node() : fail(0), end(0) { memset(next, 0, sizeof(next)); }
    };
    vector<Node> tree;
    
    AhoCorasick() { tree.emplace_back(); }
    
    void insert(string& s) {
        int u = 0;
        for (char c : s) {
            int idx = c - 'a';
            if (!tree[u].next[idx]) {
                tree[u].next[idx] = tree.size();
                tree.emplace_back();
            }
            u = tree[u].next[idx];
        }
        tree[u].end++;
    }
    
    void build() {
        queue<int> q;
        for (int c = 0; c < CHARSET; c++) {
            if (tree[0].next[c]) q.push(tree[0].next[c]);
        }
        while (!q.empty()) {
            int u = q.front(); q.pop();
            for (int c = 0; c < CHARSET; c++) {
                if (tree[u].next[c]) {
                    tree[tree[u].next[c]].fail = tree[tree[u].fail].next[c];
                    q.push(tree[u].next[c]);
                } else {
                    tree[u].next[c] = tree[tree[u].fail].next[c];
                }
            }
        }
    }
    
    int search(string& text) {
        int u = 0, count = 0;
        for (char c : text) {
            u = tree[u].next[c - 'a'];
            for (int t = u; t && tree[t].end != -1; t = tree[t].fail) {
                count += tree[t].end;
                tree[t].end = -1;  // 去重
            }
        }
        return count;
    }
};
```

---

## 三、KMP vs AC 自动机

| 维度 | KMP | AC 自动机 |
|------|-----|-----------|
| 模式串数量 | 1 个 | 多个 |
| 数据结构 | next 数组 | Trie + fail 指针 |
| 时间复杂度 | O(n+m) | O(n + Σm_i + 输出) |
| 适用 | 单串匹配/周期判断 | 多串匹配/敏感词过滤 |

---

## 四、LeetCode 常见题

| 题号 | 题目 | 用什么 |
|------|------|--------|
| 28 | Find the Index of the First Occurrence | KMP |
| 459 | Repeated Substring Pattern | KMP（最小循环节） |
| 212 | Word Search II | Trie + DFS |
| 1032 | Stream of Characters | AC 自动机 / Trie |
| 敏感词过滤 | 实战场景 | AC 自动机 |

---

## 五、与其他板块的关系

- 字符串见「[字符串](./字符串.md)」；
- Trie（前缀树）见「[字符串](./字符串.md)」（通常在 Trie 部分）；
- 图论见「[图](./图.md)」；
- 并查集见「[并查集题解](./并查集题解.md)」。

> 一句话：**单串匹配用 KMP（next 数组，O(n+m)）；多串匹配用 AC 自动机（Trie + fail 指针）；LeetCode 遇到字符串匹配先想 KMP，敏感词/多模式想 AC 自动机**。

---

## 六、KMP 原理深挖：为什么文本指针可以只进不退

### 6.1 失配回退的正确性证明

设文本 `T`、模式 `P`，当前在 `T[i]` 与 `P[j]` 处失配（即 `T[i] != P[j]`）。由暴力匹配过程可知，在此之前 `T[i-j .. i-1]` 与 `P[0 .. j-1]` 已完全相等（已匹配长度为 `j`）。

`next[j-1]`（即前缀函数 `π[j-1]`）定义为 `P[0..j-1]` 的**最长相等真前后缀**长度 `L`。这意味着：

- `P[0 .. L-1] == P[j-L .. j-1]`（前缀 == 后缀）；
- 而 `P[j-L .. j-1] == T[i-L .. i-1]`（因为刚匹配过）。

于是 `P[0 .. L-1] == T[i-L .. i-1]`。我们可以把模式向右"滑动"，让 `P[0..L-1]` 对齐到 `T[i-L .. i-1]`，直接从 `P[L]` 与 `T[i]` 继续比较，**文本指针 `i` 不需要回退**。

为什么是最长而不是更短的前缀？因为若存在一个更短的能匹配的真前缀（长度 `L'`），它必然也是 `P[0..j-1]` 的后缀，这与"最长"矛盾；取最长保证**不会漏掉任何可能的匹配起点**（任何比 `L` 短的合法位移都已被包含在"更长位移"之后的尝试里，KMP 通过不断 `j = next[j-1]` 仍能访问到它们）。

### 6.2 逐步模拟：模式 `"ABABC"` 在 `"ABABABC"` 中匹配

| 步骤 | T 指针 i | P 指针 j | 比较 | 动作 |
|------|---------|---------|------|------|
| 1 | 0 | 0 | A==A | i=1,j=1 |
| 2 | 1 | 1 | B==B | i=2,j=2 |
| 3 | 2 | 2 | A==A | i=3,j=3 |
| 4 | 3 | 3 | B==B | i=4,j=4 |
| 5 | 4 | 4 | A!=C | 失配，j=next[3]=2 |
| 6 | 4 | 2 | A==A | i=5,j=3 |
| 7 | 5 | 3 | B==B | i=6,j=4 |
| 8 | 6 | 4 | C==C | i=7,j=5 == m，匹配成功，位置 = 7-5=2 |

可见失配时只移动了模式指针（j: 4→2），文本指针 `i` 从 4 一路前进没回退。

### 6.3 mermaid：KMP 匹配流程

```mermaid
flowchart TD
    A[开始 i=0,j=0] --> B{T[i]==P[j]?}
    B -->|是| C[i++,j++]
    C --> D{j==m?}
    D -->|是| E[记录匹配位置 i-j<br/>j=next[j-1] 继续]
    D -->|否| B
    B -->|否且 j>0| F[j=next[j-1] 模式回退]
    F --> B
    B -->|否且 j==0| G[i++ 文本前进]
    G --> B
    E --> H{还有文本?}
    H -->|是| B
    H -->|否| I[结束]
```

---

## 七、AC 自动机原理深挖：fail 树的本质

### 7.1 fail 指针为什么是"树"结构

`fail[x]` 指向"节点 `x` 所代表字符串的最长真后缀，且该后缀仍是某个模式串的前缀"。因为每个节点有**唯一**的 fail 目标（根节点的所有失败转移指向自身），把 fail 当成"父指针"，所有节点与根构成一棵以 `root` 为根的**fail 树**。

- fail 树上，子节点的字符串 = 父节点字符串 + 一个字符；
- `x` 到根的路径上的每个节点，都是 `x` 所代表字符串的后缀对应状态——这正是"匹配到 `x` 时，同时意味着所有后缀模式也可能被匹配到"的集合。

### 7.2 输出链（output link）优化

朴素做法：到达 `x` 后沿 `fail` 一路向上累加 `end`。优化是预计算每个节点的 `output[x]`（沿 fail 链能到达的最近的"有模式串结尾"的节点），匹配时只沿 `output` 链走，避免重复访问空节点。实践中也可直接在 fail 树上做"子树求和"：建 fail 树后每个模式结尾节点 `+1`，查询某文本位置命中数 = 该节点在 fail 树中子树权值和（可用拓扑序/DFS 序 + 树状数组，参见「位运算.md」「前缀和与差分.md」中的树状数组思想）。

### 7.3 mermaid：Trie + BFS 建 fail

```mermaid
flowchart TD
    subgraph 构建Trie
        T1[插入所有模式串] --> T2[每个节点 children + end]
    end
    subgraph BFS建fail
        B1[root 孩子 fail=root] --> B2{队列非空?}
        B2 -->|是| B3[取 u, 枚举字符 c]
        B3 --> B4{u 有 c 孩子 v?}
        B4 -->|是| B5[fail[v]=follow fail[u] 找 c]
        B4 -->|否| B6[把 u.next[c] 指向 fail[u].next[c]<br/>（Trie 图优化: 补转移边）]
        B5 --> B2
        B6 --> B2
    end
    T2 --> B1
```

> **Trie 图 vs AC 自动机**：把"失配时本应跳 fail 再走的转移"在建树时直接补成实边（代码里 `tree[u].next[c] = tree[tree[u].fail].next[c]` 那一行），匹配时无需显式走 fail，时间更稳，称为 **Trie 图**。

---

## 八、代码实现（Java / Go）

### 8.1 Java：KMP 完整版（含统计出现次数）

```java
public class KMP {
    // 构建前缀函数 next（约定 next[0]=0）
    static int[] buildNext(String p) {
        int m = p.length();
        int[] next = new int[m];
        for (int i = 1, len = 0; i < m; ) {
            if (p.charAt(i) == p.charAt(len)) {
                next[i++] = ++len;
            } else if (len > 0) {
                len = next[len - 1];      // 关键：回退到更短前后缀
            } else {
                next[i++] = 0;
            }
        }
        return next;
    }

    // 返回所有（允许重叠）匹配起点
    static List<Integer> search(String t, String p) {
        int[] next = buildNext(p);
        List<Integer> res = new ArrayList<>();
        int n = t.length(), m = p.length();
        for (int i = 0, j = 0; i < n; ) {
            if (t.charAt(i) == p.charAt(j)) {
                i++; j++;
                if (j == m) {
                    res.add(i - j);       // 命中起点
                    j = next[j - 1];      // 允许重叠：回退继续找
                }
            } else if (j > 0) {
                j = next[j - 1];
            } else {
                i++;
            }
        }
        return res;
    }

    // 最小循环节长度：若 m%(m-next[m-1])==0 且 next[m-1]>0，则 period = m-next[m-1]
    static int minPeriod(String p) {
        int[] next = buildNext(p);
        int m = p.length(), d = m - next[m - 1];
        return (next[m - 1] > 0 && m % d == 0) ? d : m;
    }
}
```

### 8.2 Go：KMP

```go
func buildNext(p string) []int {
    m := len(p)
    next := make([]int, m)
    for i, length := 1, 0; i < m; {
        if p[i] == p[length] {
            next[i] = length + 1
            i++
            length++
        } else if length > 0 {
            length = next[length-1]
        } else {
            next[i] = 0
            i++
        }
    }
    return next
}

func kmpSearch(t, p string) []int {
    next := buildNext(p)
    var res []int
    n, m := len(t), len(p)
    for i, j := 0, 0; i < n; {
        if t[i] == p[j] {
            i++
            j++
            if j == m {
                res = append(res, i-j)
                j = next[j-1]
            }
        } else if j > 0 {
            j = next[j-1]
        } else {
            i++
        }
    }
    return res
}
```

### 8.3 Java：AC 自动机（记录每个模式命中次数）

```java
static class AC {
    static class Node { int[] next = new int[26]; int fail, end; }
    List<Node> tree = new ArrayList<>();
    AC() { tree.add(new Node()); }

    void insert(String s, int id) {
        int u = 0;
        for (char c : s.toCharArray()) {
            int idx = c - 'a';
            if (tree.get(u).next[idx] == 0) {
                tree.get(u).next[idx] = tree.size();
                tree.add(new Node());
            }
            u = tree.get(u).next[idx];
        }
        tree.get(u).end = id;          // 记录模式编号
    }

    void build() {
        Queue<Integer> q = new ArrayDeque<>();
        Node root = tree.get(0);
        for (int c = 0; c < 26; c++)
            if (root.next[c] != 0) q.offer(root.next[c]);
        while (!q.isEmpty()) {
            int u = q.poll();
            for (int c = 0; c < 26; c++) {
                int v = tree.get(u).next[c];
                if (v != 0) {
                    tree.get(v).fail = tree.get(tree.get(u).fail).next[c];
                    q.offer(v);
                } else {
                    tree.get(u).next[c] = tree.get(tree.get(u).fail).next[c];
                }
            }
        }
    }

    int[] search(String text, int patternCnt) {
        int[] hit = new int[patternCnt];
        int u = 0;
        for (char c : text.toCharArray()) {
            u = tree.get(u).next[c - 'a'];
            for (int t = u; t != 0; t = tree.get(t).fail)
                if (tree.get(t).end > 0) hit[tree.get(t).end]++;
        }
        return hit;
    }
}
```

### 8.4 复杂度分析

| 算法 | 预处理 | 单次匹配 | 空间 | 说明 |
|------|--------|----------|------|------|
| 暴力 | — | O(n·m) | O(1) | 失配回退文本指针 |
| KMP | O(m) | O(n+m) | O(m) | 文本指针不回退 |
| AC 自动机 | O(Σmᵢ) | O(n + 输出) | O(Σmᵢ·\|Σ\|) | 多模式一次扫描 |

> 字符集大（如 Unicode）时 `next[26]` 应改为 `Map<Character,Integer>` 或双数组（DAT，见下方踩坑）；Go 中可用 `map[rune]int`。

---

## 九、KMP / AC 进阶变体与应用

| 变体 | 做法 | 例题 |
|------|------|------|
| 统计出现次数 | 命中后 `j = next[j-1]` 继续（允许重叠） | 字符串计数 |
| 不重叠计数 | 命中后 `j = 0` 重置 | 不重叠匹配 |
| 最小循环节 | `d = m - next[m-1]`，`m%d==0` 则周期 `d` | 459 |
| 字符串周期 | `next` 数组递推求所有周期 | 周期判定 |
| 双数组 AC（DAT） | 用 base/check 压缩 Trie，省内存 | 工业级敏感词 |
| fail 树子树统计 | 建 fail 树 + 树状数组求每个模式命中 | 多模式计数 |

### 9.1 最小循环节为什么成立（简要证明）

若 `next[m-1] = L`，则 `P[0..L-1] == P[m-L..m-1]`（前缀==后缀）。令 `d = m - L`，则 `P[0..d-1]` 反复拼接 `m/d` 次恰好 reconstruction 出整个串，故 `d` 是一个循环节；而 `L` 是最长相等前后缀 ⇒ `d` 是最小循环节（否则存在更短前后缀相等，矛盾）。当且仅当 `m % d == 0` 且 `L > 0` 时整串由该循环节完整拼成。

---

## 十、边界与踩坑

- **空模式串**：规范上模式非空；若允许空串，应直接返回所有位置（每个下标都是匹配），单独判断。
- **next 数组索引**：`j = next[j-1]` 而非 `next[j]`——失配在 `j`，要看"已匹配 `j` 个字符"的前缀函数 `next[j-1]`。
- **重叠 vs 不重叠**：`j = next[j-1]` 允许重叠；若业务要求不重叠（如关键词一次算一个），命中后令 `j = 0`。
- **Unicode / 大写**：KMP 比较的是"字符相等"，先做大小写归一或统一编码，否则匹配失败。
- **AC 自动机字符集爆炸**：`26` 写死对小写英文 OK；中文/全字符集必须用 `Map` 或双数组，否则内存撑爆。
- **fail 链去重**：朴素 `end=-1` 去重只适合"统计是否存在"，要"计数每个模式出现几次"必须用 8.3 的 `hit[]` 累加（每节点只加一次自己的 `end`）。
- **Trie 图补边**：`tree[u].next[c] = tree[fail[u]].next[c]` 是 Trie 图优化，若省略则匹配时需在 `next[c]==0` 时显式 `u = fail[u]` 跳，否则会漏匹配。

---

## 十一、速记口诀

> **KMP**：失配不回退文本，模式回退 `next[j-1]`；前后缀最长相等，指针只进不退。
> **最小循环节**：`m - next[m-1]` 是周期，能整除才算"整周期"。
> **AC 自动机**：Trie 装模式，BFS 建 fail；扫描文本沿 Trie，失配跳 fail；多模式一次过，敏感词最佳。
> **选型**：单串 KMP，多串 AC；字符集小用数组，字符集大用 Map；要计数建 fail 树。

---

## 十二、相关主题

- 单模式之外的字符串处理见「[字符串](./字符串.md)」；
- 前缀函数思想与「[动态规划](./动态规划.md)」的线性 DP 同源（找最长/最优子结构）；
- fail 树子树统计用到「[位运算](./位运算.md)」的树状数组 / 「[前缀和与差分](./前缀和与差分.md)」；
- 多模式匹配的工程落地（敏感词）可结合「场景设计」板块的过滤器设计。
