# AMBA AXI 总线协议

> 对应 ARM AMBA AXI Protocol Specification（AXI3/AXI4/AXI5，ARM 官方规范，真实来源）与 Harris & Harris《Digital Design and Computer Architecture》。

## 一、背景与挑战

SoC 内存在多主（CPU 簇、DMA、GPU/NPU、PCIe 控制器、视频编解码）对多从（DDR 控制器、片上 SRAM、外设寄存器）的并发访问。AHB/APB 的单流水线共享总线在并发度、乱序能力与时序收敛上都受限。AXI（Advanced eXtensible Interface）的设计目标正是：高吞吐、支持乱序完成、便于插入寄存器切片（register slice）做时序收敛、天然支持多主互联。

由此带来四类挑战。第一，多主并发要求地址通道与数据通道解耦，否则长延迟从设备会阻塞整条流水线。第二，乱序完成必须靠事务标识（ID）加上响应重排序缓冲来恢复顺序语义。第三，握手必须无死锁，VALID 与 READY 之间不允许形成组合依赖环。第四，突发不能跨 4KB 边界，否则会破坏从设备的地址译码与访问权限边界。

## 二、核心原理

AXI4 定义五个独立通道，每个通道都是单向的 VALID/READY 握手：

- 写地址 AW、写数据 W、写响应 B：只有主设备发 AW/W 的 VALID，只有从设备发 B 的 VALID。
- 读地址 AR、读数据 R：同理，AR 由主发 VALID，R 由从发 VALID。

关键字段：AxLEN（突发拍数减一）、AxSIZE（每拍字节数 $=2^{AxSIZE}$）、AxBURST（INCR/WRAP/FIXED）、AxCACHE、AxPROT、AxQOS、AxLOCK、AxID。W 通道还有 WSTRB 写选通，用于窄传输（narrow transfer）与稀疏写。

排序规则是整个协议的核心：**同 ID 事务必须按序返回，不同 ID 事务可以乱序完成**。这使互联可以用多组 ID 建立多个「虚拟流」，实现并行与保序的灵活组合。在途事务数（outstanding）决定长延迟下的吞吐上限。

其他机制：首拍可非对齐（从设备需处理偏移）；突发地址在 INCR 下逐拍递增，WRAP 下在 $2^{AxSIZE}\times(AxLEN+1)$ 对齐窗口内回绕，FIXED 下固定不变（用于 FIFO 式外设）；AxLOCK 实现独占访问（LL/SC 语义的硬件支撑）。AXI4 相对 AXI3 取消了 WID（写数据不再交错），并把 INCR 突发的长度上限放宽到 256 拍；AXI4-Lite 无突发，面向寄存器；AXI4-Stream 无地址，面向流式数据。

## 三、形式化与数学基础

一次突发的总字节数：

$$BurstBytes = (AxLEN + 1) \times 2^{AxSIZE}$$

4KB 边界约束（必须不能跨越对齐的 4KB 边界）：

$$(addr \bmod 4096) + BurstBytes \le 4096$$

有效带宽（受反压 stalls 影响）：

$$BW_{eff} = \frac{BurstBytes}{(BurstCycles + StallCycles)} \times f_{clk}$$

WRAP 突发的地址生成：

$$addr_{k+1} = base + \big((addr_k - base + 2^{AxSIZE}) \bmod (2^{AxSIZE}(AxLEN+1))\big)$$

在途事务与吞吐的关系可由利特尔法则（Little's Law）刻画。设单笔事务的往返延迟为 $L$、在途事务数为 $O$、每笔事务数据量为 $B$，则可持续吞吐上界：

$$Throughput \le \frac{O \cdot B}{L}$$

这说明「提高 outstanding 深度」与「提高单笔突发长度」是提升 AXI 吞吐的两条正交路径：前者对抗长延迟，后者降低每字节的协议开销。

## 四、代码实现

```verilog
// 主设备读地址通道 + 从设备读数据通道（含 ID 重排序缓冲）
// 1) 主设备侧：按 ID 发送 AR
always_ff @(posedge ACLK or negedge ARESETn) begin
  if (!ARESETn) begin
    ARVALID <= 1'b0;
  end else begin
    if (!ARVALID || ARREADY) begin        // 通道空闲或被接收
      ARVALID <= req_pending;             // 有请求才拉高 VALID
      ARADDR  <= next_addr;
      ARID    <= next_id;
      ARLEN   <= 8'd15;                   // 16 拍突发
      ARSIZE  <= 3'd3;                    // 8 字节/拍
      ARBURST <= 2'b01;                   // INCR
    end
  end
end

// 2) 从设备/互联侧：按 ID 分桶重排，同 ID 保序、异 ID 并行
//    深度受限的 reorder buffer，避免无界重排状态
wire [N_ID-1:0] rlast;                    // 每个 ID 的未完成计数
always_ff @(posedge ACLK) begin
  if (RVALID && RREADY) begin
    if (RLAST) incr_pending[RID] <= incr_pending[RID] - 1'b1;
  end
end
```

握手必须遵守的协议不变式（以 VALID 为例）：一旦 VALID 拉高，在其被 READY 采样之前不得撤销，且必须保持负载稳定；也就是说

$$VALID_i \Rightarrow \mathbf{G}(VALID_i \ \mathbf{U}\ handshake)$$

标准的防死锁做法是在主从之间插入 skid buffer（二级弹性缓冲），使 READY 不直接组合依赖对方的 VALID，切断组合环：

