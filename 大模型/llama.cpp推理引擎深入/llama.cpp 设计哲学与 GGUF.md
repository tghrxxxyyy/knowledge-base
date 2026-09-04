# llama.cpp 设计哲学与 GGUF

> 对应 ggerganov/llama.cpp; Touvron 2023 LLaMA; Karpathy/nanoGPT。

## 一、背景与挑战
在笔记本、手机等无强 GPU 设备上跑 LLM，需要纯 C/C++、无依赖、可量化、跨后端的推理。

## 二、核心原理
llama.cpp 用 C++ 实现 Transformer，零外部依赖；模型以 GGUF 格式存储（含元数据、张量、量化类型），支持 mmap 内存映射加载。

## 三、形式化与数学基础
注意力与标准一致：
$ \text{Attn}(Q,K,V)=\text{softmax}(QK^\top/\sqrt{d})V $
GGUF 把张量按量化类型打包，加载时映射到权值域。

## 四、代码实现
```cpp
// 加载 GGUF 并推理（示意）
auto model = llama_load_model_from_file("model.gguf");
auto ctx = llama_new_context_with_model(model, params);
llama_decode(ctx, batch);              // 逐步解码
```

## 五、与其他技术对比
相比 PyTorch 栈，llama.cpp 体积小、启动快、可纯 CPU；缺点是高级特性（批调度）较慢迭代。

## 六、常见误区
误区：llama.cpp 只能 CPU。其支持 Metal/CUDA/Vulkan 等多种后端加速。

## 七、与开源书/权威来源对应
ggerganov/llama.cpp 仓库；Touvron 2023 LLaMA。见 ggerganov/llama.cpp。

## 八、面试题
问：GGUF 相比旧 GGML 改进？
答：更灵活元数据、多量化方案、可扩展，向后兼容。

## 九、演进与趋势
GGUF 成为本地量化模型事实标准，生态工具链丰富。

## 十、小结
llama.cpp 以极简 C++ 把 LLM 带到边缘，GGUF 是其模型载体。
