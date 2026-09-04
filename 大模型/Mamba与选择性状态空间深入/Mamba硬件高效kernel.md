# Mamba硬件高效kernel

> 对应 state-spaces/mamba 仓库 CUDA kernel；Tri Dao 经验。

## 一、背景与挑战
Mamba 的选择性扫描在 GPU 上若不优化会极慢。需 fused kernel、共享内存、warp 调度优化。

## 二、核心原理
关键优化：
1. 融合 $\Delta, B, C$ 投影与 SSM 扫描为一个 kernel。
2. 状态存于 shared memory 或寄存器，避免 HBM 访问。
3. 利用对角 $A$ 的并行性，每个 thread 处理一个状态维度。
4. 用 CUDA `__half2` 等 SIMD 指令加速半精度。

## 三、形式化与数学基础
$h_t = \exp(\Delta_t A) h_{t-1} + \Delta_t B_t x_t$ 的递推在 GPU 上用 thread block 并行：每个 block 处理一段序列，状态在 block 内共享。

## 四、代码实现
```cuda
// 简化的 CUDA kernel 伪代码
__global__ void selective_scan_kernel(...) {
    extern __shared__ float state[];
    int tid = threadIdx.x;
    for (int t = block_start; t < block_end; t++) {
        state[tid] = expf(delta[t] * A[tid]) * state[tid] + 
                     delta[t] * B[t] * x[t];
        y[t] += state[tid] * C[t];
    }
}
```

## 五、与其他技术对比
- vs Mamba 朴素实现：快 5-10x。
- vs FlashAttention：均为硬件高效 kernel 代表。

## 六、常见误区
- kernel 优化与硬件架构强耦合。
- 状态维度太大会导致 shared memory 不够。

## 七、与开源书/权威来源对应
- state-spaces/mamba 仓库 `csrc/selective_scan/`。
- Tri Dao 博客关于 kernel 优化的经验。

## 八、面试题
- Mamba 训练为何需要 fused kernel？答：递推操作极多，不融合会受 HBM 带宽限制。

## 九、演进与趋势
朴素实现 → fused kernel → SSD 框架 → 与 FlashAttention 融合。

## 十、小结
硬件高效 kernel 是 Mamba 走向实用的关键，借鉴 FlashAttention 经验。
