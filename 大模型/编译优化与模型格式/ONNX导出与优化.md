# ONNX 导出与优化

> 对应 ONNX 官方仓库（https://github.com/onnx/onnx）、ONNX Runtime（https://github.com/microsoft/onnxruntime）、PyTorch `torch.onnx.export` 文档（https://pytorch.org/docs/stable/onnx.html）、microsoft/Olive 优化器（https://github.com/microsoft/Olive）、NVIDIA TensorRT 文档（https://docs.nvidia.com/deeplearning/tensorrt/developer-guide/）；并见本库「编译优化与模型格式/模型格式对比」「编译优化与模型格式/推理引擎TensorRT」篇章。

## 一、背景与挑战

训练框架（PyTorch）与部署环境往往解耦：同一模型要跑在 CPU、CUDA、TensorRT、移动端或服务网格里，若每个后端都重新写一遍推理代码，算子语义、数值精度与优化机会都会漂移。ONNX 的定位是中间表示（IR）：用统一的计算图（节点 + 张量边 + 算子域版本）描述前向过程，由各家 Runtime 各自编译执行。挑战集中在四点：其一，PyTorch 是动态图，导出需要追踪（trace）或脚本化（script）出静态图，控制流与数据依赖分支处理不当就会导错；其二，模型里的自定义算子、动态 shape、inplace 操作常常超出 ONNX 算子集（opset）覆盖范围；其三，导出成功的图往往"能跑但不快"——缺少算子融合、常量未折叠、布局频繁转换；其四，不同 Runtime 对同一图的支持度与优化深度不同，需要以基准测试而不是宣传页来选型。对大模型还叠加一层：权重动辄百 GB，导出只是第一步，量化、算子替换（如 Attention 融合）与 KV Cache 结构才是性能关键。

## 二、核心原理

### 2.1 导出流程

`torch.onnx.export` 的本质是用一组示例输入（dummy input）执行模型，记录算子调用序列，映射为 ONNX 节点。流程为：准备处于 eval 模式、关闭 dropout 的模型 → 构造代表真实形状的 dummy 输入 → 指定 opset 版本与输出文件 → 声明 `dynamic_axes`（或用 `torch.onnx.dynamo_export` / `torch.onnx.export(..., dynamo=True)` 的新路径）→ 用 `onnx.checker` 校验 → 必要时 `onnx.shape_inference` 补全中间张量形状。老路径基于 TorchScript tracer，遇到数据依赖的控制流（`if x.sum() > 0`）会只追踪一条分支，必须改写为 `torch.where`、`torch.cond` 或用 dynamo 导出路径。

### 2.2 动态轴与形状

静态 shape 便于极致优化（可预分配、可自动融合），但对话类负载序列长度天然可变。`dynamic_axes={"input_ids": {0: "batch", 1: "seq"}}` 把指定维标记为符号维，Runtime 按实际形状特化或走通用 kernel。取舍是：符号维越多越灵活，优化空间越小，且很多融合依赖静态断言。

### 2.3 算子兼容与自定义

导出报错常见于算子不支持或版本不匹配（`Unsupported: ONNX export failed on op X`）。解决路径按优先级：升级/降级 opset 使算子映射可用；用 `torch.onnx.register_custom_op_library` 或 custom symbolic function 提供该算子的 ONNX 表示；把不支持的子图换写成受支持的等价实现（如用矩阵乘 + softmax 手写 attention 旧实现）；最后才考虑拆图。导出后还可用 `onnxoptimizer` 与 Runtime 自带的图优化 pass 做等价改写。

### 2.4 图优化：常量折叠与算子融合

图优化分三层。基础层：常量折叠（编译期算出静态子表达式）、死节点消除、算子简化（`Conv+BN` 折进卷积权重）。融合层：`Conv+Add+ReLU` 融成一个 kernel，`MatMul+Add` 融成 GEMM，`Softmax/Mask/GEMM` 在大模型中融成 Attention 节点——融合直接减少 kernel 启动次数与显存往返，对访存瓶颈的 LLM 收益显著。布局层：NCHW/NHWC 转换下推。ONNX Runtime 把这些做成 `GraphOptimizationLevel`（`ORT_ENABLE_BASIC` → `EXTENDED` → `ALL`），TensorRT 则把融合与 layer fusion 作为 builder 的核心工作。

