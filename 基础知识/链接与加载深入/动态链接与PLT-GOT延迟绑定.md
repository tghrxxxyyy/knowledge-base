# 动态链接与PLT-GOT延迟绑定

> 对应 Bryant & O'Hallaron《CSAPP》第 7.13 节；Levine《Linkers and Loaders》第 10 章。

## 一、背景与挑战
把 libc 等库做成共享对象（.so）可在多进程间共享物理页，但函数地址在加载前未知。若加载期全部解析，启动慢且多数函数永不调用，纯属浪费。

## 二、核心原理
采用过程链接表（PLT）与全局偏移表（GOT）解耦调用与解析。第一次调用经 PLT 跳到动态链接器，解析真实地址回填 GOT，之后调用直接经 GOT 跳转，即惰性绑定（lazy binding）。GOT[1] 存 link_map，GOT[2] 存 _dl_runtime_resolve 入口。

## 三、形式化与数学基础
第 $i$ 个外部函数的解析满足：
$$GOT[2+i] = \begin{cases} PLT_{stub} & \text{未绑定} \\ addr(f_i) & \text{已绑定} \end{cases}$$
绑定次数 $B \le N$（N 为被实际调用的函数数，而非全部导入数）。

## 四、代码实现
```c
// x86-64 PLT 跳转伪码
plt0: jmp *GOT[2]          // 进入动态链接器
      push $index
      jmp  _dl_runtime_resolve
// 之后 GOT[index] 被改写为真实地址
```

## 五、与其他技术对比
惰性绑定省启动时间但首次调用有开销且难做完整 relocation 校验；立即绑定（-z now）在加载期全部解析，利于安全（CFI/W^X）但拖慢启动。

## 六、常见误区
1. 认为 PLT 与 GOT 是一回事——PLT 是代码桩，GOT 是数据表。
2. 以为 GOT 只存函数——它也存全局变量地址。
3. 在只读 GOT 上加写保护（RELRO）可防 GOT 劫持，但与惰性绑定冲突。

## 七、与开源书/权威来源对应
CSAPP 7.13 完整走查 lazy binding；Levine ch10 讲动态链接器；CyC2018/CS-Notes 有图解。

## 八、面试题
问：PLT 与 GOT 各自作用？lazy binding 流程？为何 RELRO 需关闭惰性绑定？

## 九、演进与趋势
IFUNC 解析、GOT 只读化（full RELRO）、以及 -z now 默认化成为主流发行版加固基线。

## 十、小结
PLT/GOT 把地址解析推迟到首次使用，是空间与时间权衡的经典实现。
