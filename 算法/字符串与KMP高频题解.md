# 字符串与 KMP 高频题解

> 板块：算法 　|　 返回：[README](README.md)
> 关联：[滑动窗口与双指针高频题解](滑动窗口与双指针高频题解.md)、[高频算法题归类与套路](高频算法题归类与套路.md)、[堆与栈高频题解](堆与栈高频题解.md)

字符串是面试高频区，涵盖双指针、哈希、KMP、Trie、DP 等。本文聚焦最易考的 KMP 及若干经典题，讲清 next 数组推导与代码。

## 一、翻转 / 双指针类

### 1.1 反转字符串（LeetCode 344）

```java
void reverseString(char[] s){
    int l=0,r=s.length-1;
    while(l<r){ char t=s[l]; s[l]=s[r]; s[r]=t; l++; r--; }
}
```

### 1.2 验证回文串（LeetCode 125）

```java
boolean isPalindrome(String s){
    int l=0,r=s.length()-1;
    while(l<r){
        while(l<r && !Character.isLetterOrDigit(s.charAt(l))) l++;
        while(l<r && !Character.isLetterOrDigit(s.charAt(r))) r--;
        if(Character.toLowerCase(s.charAt(l++))!=Character.toLowerCase(s.charAt(r--))) return false;
    }
    return true;
}
```

## 二、KMP：高效子串匹配

### 2.1 为什么需要 KMP

暴力匹配 `O(n*m)`：主串退回，低效。KMP 利用**已匹配部分的信息**，失配时主串指针不回退，模式串按 next 数组跳跃，复杂度 `O(n+m)`。

### 2.2 next 数组（部分匹配表）

`next[i]` = 模式串 `P[0..i]` 的「最长相等前后缀长度」。它能告诉：失配时模式串该回退到哪。

```
P = "ABABC"
前缀: A, AB, ABA, ABAB
后缀: ..., BABC, ABC, BC, C
next[4] (ABABC): 最长相等前后缀 = "AB"(前2) == "AB"(后2) → 2
```

### 2.3 求 next（自我匹配）

```java
int[] getNext(String p){
    int n=p.length();
    int[] next=new int[n];
    next[0]=0;
    int len=0;                  // 已匹配长度（前缀尾）
    int i=1;
    while(i<n){
        if(p.charAt(i)==p.charAt(len)){
            next[i++]=++len;     // 匹配，长度+1
        } else if(len>0){
            len=next[len-1];     // 回退到更短前缀
        } else {
            next[i++]=0;         // 无匹配
        }
    }
    return next;
}
```

### 2.4 KMP 主流程

```java
int kmp(String s, String p){
    int[] next=getNext(p);
    int i=0,j=0;
    while(i<s.length()){
        if(s.charAt(i)==p.charAt(j)){ i++; j++; }
        if(j==p.length()) return i-j;        // 匹配成功
        else if(i<s.length() && s.charAt(i)!=p.charAt(j)){
            if(j>0) j=next[j-1];            // 模式串回退
            else i++;                       // 主串前进
        }
    }
    return -1;
}
```

> 要点：失配时 `j=next[j-1]`（注意是 `j-1` 的 next），主串 `i` 永不回退。

## 三、经典题：实现 strStr（LeetCode 28）

直接用上面的 KMP 即可；简单场景也可暴力或 `s.indexOf(p)`（面试要求手写 KMP）。

## 四、字符串哈希（Rabin-Karp）

- 把子串映射为数值（滚动哈希），比较哈希而非逐字符，平均 O(n)。
- 适合"找重复子串/异位词"等。
- 注意哈希冲突（可双哈希或遇冲突再逐字符校验）。

```java
// 滚动哈希示例（基31，取模）
long h=0, base=31, mod=1_000_000_007;
for(char c: pattern) h=(h*base+c)%mod;
```

## 五、异位词 / 计数类

### 5.1 字母异位词（LeetCode 242）

```java
boolean isAnagram(String a, String b){
    if(a.length()!=b.length()) return false;
    int[] cnt=new int[26];
    for(char c:a) cnt[c-'a']++;
    for(char c:b) if(--cnt[c-'a']<0) return false;
    return true;
}
```

## 六、最长回文子串（LeetCode 5）

- 中心扩展：每个字符（及字符间）向两边扩，O(n²)。
- Manacher：O(n) 线性算法（面试通常中心扩展即可）。

```java
String longestPalindrome(String s){
    String res="";
    for(int i=0;i<s.length();i++){
        String o=expand(s,i,i), e=expand(s,i,i+1);
        if(o.length()>res.length()) res=o;
        if(e.length()>res.length()) res=e;
    }
    return res;
}
String expand(String s,int l,int r){
    while(l>=0&&r<s.length()&&s.charAt(l)==s.charAt(r)){l--;r++;}
    return s.substring(l+1,r);
}
```

## 七、常见坑

1. **KMP next 写错** → `j=next[j]` 应为 `next[j-1]`，边界易错。
2. **回文中心漏偶数长度** → 只扩奇数中心会漏 "abba"。
3. **哈希冲突不处理** → Rabin-Karp 误判（加校验）。
4. **大小写/非字母** → 回文题忘了过滤。
5. **字符串不可变频繁拼接** → 用 StringBuilder，尤其 DP/构造题。
6. **索引越界** → 子串题多越界，注意 `i<r` 与 `j==len` 顺序。

## 八、刷题清单

| 题 | 套路 |
|----|------|
| 344 反转字符串 | 双指针 |
| 125 验证回文 | 双指针+过滤 |
| 5 最长回文子串 | 中心扩展/Manacher |
| 28 strStr | KMP / 暴力 |
| 242 异位词 | 计数数组 |
| 76 最小覆盖子串 | 滑动窗口 |
| 3 最长无重复 | 哈希+窗口 |
| 139 单词拆分 | DP |

## 九、延伸阅读

- [滑动窗口与双指针高频题解](滑动窗口与双指针高频题解.md)
- [高频算法题归类与套路](高频算法题归类与套路.md)
- [堆与栈高频题解](堆与栈高频题解.md)
- [二分查找与排序高频题解](二分查找与排序高频题解.md)
- [动态规划与图论高频题解](动态规划与图论高频题解.md)
