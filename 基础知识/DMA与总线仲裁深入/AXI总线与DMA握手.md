# AXI总线与DMA握手

> 对应 ARM AMBA AXI Protocol Specification（ARM 官方规范）与 ARMv8 ARM 中系统内存属性与设备访问语义的说明。

## 一、背景与挑战

DMA 控制器作为 AXI 主设备，通过五通道（AW/W/B/AR/R）与内存或外设通信。它必须严格遵守 VALID/READY 握手协议，否则会出现两类严重问题：一是握手违规导致从设备采样到不稳定数据；二是 VALID 与 READY 之间形成组合依赖环，导致互联死锁，整个 SoC 挂死。

除协议本身，DMA 场景还有若干特殊挑战：

- 高吞吐需要多笔事务在途（outstanding）并允许乱序完成，因此必须用 ID 把事务分组，并按 ID 维持顺序、跨 ID 允许乱序。
- 突发不能跨 4KB 边界，否则从设备地址译码会跨页，驱动与硬件都要保证。
- 写到设备寄存器（FIXED 突发）与写到内存（INCR 突发）语义不同，窄传输需要 WSTRB 正确标记有效字节。
- 缓存同步、描述符可见性与门铃（doorbell）的 MMIO 次序，必须与 AXI 的顺序规则配合，否则 DMA 会读到半成品描述符。

## 二、核心原理

握手规则（务必逐条遵守）：

1. 只有源端可以拉高 VALID：写地址 AW、写数据 W、读地址 AR 由主设备驱动；写响应 B、读数据 R 由从设备驱动。
2. VALID 一旦拉高，在对应的 READY 被采样之前不得撤销，且负载（地址、数据、控制）必须保持不变。
3. READY 可以在 VALID 之前拉高（从设备预先就绪），READY 与 VALID 之间不允许存在组合逻辑依赖环。
4. 一次传输在时钟上升沿同时看到 VALID 与 READY 为高时完成。
5. 主设备不得等待 READY 才拉 VALID（否则形成 req-ack 环）。

事务排序规则：同一 ID 的事务必须按序完成；不同 ID 可以乱序。写数据通道与写地址通道相互独立——AXI 允许 W 上的数据先于对应 AW 到达（AXI4 中 W 不再携带 WID，因此 W 通道内部不交错，但仍与 AW 无先后约束），从设备必须能缓冲这种情况。写响应 B 与写数据的对应关系由从设备负责，主设备必须等 B 才算写完成。

突发与地址生成：

- INCR：每拍地址加 $2^{AxSIZE}$。
- WRAP：在 $2^{AxSIZE}\times(AxLEN+1)$ 对齐窗口内回绕，适合环形缓冲。
- FIXED：地址不变，适合 FIFO 式寄存器。

窄传输：当 AxSIZE 大于实际数据宽度时，用 WSTRB 标记哪些字节有效；首拍可以非对齐（地址偏移），从设备需要按偏移重组。

4KB 边界规则：一次突发不得跨越对齐的 4KB 边界。这约束了 DMA 的缓冲组织——发送大块数据时，驱动必须按页切分，或依赖 SG 描述符把跨页部分拆成多段。

DMA 与握手配合的典型时序：CPU 填描述符 → 写门铃（MMIO）→ DMA 发起 AR 读描述符 → 按描述符发起数据突发 → 收 B 响应 → 更新状态 → 中断。每一步的顺序都需要屏障或协议保证。

## 三、形式化与数学基础

握手条件的布尔表达：

$$transfer\_occurs = VALID \wedge READY$$

VALID 的保持不变式（$\mathbf{G}$ 表示全局、$\mathbf{U}$ 表示 until）：

$$VALID \Rightarrow \mathbf{G}\big(VALID\ \mathbf{U}\ handshake\big)$$

即一旦拉高，要么立即握手，要么一直保持到握手发生。

突发地址生成（INCR 与 WRAP）：

$$addr_{k+1} = addr_k + 2^{AxSIZE} \quad \text{(INCR)}$$

$$addr_{k+1} = base + \left((addr_k - base + 2^{AxSIZE}) \bmod 2^{AxSIZE}(AxLEN+1)\right) \quad \text{(WRAP)}$$

边界约束：

