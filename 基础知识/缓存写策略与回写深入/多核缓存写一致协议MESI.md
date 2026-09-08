# 多核缓存写一致协议MESI

> 对应 Hennessy & Patterson《Computer Architecture》。

## 一、背景与挑战
多核各自缓存同一内存副本，某核写入后其他核需看到更新，否则产生不一致。MESI 用每行四状态维护一致。

## 二、核心原理
MESI：Modified（脏且独占）、Exclusive（干净独占）、Shared（可能多核共有）、Invalid（无效）。写前需获取独占（M/E），使其他核副本无效；读未命中可共享。

## 三、形式化与数学基础
状态转移（简化）：

    PrRd/PrWr 触发总线事务;
    M -> 任意核读 -> 该行写回内存并转 S 于他核;
    S -> 本核写 -> 广播 Invalidate, 转 M.

## 四、代码实现
```verilog
typedef enum {M,E,S,I} state_t;
always_ff @(posedge clk) begin
    case (state)
      S: if (cpu_write) begin bus_invalidate(); state <= M; end
      I: if (cpu_read)  begin bus_read();      state <= S; end
    endcase
end
```

## 五、与其他技术对比
MSI 无 Exclusive 状态，读即共享导致更多无效；MESI 的 E 减少不必要的共享与写回；MOESI 增加 Owned 优化。

## 六、常见误区
误以为 Shared 行可写；写前须转 M 并无效他人。误以为 MESI 解决非缓存一致 DMA 问题。

## 七、与开源书/权威来源对应
Hennessy & Patterson 详述 MESI 与总线嗅探；ARM 多核常用 MESI 变体。

## 八、面试题
1. 从 S 转到 M 需什么总线事务？答：Invalidate 广播获独占。
2. Modified 行的特征？

## 九、演进与趋势
目录协议替代广播以扩展核数；MESI 仍是教学与实现基石。

## 十、小结
MESI 用四状态与总线事务保证多核写一致，是共享内存系统的核心协议。
