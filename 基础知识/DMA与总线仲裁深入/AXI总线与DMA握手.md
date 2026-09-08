# AXI总线与DMA握手

> 对应 ARM AMBA AXI 规范与 ARMv8 手册。

## 一、背景与挑战
AXI（Advanced eXtensible Interface）是高性能片上总线，DMA 控制器需理解其握手与突发机制以实现高吞吐、低延迟传输。

## 二、核心原理
AXI 采用独立读写地址/数据通道与 VALID/READY 握手。主设备置 VALID，从设备以 READY 响应，双方同时有效时传输发生。突发类型 INCR/WRAP/FIXED 决定地址递增方式。

## 三、形式化与数学基础
握手条件：

    transfer_occurs = VALID && READY

突发地址生成：

    addr_{k+1} = addr_k + size  (INCR), 或对边界回绕 (WRAP)

## 四、代码实现
```verilog
// 主设备发送数据
always_ff @(posedge ACLK) begin
    if (VALID && READY) begin
        data_reg <= next_data;
        VALID <= (count < last) ? 1'b1 : 1'b0;
    end
end
```

## 五、与其他技术对比
AXI 的通道分离与突发优于 AHB 的单一流水线，更适合 DMA 大块传输；AXI4-Lite 则用于简单控制寄存器。

## 六、常见误区
误以为 VALID 高时数据必须稳定直到 READY；实际需保持直到握手成功。误以为突发可跨 4KB 边界（AXI 禁止以防地址译码错误）。

## 七、与开源书/权威来源对应
ARM AMBA AXI 规范定义通道、握手与突发规则；ARMv8 手册描述系统内存属性。

## 八、面试题
1. VALID/READY 握手何时完成一次传输？答：两者同周期有效。
2. 为何突发不能跨 4KB？

## 九、演进与趋势
AXI4-Stream 用于无地址流数据；CHI 面向一致性互联。

## 十、小结
AXI 以分离通道与 VALID/READY 握手支撑 DMA 高吞吐突发传输，理解握手与边界规则是正确实现的前提。