$$(addr \bmod 4096) + (AxLEN+1)\cdot 2^{AxSIZE} \le 4096$$

吞吐与在途事务：设单笔事务的往返延迟为 $L$、每笔携带 $B$ 字节、在途深度为 $O$，则由利特尔法则得到可持续吞吐上界

$$Throughput_{max} \le \frac{O \cdot B}{L}$$

而实际可达吞吐还要被从设备与内存的有效带宽 $BW_{mem}$ 限制：

$$Throughput = \min\left(\frac{O \cdot B}{L},\ BW_{mem}\right)$$

这解释了 DMA 调优的两个旋钮：增大在途深度（必须从不把并发事务标成同一 ID）与增大单笔突发长度（受 4KB 边界与从设备最大长度限制）。

## 四、代码实现

```verilog
// AXI 写通道主设备侧（DMA 引擎）实现：AW/W 独立推进，B 单独接收
module dma_write_master (
  input  logic        ACLK, ARESETn,
  // AW 通道
  output logic        AWVALID, output logic [31:0] AWADDR,
  output logic [7:0]  AWLEN,   output logic [2:0]  AWSIZE,
  output logic [1:0]  AWBURST, output logic [3:0]  AWID,
  input  logic        AWREADY,
  // W 通道
  output logic        WVALID,  output logic [31:0] WDATA,
  output logic [3:0]  WSTRB,   output logic        WLAST,
  input  logic        WREADY,
  // B 通道
  input  logic        BVALID,  input  logic [3:0]  BID,
  input  logic [1:0]  BRESP,   output logic        BREADY
);
  // AW：有请求即拉 VALID，绝不等待 AWREADY（避免组合环）
  assign AWVALID = aw_pending;
  always_ff @(posedge ACLK or negedge ARESETn) begin
    if (!ARESETn) aw_pending <= 1'b0;
    else if (AWVALID && AWREADY) aw_pending <= 1'b0;   // 握手完成才撤销
  end

  // W：按拍推进，最后一拍置 WLAST；数据保持到握手成功
  always_ff @(posedge ACLK or negedge ARESETn) begin
    if (!ARESETn) begin
      WVALID <= 1'b0; beat <= 0;
    end else if (WVALID && WREADY) begin
      beat   <= beat + 1;
      WVALID <= (beat + 1 < WBEATS);                    // 最后一拍后撤销
      WDATA  <= data_buf[beat + 1];
      WSTRB  <= strb_buf[beat + 1];
      WLAST  <= (beat + 2 == WBEATS);
    end
  end

  // B：只有从设备驱动 VALID；主设备持续 ready 或按需 ready
  assign BREADY = 1'b1;
  always_ff @(posedge ACLK) begin
    if (BVALID && BREADY) begin
      if (BRESP != 2'b00) err_flag <= 1'b1;             // SLVERR/DECERR
      wr_done[BID] <= 1'b1;                             // 按 ID 记录完成
    end
  end
endmodule
```

```c
/* 软件侧的顺序保障：描述符写完 -> 屏障 -> 门铃，
   否则 DMA 可能通过 AXI 读到"有效位已置但内容未写"的破碎描述符 */
static void kick_dma(volatile struct desc *d, volatile uint32_t *doorbell) {
    d->addr = buf_dma_addr;
    d->len  = 4096;                      /* 单段不跨 4KB，规避边界规则 */
    dma_wmb();                           /* 内容对设备可见 */
    d->flags = DESC_OWN | DESC_VALID;    /* 交棒给 DMA 引擎 */
    dma_wmb();
    *doorbell = 1;                       /* MMIO 门铃：必须最后写 */
    mmiowb();                            /* 保证之前的写不越过门铃 */
}
```

实现要点：门铃是 MMIO 写，必须确保「描述符写」不会被重排到门铃之后；同一 ID 的事务必须按序提交，若希望并发则分配不同 ID；写响应错误（SLVERR/DECERR）必须被记录并可恢复，否则 DMA 通道会长期处于错误状态。

## 五、与其他技术对比

