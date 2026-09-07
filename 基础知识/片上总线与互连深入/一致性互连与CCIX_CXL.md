# 一致性互连与 CCIX/CXL

> 对应 CCIX 联盟规范与 CXL 联盟规范（厂商/行业手册，真实来源）。

## 一、背景与挑战
CPU 与加速器（GPU、FPGA、ASIC）需共享内存且保持缓存一致，传统 PCIe 无一致语义、需显式拷贝。CCIX/CXL 在互连层提供缓存一致性。

## 二、核心原理
CXL 基于 PCIe 物理层，定义三种协议：CXL.io（IO）、CXL.cache（设备缓存主机内存）、CXL.mem（主机缓存设备内存）。主机与设备通过一致性协议（如 MESI 变体）同步缓存行。

## 三、形式化与数学基础
一致性域扩展后，跨设备的缓存行状态机与片上 MESI 同构，额外开销为链路往返延迟 $L_{link}$：
$$CoherentLatency = L_{onchip} + L_{link}$$
带宽受链路通道数约束，需 snoop 过滤减少广播。

## 四、代码实现
```c
// 设备侧请求主机缓存行(概念)
typedef enum { READ_SHARED, READ_EXCLUSIVE, WRITE_BACK } cxl_req_t;
void cxl_request(uint64_t addr, cxl_req_t t) {
    send_over_cxl_cache(addr, t);   // 经CXL.cache
    wait_snoop_response();          // 一致性响应
    // 设备本地缓存行进入S/E/M态
}
```

## 五、与其他技术对比
CCIX 基于 CCIX 协议（多厂商），CXL 由 Intel 主导基于 PCIe 5.0；二者目标一致，CXL 3.0 进一步支持 fabric 与内存池化。

## 六、常见误区
误以为 PCIe 本身一致：需 CXL/CCIX 叠加。误以为一致互连零开销：链路延迟显著。

## 七、与开源书/权威来源对应
CXL 规范 1.0/2.0/3.0；CCIX 规范；ARM CHI 一致性互连。

## 八、面试题
问：CXL.cache 与 CXL.mem 区别？答：前者设备缓存主机内存，后者主机访问设备内存。

## 九、演进与趋势
CXL 内存池化、disaggregated memory 成为数据中心新范式。

## 十、小结
CCIX/CXL 把缓存一致性延伸到芯片边界，是异构计算与内存解聚的关键使能技术。
