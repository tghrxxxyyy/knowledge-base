# Spectre 变体2：分支目标注入

> 对应 Kocher et al. 2019 Spectre 论文（BTI，分支目标注入），真实作者年份。

## 一、背景与挑战
Spectre V2 利用间接分支（如函数指针、虚表）的预测器（BTB）被攻击者可控地"投毒"，使受害者推测跳转到攻击者选中的 gadget，从而泄漏数据。

## 二、核心原理
攻击者在自身地址空间执行与目标间接调用相同（或别名）PC，训练 BTB 指向恶意 gadget。受害者调用该间接分支时误预测到 gadget，推测执行泄露。跨地址空间 BTB 共享是关键。

## 三、形式化与数学基础
BTB 以 PC 为键映射目标 $T$。投毒使：
$$T_{pred}(PC_{victim}) = PC_{gadget} \neq T_{arch}$$
推测在此错误目标上执行 $Gadget$，其内存访问 $array2[secret \times k]$ 留下缓存痕迹。

## 四、代码实现
```c
// 受害者间接调用
void (*dispatch)(int) = &handler_a;
// 攻击者先执行 dispatch=evil 训练BTB(同PC地址)
// 受害者调用时推测跳evil:
dispatch(arg);
// 缓解: retpoline 用return指令替代间接跳
void *safe = &gadget; __asm__("call set_rax; ret");
```

## 五、与其他技术对比
V1 是条件分支越界，V2 是间接分支目标劫持；V2 更通用（任意 gadget）、缓解更难（需 retpoline 或 eIBRS）。

## 六、常见误区
误以为地址空间隔离能挡 V2：BTB 跨进程共享。误以为只读间接调用安全：预测器可被训练。

## 七、与开源书/权威来源对应
Kocher 2019；Intel retpoline 指南；Linux 内核 KPTI/IBPB 文档。

## 八、面试题
问：retpoline 如何阻止 BTI？答：用 return 栈（RAS）替代间接跳，RAS 不易被跨进程投毒。

## 九、演进与趋势
eIBRS 硬件隔离 BTB，IBPB 在上下文切换刷新预测器。

## 十、小结
V2 把"控制流预测"变成攻击向量，迫使硬件为预测器增加安全边界。