```verilog
// 2 深度 skid buffer：切断 ready 的组合路径
always_ff @(posedge clk) begin
  if (in_valid && !buf_full) begin buf_data[0] <= in_data; buf_valid <= 1'b1; end
  if (out_ready && buf_valid)  begin out_data  <= buf_data[0]; out_valid <= 1'b1; end
end
assign in_ready = !buf_full;              // in_ready 不依赖 out_ready
```

## 五、与其他技术对比

| 维度 | APB | AHB/AHB-Lite | AXI4 | AXI4-Lite | AXI4-Stream |
| --- | --- | --- | --- | --- | --- |
| 通道数 | 2（地址/数据合并） | 1 流水线 | 5 独立通道 | 5（无突发） | 1（纯数据） |
| 突发支持 | 无 | 有（限定） | 1–256 拍 INCR | 无（单拍） | 无（天然流） |
| 乱序完成 | 不支持 | 不支持 | 支持（按 ID） | 不支持 | 不适用 |
| 典型用途 | 低速寄存器 | 中低速外设 | 内存/高带宽主从 | 控制寄存器 | DSP/视频流 |
| 互连复杂度 | 极低 | 低 | 中高（仲裁、重排） | 低 | 低 |

与 CHI 相比，AXI 面向「非一致性」访问；CHI 在互连层定义一致性事务（ReadShared/ReadUnique 等）与更细的缓存状态，用于多核缓存一致性域。

## 六、常见误区

1. 主设备「等 READY 再拉 VALID」：这是组合依赖，可能死锁。规范要求主设备先给出 VALID，且不得等待 READY。
2. 认为 W 必须晚于 AW：AXI 允许写数据先于写地址到达，从设备需能缓冲；在 AXI4 中因无 WID，W 通道不交错但顺序仍不受 AW 约束。
3. 认为同 ID 可以乱序：同 ID 必须保序返回，否则重排逻辑无法恢复事务边界。
4. 把 4KB 边界当成性能建议：它是协议强制约束，跨越会导致译码与权限检查错误。
5. 用 AXI-Lite 做大块数据搬运：无突发导致每字节一次握手，吞吐极低。
6. 忽略 WLAST/B 的对应关系：一次写突发的完成以 B 响应为准，写数据发完不等于写已完成。
7. 认为 READY 必须等 VALID：READY 可以先于 VALID 拉高，用于挂起式从设备。

## 七、与开源书·权威来源对应

- ARM AMBA AXI Protocol Specification（AXI3/AXI4/AXI5，ARM 官方规范）：通道定义、握手规则、突发与边界约束。
- ARM AMBA AXI4-Stream Protocol Specification：无地址流式传输语义。
- ARM AMBA CHI 规范：一致性互连事务与缓存状态。
- Harris & Harris《Digital Design and Computer Architecture》：总线、握手与时序电路实现基础。
- Patterson & Hennessy《Computer Organization and Design》：I/O 与互连的系统视角。
- ARMv8 ARM：系统内存属性（Normal/Device/Strongly-ordered）与 AxCACHE 的对应关系。

## 八、面试题

1. 问：AXI 为何分离地址与数据通道？答：解耦后地址与数据可各自握手，从设备可以流水接收，主设备可以多笔在途，吞吐与并发度大幅提升，同时便于插寄存器切片做时序收敛。
2. 问：VALID/READY 何时完成一次传输？答：在时钟上升沿两者同时为高即视为一次传输完成；任意一方未就绪则该拍无效，且 VALID 一旦拉高不得撤销。
3. 问：为什么突发不能跨 4KB 边界？答：便于从设备做地址译码、权限与保护检查，并约束互联的地址映射精度；跨越会使一次突发落入不同页面/不同从设备。
4. 问：不同 ID 的乱序完成对主设备意味着什么？答：主设备必须有按 ID 匹配的响应处理逻辑，且不能依赖跨 ID 的完成顺序；这正是提升吞吐的关键自由度。
5. 问：如何在 AXI 中实现独占访问？答：用 AxLOCK 表示独占事务，从设备需在独占监控器中记录地址并在后续普通写时判断是否被破坏，从而支撑 LL/SC 原语。

## 九、演进与趋势

- AXI5 引入原子操作（如原子比较交换、原子取加等）与更丰富的系统级信号，减少「读—改—写」的往返。
- 一致性扩展 ACE/CHI 取代「非一致 AXI + 软件维护缓存」，成为多核互连主流。
- 与 CXL/PCIe 的衔接：片上 AXI 与片间 CXL.io/CXL.cache 通过桥接层互转，形成从片内到机架的一致访问路径。
- NoC 化互联：从共享总线式 AXI 交叉开关过渡到分组交换 NoC，AXI 作为网络接口（NI）协议。
- 形式化与断言验证：以 SVA/形式化属性校验 VALID/READY 协议不变式，已成为 SoC 验证基本动作。

## 十、小结

AXI 用「五通道解耦 + VALID/READY 握手 + 按 ID 乱序」三件套，把共享总线时代无法兼顾的吞吐、并发与时序收敛统一起来，成为现代 SoC 互连事实标准。正确实现的关键在于：绝不制造 VALID/READY 组合环、严格维护同 ID 顺序、尊重 4KB 边界，并用 outstanding 深度和突发长度这两把尺子去逼近带宽上界。
