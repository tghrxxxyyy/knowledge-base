# 上下文与 KV Cache 管理

> 对应 ggerganov/llama.cpp; Ainslie 2023 GQA; Kwon 2023 vLLM。

## 一、背景与挑战
长上下文下 KV 占内存，llama.cpp 需在不依赖复杂分页时高效复用与裁剪。

## 二、核心原理
上下文以 slot 管理，支持多序列共享 KV、缓存复用（prompt 前缀缓存）与滑动窗口注意力限制长度，控制内存增长。

## 三、形式化与数学基础
KV 大小：
$ |KV| = 2 \cdot L \cdot n_{layers} \cdot n_{kv\_heads} \cdot d_{head} \cdot \text{prec} $
滑动窗口把 L 限制为窗口 w。

## 四、代码实现
```cpp
// 设置上下文长度与窗口
params.n_ctx = 4096;
params.n_ctx_max = 8192;          // 滑动窗口上限
llama_set_context(params);
```

## 五、与其他技术对比
vLLM 用分页精细管理；llama.cpp 用 slot/window 简化，适合端侧低并发。

## 六、常见误区
误区：上下文越长越好。端侧内存有限，需设窗口与上限。

## 七、与开源书/权威来源对应
llama.cpp 上下文管理；Ainslie 2023 GQA。见 ggerganov/llama.cpp。

## 八、面试题
问：llama.cpp 如何省 KV 内存？
答：滑动窗口、前缀缓存共享、GQA 减少头数。

## 九、演进与趋势
更精细的 KV 缓存与卸载（CPU）支持更长上下文。

## 十、小结
轻量级 KV 管理使端侧也能处理较长对话。