### 2.5 量化

量化把 FP32/FP16 权重与激活压到 INT8/INT4：训练后量化（PTQ）只需校准集，按张量/通道粒度与对称/非对称 scheme 选阈值，适合权重为主的大模型；量化感知训练（QAT）在训练中插入伪量化节点，精度更稳但成本高。LLM 场景主流是权重 INT4/INT8 + 激活 FP16 的混合精度（GPTQ、AWQ 等算法），并配合 per-group 量化与保留在高精度的敏感层。

### 2.6 Runtime 对照

ONNX Runtime 通用、跨厂商、CPU/GPU 均可，图优化与量化工具链完整（`onnxruntime.quantization`、DML/CUDA EP）；TensorRT 仅限 NVIDIA，builder 会按目标 GPU 与序列长度做 kernel 自动调优（autotuning）与更强融合，通常延迟更低，但构建慢、平台绑定。实践上用 ONNX Runtime 保证可移植与快速验证，用 TensorRT 做生产端的极致优化。

## 三、形式化与数学基础

ONNX 图可形式化为 $G = (V, E, \tau, \mathcal{O})$：节点集合 $V$（每个 $v \in V$ 带算子类型 $o_v \in \mathcal{O}$）、张量边 $E$、形状/类型映射 $\tau$。导出即寻找同态映射 $\phi: G_{PyTorch} \to G_{ONNX}$，使对所有合法输入 $x$ 有 $f_{PyTorch}(x) \approx f_{ONNX}(\phi(x))$，误差仅来自追踪近似与精度截断。动态轴把 $\tau$ 中若干维从常数换成符号变量 $s_i$，可行输入域变为 $\prod_i [1, s_i^{max}]$ 上的整数格点。

常量折叠是对无输入依赖的子图 $S \subseteq V$ 预先求值，将 $S$ 替换为常量节点，代价从运行时 $O(|S|)$ 降为 $O(1)$。算子融合是把模式 $\{v_1, \dots, v_k\}$ 重写为单一节点 $v'$，需满足等价性 $f_{v'} = f_{v_k} \circ \cdots \circ f_{v_1}$；其收益可用 kernel 启动开销模型估计：若单次启动成本为 $\alpha$、各节点计算量为 $\beta_i$，融合前延迟 $\sum_i (\alpha + \beta_i)$，融合后约 $\alpha + \sum_i \beta_i$，节省 $(k-1)\alpha$ 与中间张量的显存读写（后者往往是主导项）。

量化的仿射映射为 $q = \mathrm{clamp}\big(\mathrm{round}(x / S) + Z,\ q_{min},\ q_{max}\big)$，反量化 $\hat{x} = S(q - Z)$，其中 scale $S = \frac{x_{max} - x_{min}}{q_{max} - q_{min}}$，零点 $Z$ 对称时取 0。PTQ 的校准目标是选 $S$ 最小化期望量化误差，常用 max、percentile 或 KL 散度准则。权重按通道/组量化时每个 $S$ 独立，公式中的 $S$ 变为张量 $S_{c,g}$。

## 四、代码实现

