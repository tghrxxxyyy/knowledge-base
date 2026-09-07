# 用户态COW字符串实现

> 对应 munificent/craftinginterpreters 中字符串内部化与 youngyangyang04/leetcode-master 中不可变字符串思路。

## 一、背景与挑战
很多语言（如早期的 C++ COW string、Go 字符串、Java 字符串常量）希望赋值/切片不复制底层字节，写时才复制。这种"用户态 COW"靠引用计数或不可变语义实现，避免大字符串拷贝。

## 二、核心原理
不可变字符串（Java/Go）天然共享：赋值只复制指针，修改需新建字符串，无显式复制。可变 COW 字符串（如旧 std::string 的 COW）在写前检查引用计数：>1 则先复制再写。注意 C++11 起禁止 COW string 因多线程与 `c_str()` 别名问题。

## 三、形式化与数学基础
不可变共享：赋值成本 $O(1)$，新串成本 $O(n_{new})$。COW 可变：
$$write\; if\; ref > 1:\; s' = copy(s);\ ref(s') = 1;\ ref(s) \mathrel{-}= 1$$
期望复制量降为实际写触发量，但并发下需原子 `ref` 致开销。

## 四、代码实现
```c
// 简化 COW 字符串：写时检测引用计数
struct CowStr { char *buf; size_t len; int *refs; };
void cow_write(CowStr *s, size_t i, char c) {
    if (*s->refs > 1) {           // 他人共享，先复制
        char *nb = strndup(s->buf, s->len);
        (*s->refs)--; s->buf = nb; s->refs = malloc(sizeof(int)); *s->refs = 1;
    }
    s->buf[i] = c;
}
```

## 五、与其他技术对比
不可变字符串零 COW 逻辑但写贵；SSO（短字符串优化）对小串栈内联免分配；Rope 结构适合大文本编辑。相较内核 COW，用户态版无硬件异常、靠计数/语义。

## 六、常见误区
误以为 COW 字符串总是快：并发原子计数反而慢，故 C++11 弃用。误以为切片需复制：可共享底层缓冲只改视图。误以为不可变=COW：不可变靠不可写，无需复制检测。

## 七、与开源书/权威来源对应
craftinginterpreters 讲字符串 intern 与不可变；C++11 标准移除 COW 字符串规定（21.3）。

## 八、面试题
问：为什么 C++11 禁用 COW std::string？答：多线程下 `c_str()` 别名与原子计数开销破坏 `const` 语义与性能。问：Go 字符串如何共享？

## 九、演进与趋势
SSO 与 `std::string_view`（零拷贝只读视图）取代 COW；Arc<String> 在 Rust 提供安全共享所有权。

## 十、小结
用户态 COW 用引用计数或不可变语义实现惰性复制，但因并发与别名问题已被 SSO/view 取代。
