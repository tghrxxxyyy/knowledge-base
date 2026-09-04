# llama-server 与并发

> 对应 ggerganov/llama.cpp; Kwon 2023 vLLM; Karpathy/llama2.c。

## 一、背景与挑战
本地需要多请求服务（如多客户端聊天），需 HTTP 服务与基本并发。

## 二、核心原理
llama-server 暴露 OpenAI 兼容接口，内部用连续批处理把并发请求合并推理，支持流式输出与多会话隔离。

## 三、形式化与数学基础
并发请求 {r_i} 动态组批，吞吐：
$ \text{throughput} \approx \frac{\sum \text{tokens}}{T_{wall}} $
受 n_ctx 与内存约束。

## 四、代码实现
```text
# 启动服务
./llama-server -m model-q4_k.gguf --host 0.0.0.0 --port 8080
# 客户端调用 OpenAI 风格接口
```

## 五、与其他技术对比
相比 vLLM 的工业级调度，llama-server 更轻，适合本地/小规模。

## 六、常见误区
误区：本地服务无需限流。多客户端仍应限制并发防内存爆。

## 七、与开源书/权威来源对应
llama.cpp server 文档。见 ggerganov/llama.cpp。

## 八、面试题
问：llama-server 兼容性价值？
答：OpenAI 接口兼容，便于现有工具无缝接入本地模型。

## 九、演进与趋势
逐步增强批处理与多模态支持。

## 十、小结
llama-server 把端侧引擎变成易用的本地 API 服务。
