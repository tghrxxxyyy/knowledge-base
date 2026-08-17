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