| 维度 | AHB | AXI4 | AXI4-Lite | AXI-Stream |
| --- | --- | --- | --- | --- |
| 握手 | HREADY 单一信号 | 每通道独立 VALID/READY | 同 AXI4（无突发） | 仅 TVALID/TREADY |
| 突发 | 支持（短） | INCR/WRAP/FIXED | 无 | 不适用（流式） |
| 乱序 | 不支持 | 按 ID 支持 | 不支持 | 不适用 |
| 在途事务 | 有限 | 深度可配 | 1 | 由流控决定 |
| DMA 适用性 | 中低吞吐 | 高吞吐大块搬运 | 仅控制寄存器 | 数据流旁路 |

## 六、常见误区

1. 主设备「等 READY 再拉 VALID」：典型死锁来源，规范明确要求源端先给出 VALID。
2. 认为 VALID 拉高后可以随便改数据：握手成功前负载必须保持稳定，否则从设备采样到中间态。
3. 认为所有事务都保序：同 ID 保序、异 ID 可乱序，DMA 引擎若把并发事务都标成同一 ID，会退化为串行。
4. 忘记 W 可能在 AW 之前到达：从设备必须缓冲写数据，否则会丢数据或死锁。
5. 忽略 4KB 边界：大块 DMA 必须切段，否则模式译码可能出错或被从设备拒绝。
6. 把门铃写在描述符之前：DMA 可能读到半成品描述符，造成静默数据损坏。
7. 忽略窄传输与首拍非对齐：AxSIZE 与实际数据宽度的配合、WSTRB 的正确标记是窄传输正确性的关键。

## 七、与开源书·权威来源对应

- ARM AMBA AXI Protocol Specification（ARM 官方规范）：通道定义、握手规则、突发类型、ID 排序与 4KB 边界。
- ARM AMBA AXI4-Stream Protocol Specification：流式数据通道的握手与包边界语义。
- ARMv8 ARM：Normal/Device 内存属性与设备访问的排序含义。
- Harris & Harris《Digital Design and Computer Architecture》：同步握手电路与防死锁设计。
- Patterson & Hennessy《Computer Organization and Design》：I/O 与 DMA 的系统视角。
- Hennessy & Patterson《Computer Architecture: A Quantitative Approach》：I/O 性能与总线建模。

## 八、面试题

1. 问：VALID/READY 何时完成一次传输？答：在时钟上升沿两者同时为高即完成；VALID 一旦拉高必须保持到握手发生，负载在此期间不得改变。
2. 问：为什么突发不能跨 4KB 边界？答：一次突发会被映射到单一从设备与单一页属性，跨边界会破坏地址译码与权限检查，因此协议强制禁止。
3. 问：AXI 为什么允许不同 ID 乱序完成？答：长延迟设备与互联需要并行处理多笔事务，按 ID 分组既保留必要的顺序语义（同 ID 保序），又允许跨 ID 的并行与流水，从而用利特尔法则提升吞吐。
4. 问：写数据为什么可能先于写地址到达？答：两个通道完全独立握手，主设备的数据准备与地址生成流水可以错开；从设备需缓冲 W 直到匹配的 AW 到达。
5. 问：门铃为什么必须最后写且需要屏障？答：门铃是触发信号，一旦被观察到，DMA 就会读取描述符；必须保证描述符内容先对设备可见，否则会读到不一致的内容。

## 九、演进与趋势

- AXI5 引入原子操作与更丰富的系统信号，减少「读—改—写」往返，便于实现同步原语。
- 一致性端口（ACE/CHI）让加速器直接参与缓存一致性域，DMA 不再需要手工缓存维护。
- AXI-Stream 在数据通路上与 AXI 内存映射通道配合，形成「控制走 AXI、数据走 Stream」的典型架构。
- 与 CXL/PCIe 桥接：片上 AXI 与片间事务通过桥接层互转，使 DMA 可以向远端内存池发起访问。
- NoC 化：AXI 作为网络接口协议接入 NoC，互联从交叉开关演进为分组交换。

## 十、小结

AXI 与 DMA 的配合本质是「严格握手 + 恰当排序 + 正确边界」。三条铁律不可违背：源端先拉 VALID 且保持到握手完成、同 ID 保序而异 ID 可乱序、突发不跨 4KB 边界。在此之上，DMA 的性能来自按 ID 组织在途事务（利特尔法则）与合理的突发长度，正确性来自描述符的写屏障与门铃次序。把这两层都做对，才能既拿到接近峰值的带宽，又不掉进死锁与静默数据损坏的陷阱。