```python
import torch
import onnx
from onnxruntime.transformers import optimizer as ort_optimizer  # 图融合入口

class ToyModel(torch.nn.Module):
    def __init__(self, d=64):
        super().__init__()
        self.fc = torch.nn.Linear(d, d)
        self.act = torch.nn.ReLU()

    def forward(self, x, mask=None):
        # 用 torch.where 而非数据依赖 if：tracer 无法追踪控制流
        y = self.fc(x)
        if mask is not None:
            y = y * mask
        return self.act(y)

model = ToyModel().eval()  # eval 关闭 dropout，保证导出图确定性
dummy = torch.randn(1, 128, 64)

torch.onnx.export(
    model,
    (dummy, torch.ones(1, 128, 1)),       # 元组：位置参数依次对应 forward
    "model.onnx",
    input_names=["input_ids", "mask"],    # 命名输入，便于 Runtime 绑定
    output_names=["logits"],
    dynamic_axes={                        # 动态轴：batch 与 seq 随负载变化
        "input_ids": {0: "batch", 1: "seq"},
        "mask": {0: "batch", 1: "seq"},
        "logits": {0: "batch", 1: "seq"},
    },
    opset_version=17,                     # 按目标 Runtime 支持的 opset 选择
    do_constant_folding=True,             # 导出期即做常量折叠
)

# 校验 + 形状推断，尽早暴露非法图
m = onnx.load("model.onnx")
onnx.checker.check_model(m)
m = onnx.shape_inference.infer_shapes(m)
onnx.save(m, "model.onnx")

# 运行期再开满图优化（视 provider 不同自动选择融合 pass）
import onnxruntime as ort
so = ort.SessionOptions()
so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
sess = ort.InferenceSession("model.onnx", so, providers=["CUDAExecutionProvider"])

# PTQ 量化：校准集必须来自真实分布，否则阈值失真
from onnxruntime.quantization import quantize_dynamic, QuantType
quantize_dynamic("model.onnx", "model_int8.onnx", weight_type=QuantType.QInt8)
```

```python
# 退避重试式导出校验：对比 PyTorch 与 ONNX 输出，误差超阈值即回退
import numpy as np
with torch.no_grad():
    ref = model(dummy, torch.ones(1, 128, 1)).numpy()
got = sess.run(None, {"input_ids": dummy.numpy(), "mask": np.ones((1, 128, 1), np.float32)})[0]
assert np.allclose(ref, got, atol=1e-4), "导出图与原模型数值不一致，检查算子映射"
```

## 五、与其他技术对比

| 维度 | PyTorch eager | ONNX + ONNX Runtime | TensorRT | TorchInductor/TensorRT 后端 |
| --- | --- | --- | --- | --- |
| 图表示 | 动态图 | 静态 ONNX 图 | 静态 layer 网络 | FX 图 → Triton/CUDA |
| 可移植性 | 高（需带框架） | 高（多厂商 EP） | 仅 NVIDIA | 随 PyTorch |
| 优化深度 | 无/微内核级 | 常量折叠 + 融合 | 深度融合 + autotune | 编译期融合 |
| 动态 shape | 原生支持 | 动态轴，优化略降 | 支持但按 profile 特化 | 较灵活 |
| 量化 | 需外部工具 | 内置 PTQ/QAT 工具 | 原生 INT8/FP8 | 间接支持 |
| 导出成本 | 无 | 秒到分钟级 | 分钟到小时（build） | 即时编译 |
| 适用场景 | 研究/调试 | 跨平台生产推理 | NVIDIA 延迟敏感 | 与训练栈统一 |

| 优化手段 | 解决的问题 | 典型收益 |
| --- | --- | --- |
| 常量折叠 | 运行期重复算静态值 | 启动更快，图更小 |
| 算子融合 | kernel 启动与中间张量读写 | 访存瓶颈场景 10%–40% |
| 布局优化 | 内存格式转换浪费 | 卷积视觉模型显著 |
| PTQ 动态量化 | 权重体积与带宽 | CPU 推理 2–4 倍，精度小幅损失 |
| INT4 权重量化 | LLM 显存容量 | 数倍显存下降，需 GPTQ/AWQ 类算法保精度 |

## 六、常见误区

1. **导出即加速**——ONNX 只是交换格式；不开启图优化、不融合、不量化，速度可能与 eager 持平甚至更慢。
2. **dummy 输入随便给**——示例张量的形状与数值范围会参与追踪与常量折叠，形状不具代表性会导致动态轴声明缺失或 shape 推断失败。
3. **动态轴越多越好**——符号维压制 kernel 特化与融合，静态 shape 的部署通常更快；只在真实需要变长时声明。
4. **忽略了 eval 模式与 trace 陷阱**——导出前必须 `model.eval()`，且数据依赖的 `if`/循环只记录一条路径，造成静默的错误图。
5. **opset 越新越好**——目标 Runtime（尤其嵌入式或旧版 TensorRT）未必支持最新 opset，需以部署环境支持矩阵为准。
6. **校准集用随机噪声做 PTQ**——激活分布与真实数据严重不符，量化阈值失真，精度崩塌；校准集必须采样自生产分布且覆盖长度变化。
7. **跨 Runtime 不做数值对账**——融合与精度截断可能引入偏差，上线前必须对 ONNX Runtime/TensorRT 输出与原框架做 `allclose` 比对。

