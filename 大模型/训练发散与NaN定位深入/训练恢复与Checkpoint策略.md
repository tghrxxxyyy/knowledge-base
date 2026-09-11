# 训练恢复与Checkpoint策略

> 对应 microsoft/DeepSpeed 检查点文档与 pytorch/pytorch `torch.save`/`torch.load` 序列化机制。

## 一、背景与挑战

大模型预训练动辄数天到数周、数千张卡并行，任何一次硬件故障、网络抖动或数值发散都会中断整个任务。若没有可靠的检查点（checkpoint），一次 NaN 就可能让数万美元的算力付诸东流。

恢复的目标并不只是「把权重读回来」：真正的挑战在于让优化器动量、学习率调度、数据采样位置、随机数状态都与中断前严格对齐。任何一处丢失，都会让训练轨迹发生不可复现的断裂，表现为 loss 跳变或收敛变慢。

此外还有工程约束：检查点写盘本身会占用带宽与内存峰值，超大模型单份权重就能达到 TB 级，必须做分片与异步，否则保存动作会成为训练吞吐的瓶颈。

## 二、核心原理

检查点的本质是对「训练状态机」的一次快照。需要落盘的对象包括：

- 模型参数与缓冲区（`state_dict`），含 LayerNorm 统计量、旋转位置编码缓存等；
- 优化器状态，如 Adam 的一阶矩、二阶矩与 step 计数；
- 学习率调度器状态，保证 warmup/decay 曲线连续；
- 数据加载器与采样器状态，保证 epoch 内不重复、不遗漏样本；
- 全局 RNG 状态（Python、NumPy、CUDA 各自独立）；
- 混合精度 `GradScaler` 的 scale 值；
- 全局步数、epoch 号与梯度累积计数。

恢复策略上，通常回滚到「最后一个 loss 有限的检查点」，而不是最近的检查点——因为最近的可能是已发散的脏快照。工程上要求写入原子化：先写临时文件再 `rename`，避免进程中断留下半截文件。

## 三、形式化与数学基础

将检查点记为元组 $C = \{\theta, m, v, t, R_{py}, R_{np}, R_{cuda}, s, S_{sampler}, \text{scaler}\}$：$\theta$ 为参数，$m,v$ 为 Adam 动量，$t$ 为步数，$R_*$ 为各框架随机状态。恢复即状态回填：

$$
\theta \leftarrow C.\theta,\quad m \leftarrow C.m,\quad v \leftarrow C.v,\quad t \leftarrow C.t
$$

健康检查点取反序搜索的首个有限点：

$$
C^\* = \arg\max_{C_k}\ \{\, k \mid \text{isfinite}(C_k.\text{loss}) \land \lnot\text{isnan}(C_k.\theta) \,\}
$$

若跳过优化器状态，偏差修正 $\hat{m}_t = m_t/(1-\beta_1^{t})$ 会因 $t \leftarrow 0$ 而失真——这正是「只存权重」破坏训练轨迹的数学原因。

## 四、代码实现

```python
# 保存：完整训练状态，先写临时文件再原子替换
import os, torch, random, numpy as np

def save_ckpt(path, model, opt, sched, step, scaler=None):
    ckpt = {
        "model": model.state_dict(),
        "opt": opt.state_dict(),
        "sched": sched.state_dict(),
        "step": step,
        "py_rng": random.getstate(),
        "np_rng": np.random.get_state(),
        "cuda_rng": torch.cuda.get_rng_state_all(),
        "scaler": scaler.state_dict() if scaler else None,
    }
    tmp = path + ".tmp"
    torch.save(ckpt, tmp)          # 落盘
    os.replace(tmp, path)          # 原子替换，防半写

def load_ckpt(path, model, opt, sched, scaler=None):
    ck = torch.load(path, map_location="cpu")
    model.load_state_dict(ck["model"])
    opt.load_state_dict(ck["opt"])
    sched.load_state_dict(ck["sched"])
    if scaler and ck["scaler"]:
        scaler.load_state_dict(ck["scaler"])
    random.setstate(ck["py_rng"])
    np.random.set_state(ck["np_rng"])
    torch.cuda.set_rng_state_all(ck["cuda_rng"])
    return ck["step"]              # 从该步继续训练
```

