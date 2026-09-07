# 缓解措施：KAISER/KPTI 与 retpoline

> 对应 Gruss 等 KAISER 论文与 Intel retpoline 指南（厂商手册/真实来源）。

## 一、背景与挑战
熔断/幽灵披露后，需在尽量不伤性能的前提下阻断侧信道。两类核心缓解：KPTI（隔离内核/用户页表）对抗 Meltdown，retpoline（替换间接跳）对抗 Spectre V2。

## 二、核心原理
KPTI 默认不把内核映射进用户页表，仅保留必要 trampoline，切换时刷新部分页表，使 Meltdown 无法越权读内核。retpoline 将间接分支改为 `call`+`pause; jmp` 的返回形态，利用 RAS（难被跨进程投毒）阻断 BTI。

## 三、形式化与数学基础
KPTI 使内核虚拟页在用户态 TLB 不可达：
$$VA_{kernel} \notin TLB_{user} \Rightarrow Load(VA_{kernel}) \text{ 页表遍历即失败, 无数据返回}$$
retpoline 把 $Indirect(x)$ 变为 $Return$，目标由 RAS 决定，绕过 BTB 预测。

## 四、代码实现
```c
// retpoline 模板(AT&T汇编)
__asm__ volatile (
  "call .Lspec_push\n"
  ".Lspec_ret: pause; lfence; jmp .Lspec_ret\n"
  ".Lspec_push: lea (%rip), %rax; ret\n"
);
// KPTI: 内核入口/返回切换CR3
void entry_from_user(){ write_cr3(kernel_cr3); }
void exit_to_user(){ write_cr3(user_cr3); }
```

## 五、与其他技术对比
KPTI 抗 Meltdown 但增 TLB 刷新开销（约数 %）；retpoline 抗 V2 但间接调用变慢；eIBRS/IBPB 为硬件替代方案。

## 六、常见误区
误以为 KPTI 防 Spectre：它主要防 Meltdown。误以为 retpoline 影响所有跳转：仅间接分支。

## 七、与开源书/权威来源对应
KAISER (Gruss 2017/18)；Intel retpoline 白皮书；Linux KPTI/IBPB 补丁。

## 八、面试题
问：KPTI 性能代价来源？答：用户/内核切换的 TLB 刷新与页表切换。

## 九、演进与趋势
硬件 eIBRS、自动数据采样清除（MD_CLEAR）逐步替代纯软件缓解。

## 十、小结
KAISER 与 retpoline 是软件层对微架构漏洞的快速止血，推动硬件长期修复。