## 七、与开源书·权威来源对应

- ONNX 规范与算子库（opset 与 IR 版本定义）：https://github.com/onnx/onnx
- ONNX Runtime 图优化等级与量化工具：https://github.com/microsoft/onnxruntime
- PyTorch 官方 ONNX 导出教程（含动态轴与 custom op）：https://pytorch.org/docs/stable/onnx.html
- microsoft/Olive：面向 LLM 的端到端模型优化流程（pass 编排、量化、搜索）：https://github.com/microsoft/Olive
- TensorRT 开发者指南（builder、profile、layer fusion、INT8 校准）：https://docs.nvidia.com/deeplearning/tensorrt/developer-guide/
- 本库对应篇章：「编译优化与模型格式/模型格式对比」「编译优化与模型格式/推理引擎TensorRT」「推理服务深入/量化推理」

## 八、面试题

1. **ONNX 导出的基本流程与导出前的模型准备？**
   要点：`eval()`、关闭梯度、构造代表性 dummy 输入、声明动态轴与 opset、`onnx.checker` 校验、数值对账。
2. **动态轴是什么代价？什么时候必须声明？**
   要点：符号维换取变长灵活性，代价是 Runtime 特化空间与融合机会下降；对话/批处理序列长度可变时必须声明 batch 与 seq。
3. **模型导出时某个算子报不支持，你的排查顺序？**
   要点：查 opset 覆盖 → 换写等价受支持实现 → 注册 custom symbolic → 拆分子图；同时确认不是控制流追踪问题。
4. **图优化中的常量折叠与算子融合分别解决什么问题？为什么 LLM 尤其吃融合？**
   要点：折叠消除运行期静态计算；融合减少 kernel 启动与中间张量访存。LLM 是访存瓶颈，`MatMul+Softmax+Mask` 融合可显著降延迟。
5. **ONNX Runtime 与 TensorRT 怎么选？**
   要点：跨平台、快速迭代用 ORT；NVIDIA 固定硬件、延迟敏感用 TensorRT，接受更长 build 时间与平台绑定。
6. **PTQ 和 QAT 的区别？LLM 常用哪种？**
   要点：PTQ 只需校准、成本低，QAT 需训练但更保精度；LLM 主流是 PTQ 路线的 INT4/INT8 权重量化（GPTQ/AWQ）配合混合精度保留敏感层。

## 九、演进与趋势

ONNX 经历了从 tracer 导出到 `torch dynamo` 导出（基于编译器中间表示，控制流更忠实）的换代；优化侧从手写 pass 走向 Olive 这类"搜索 + 评估"的自动优化编排。量化从整数 PTQ 演进到面向 LLM 的分组 INT4、AWQ/GPTQ，以及 FP8 在新架构 GPU 上的原生支持。Runtime 层面，TensorRT 的执行计划缓存与 shape 相关 autotune 越来越精细，多 Runtime 并存时往往以 ONNX 为事实交换层、以专用引擎为生产路径；同时 torch.compile、TensorRT 后端与 ONNX 在同一编译栈内融合，边界正逐渐模糊。

## 十、小结

ONNX 导出与优化是一条"表示—校验—优化—量化—选型"的流水线：用静态图与动态轴在灵活性和性能间取舍，用算子兼容策略消化 PyTorch 侧的动态特性，用常量折叠与算子融合吃掉访存与启动开销，用 PTQ/分组量化压缩显存与带宽，最后按可移植性与延迟目标在 ONNX Runtime 与 TensorRT 之间选型。两个不变的原则：导出后必须做数值对账，加速声明必须有基准测试支撑。
