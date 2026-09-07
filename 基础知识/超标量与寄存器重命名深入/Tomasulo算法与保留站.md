# Tomasulo 算法与保留站

> 对应 Hennessy & Patterson 量化方法 Tomasulo 算法章（源自 IBM 360/91）。

## 一、背景与挑战
经典顺序执行中，一条长延迟指令（如浮点除法）会阻塞后续无关指令。Tomasulo 通过"保留站 + 结果总线广播"实现动态调度，让无关指令越过阻塞继续执行。

## 二、核心原理
每功能单元有保留站（RS），指令落入 RS 并等待操作数。若操作数未就绪，记录其将来自哪个 RS/寄存器（通过 CDB 标签）。结果算完经公共数据总线（CDB）广播，所有等待该标签的 RS 捕获。寄存器重命名思想由此萌芽。

## 三、形式化与数学基础
设指令 $i$ 依赖 $j$，当 $j$ 经 CDB 产生结果 $R_j$ 时：
$$tag(i, src) == tag(j) \Rightarrow val_{i,src} \leftarrow R_j,\; ready_i \leftarrow ready_i \vee true$$
发射条件：所有源操作数 ready 或已绑定标签。

## 四、代码实现
```c
// 保留站条目
struct rs { int op; int tag1, tag2; int val1, val2; int rdy1, rdy2; int dst; };
void cdb_broadcast(int tag, int result) {
    for (int i=0;i<NR;i++){            // 唤醒等待者
        if (!rs[i].rdy1 && rs[i].tag1==tag){ rs[i].val1=result; rs[i].rdy1=1; }
        if (!rs[i].rdy2 && rs[i].tag2==tag){ rs[i].val2=result; rs[i].rdy2=1; }
    }
}
```

## 五、与其他技术对比
Scoreboarding 不重命名、存在写后写/读后写假相关；Tomasulo 隐式重命名消除之。现代处理器把 RS 与 ROB 结合演化为统一调度器。

## 六、常见误区
误以为 Tomasulo 等于乱序提交：它只保证乱序执行，提交仍按序（经 ROB）。误以为 RS 无限：容量限制发射。

## 七、与开源书/权威来源对应
量化方法 Tomasulo 完整时序；CSAPP 4.7 硬件控制逻辑类比。

## 八、面试题
问：CDB 为何是瓶颈？答：每周期仅广播一个结果，多结果需多 CDB。

## 九、演进与趋势
物理寄存器文件 + 统一调度队列（如 Intel P6 后）取代分离 RS，降低唤醒延迟。

## 十、小结
Tomasulo 用保留站与标签广播实现动态调度，是乱序执行与寄存器重命名的理论原型。