对超大模型，优先使用框架原生分片检查点（如 DeepSpeed `save_checkpoint` 或 PyTorch DCP），它们能把保存并行化到各 rank，并以分层目录组织 `zero_pp_rank_*` 分片，恢复时再自动聚合。

## 五、与其他技术对比

| 方案 | 保存粒度 | 恢复精度 | 适用规模 | 主要代价 |
| --- | --- | --- | --- | --- |
| 单卡 `torch.save` | 全量单体文件 | 完整状态 | 中小模型/微调 | 内存峰值高、写盘慢 |
| DeepSpeed ZeRO 分片检查点 | 按 rank 分片 | 完整状态 | 十亿级以上 | 目录复杂、需同拓扑恢复 |
| PyTorch FSDP/DCP | 分片 + 异步 | 完整状态 | 大规模 | 配置复杂 |
| 仅存 PEFT adapter | 只存增量权重 | 需配基座 | LoRA/QLoRA 微调 | 不可脱离基座模型 |
| 云对象存储直写 | 远端持久化 | 视实现 | 跨节点容灾 | 带宽与一致性开销 |

## 六、常见误区

- **只保存模型权重**：恢复后优化器动量与 step 归零，自适应估计冷启动，loss 会明显反弹。
- **忽略 RNG 与采样器状态**：数据顺序改变，训练不可复现，也难以与历史曲线对齐比较。
- **覆盖式直接写目标文件**：中断或磁盘满时留下损坏文件，把健康检查点也一并毁掉。
- **把「最近」当「最好」**：发散后的检查点可能已含 NaN，必须先校验再恢复。
- **忽视并行拓扑**：分片检查点与并行度、切分策略耦合，换卡数恢复需 reshape。
- **只在训练结束才存**：应设定期限（如每 N 步/每 T 分钟）与保留最近 K 份的轮转策略。

## 七、与开源书·权威来源对应

microsoft/DeepSpeed 官方文档的 Checkpointing 一节给出 ZeRO 分片检查点的目录与恢复流程；pytorch/pytorch 的 `torch.save`/`torch.load` 与 Distributed Checkpoint (DCP) 文档说明序列化与分片落盘语义；pytorch/pytorch 的优化器 `state_dict` 定义明确了需要持久化的状态字段。混合精度场景可参照 Micikevicius 2018《Mixed Precision Training》(arXiv:1710.03740) 对 scale 状态的讨论。具体参数名与目录结构以各框架官方最新文档为准。

## 八、面试题

- **问：恢复时为什么必须加载优化器状态？** 答：Adam 依赖 $m,v$ 与 step 计算偏差修正；缺失会导致更新量失真，训练轨迹断裂。
- **问：如何保证检查点写入的原子性？** 答：写临时文件后 `os.replace`/`rename`，利用文件系统原子重命名语义。
- **问：超大模型单文件保存的问题？** 答：内存峰值与写盘带宽成为瓶颈，且单点故障，应采用分片 + 异步保存。
- **问：如何挑选恢复点？** 答：反序扫描最近若干检查点，选第一个参数与 loss 均有限的点，必要时降 lr 重启。

## 九、演进与趋势

检查点技术正朝三个方向演进：一是**异步与增量**，训练侧继续计算、后台线程落盘，并只保存自上次以来的差异分片；二是**拓扑无关**，分布式检查点支持从不同并行度、不同卡数恢复，降低集群调度的约束；三是**存储分层**，高频本地 NVMe + 低频对象存储的冷热分离，兼顾恢复速度与持久性。此外，PEFT 微调场景流行只存 adapter 的轻量检查点，让单次快照从 TB 级降到 MB 级。

## 十、小结

检查点是应对训练发散与硬件故障的工程保险。其正确性取决于「快照是否完整」——优化器状态、调度器、采样器与随机状态一个都不能少；其可用性取决于「写入是否原子、分片是否可恢复」。把检查点当作训练状态机的完整镜像来设计，才能在长周期训练中既省算力又保持轨迹可复现。
