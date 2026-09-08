# BTB基本结构与命中判定

> 对应 Hennessy & Patterson《Computer Architecture: A Quantitative Approach》第3章。

## 一、背景与挑战
在取指阶段，CPU 尚不知道当前 PC 是否为分支。分支目标缓冲（Branch Target Buffer, BTB）是一张以分支指令地址为 key、目标地址为 value 的缓存，用于在取指时即刻给出预测目标。

## 二、核心原理
BTB 是「按指令地址寻址」的关联存储。取指 PC 同时查 BTB：若命中且标记为分支，则预测为 taken，并把存入的目标作为下一 PC；否则顺序取指。命中本身即代表「这是一条历史分支」。

## 三、形式化与数学基础
BTB 命中函数：
$$Hit(pc) = \exists e\in BTB:\; e.tag = pc \land e.valid=1$$
预测下一地址：
$$PC' = \begin{cases} e.target & Hit(pc)\\ pc+4 & \text{otherwise} \end{cases}$$

## 四、代码实现
```c
// BTB 查询示意
Entry* btb_lookup(uint64_t pc) {
    int i = (pc >> 2) & (BTB_WAYS - 1);
    for (int w = 0; w < ASSOC; w++)
        if (btb[i][w].tag == pc && btb[i][w].valid)
            return &btb[i][w];
    return NULL;
}
```

## 五、与其他技术对比
BTB 负责「目标地址」，方向预测器（如两位计数器）负责「是否跳转」；RAS 负责函数返回。三者常常并列构成完整分支预测前端。

## 六、常见误区
误以为 BTB 命中就表示分支一定 taken。其实 BTB 只提供目标，方向需由专用预测器给出，二者解耦。

## 七、与开源书/权威来源对应
Hennessy & Patterson 第3章把 BTB 描述为「用分支指令地址索引的目标缓存」；CSAPP 第4章也说明了取指阶段预判分支目标的重要性。

## 八、面试题
问：BTB 未命中时怎么办？答：默认按顺序取指（not taken），待分支真正解析后再把该分支登记进 BTB。

## 九、演进与趋势
现代 BTB 采用多层结构（L0/L1/L2）、按历史上下文哈希，并和指令预取紧密耦合以减少冷启动代价。

## 十、小结
BTB 把「分支目标」这一本来要到 EX 才知道的信息提前到取指阶段，是降低控制冒险的关键组件。
