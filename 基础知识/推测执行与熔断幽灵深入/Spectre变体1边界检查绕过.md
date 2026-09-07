# Spectre 变体1：边界检查绕过

> 对应 Kocher et al. 2019《Spectre Attacks: Exploiting Speculative Execution》（真实作者年份）。

## 一、背景与挑战
Spectre V1 训练分支"条件成立"，使 CPU 推测执行通过边界检查之后的越界访问，再把越界数据经缓存侧信道泄漏。影响几乎所有带分支预测的处理器。

## 二、核心原理
攻击分三步：1）训练条件分支为 taken；2）触发误预测，推测执行越界读 `array1[x]`，并用其值索引 `array2`；3）测量 `array2` 各偏移的缓存命中，重构出越界字节。

## 三、形式化与数学基础
对合法输入约束 $C(x)$（如 $x<len$），推测执行在 $\neg C(x)$ 时仍运行：
$$Exec_{spec} \models \text{read } array1[x],\quad x \notin [0,len)$$
泄漏量 = 缓存区分度 × 可重复训练次数。

## 四、代码实现
```c
// 易受攻击函数
int victim(size_t x) {
    if (x < SECRET_LEN) {            // 被训练为taken
        return small_table[secret[x] * 64];
    }
    return 0;
}
// 防御: 在边界后插入lfence阻止推测越过检查
if (x < SECRET_LEN) { __builtin_ia32_lfence(); return small_table[secret[x]*64]; }
```

## 五、与其他技术对比
V1 利用条件分支；V2 利用间接分支目标（BTI）；Meltdown 利用权限检查而非分支。V1 在用户态即可跨沙箱。

## 六、常见误区
误以为数组边界检查能挡住：推测执行绕过检查。误以为只在 C 存在：JIT/解释器同样可构造 gadget。

## 七、与开源书/权威来源对应
Kocher 2019 Spectre 论文；Google Project Zero 分析；CS-Notes 安全篇。

## 八、面试题
问：Spectre V1 三步是什么？答：训练、推测越界、缓存侧信道泄漏。

## 九、演进与趋势
浏览器 JIT 引入索引掩码，编译器加 `-mindirect-branch`/LFENCE 缓解。

## 十、小结
V1 揭示了"逻辑正确的边界检查"在推测执行下不再安全，催生了全新的安全编程范式。
