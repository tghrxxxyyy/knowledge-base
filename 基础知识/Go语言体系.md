# Go 语言体系（后端生态 / 并发模型 / 工程实践）

> Go 是**云原生时代的后端主力语言**：Kubernetes/Docker/Prometheus/etcd/Terraform 全部用 Go 写成。核心价值：**编译型静态语言 + goroutine 并发 + 垃圾回收 + 丰富的云原生生态**。本篇按「Go vs Java → 并发模型 → 标准库 → 工程实践」拆解。

---

## 一、Go vs Java 后端对比

| 维度 | Go | Java |
|------|-----|------|
| 类型系统 | 静态、强类型、无继承（组合） | 静态、强类型、继承+多态 |
| 并发 | goroutine（轻量级协程） | 线程（重量级） |
| 性能 | 编译型，接近 C | JIT 编译，热启动后快 |
| 内存 | GC（低延迟） | GC（多种可选） |
| 包管理 | Go Modules（原生） | Maven/Gradle |
| 云原生生态 | 最强（K8s/Docker/Prometheus） | 强（Spring Cloud） |
| 学习曲线 | 低（25 个关键字） | 高（泛型+注解+框架） |
| 适用 | 云原生基础设施/微服务/CLI | 企业级业务系统 |

---

## 二、goroutine 并发模型

### 2.1 核心机制

```
goroutine = 用户态协程（GMP 模型）

G（Goroutine）：用户态协程，初始栈 2KB（可动态增长）
M（Machine）：OS 线程（真正执行的线程）
P（Processor）：逻辑处理器（持有本地 goroutine 队列）

调度：
  P 从本地队列取 G → 绑定 M 执行
  本地队列空 → 从全局队列偷取（work stealing）
  M 阻塞（syscall）→ P 与 M 解绑 → P 找新 M 继续执行
```

### 2.2 常用并发原语

```go
// goroutine 启动
go func() { /* ... */ }()

// channel 通信
ch := make(chan int, 1)  // 有缓冲
ch <- value              // 发送
val := <-ch              // 接收
close(ch)                // 关闭

// select 多路复用
select {
case v := <-ch1:
    // ...
case ch2 <- value:
    // ...
default:
    // 非阻塞
}

// sync 包
var mu sync.Mutex
mu.Lock()
defer mu.Unlock()

var wg sync.WaitGroup
wg.Add(1)
go func() {
    defer wg.Done()
    // ...
}()
wg.Wait()

// sync.Map（并发安全 map）
var m sync.Map
m.Store("key", "value")
v, ok := m.Load("key")
```

### 2.3 并发模式

| 模式 | 说明 |
|------|------|
| Fan-out/Fan-in | 多个 goroutine 产出，一个汇聚 |
| Pipeline | 多阶段处理，channel 串联 |
| Worker Pool | 固定数量 worker，任务通过 channel 分发 |
| Context | 超时/取消控制（ctx.Done()） |
| errgroup | 多 goroutine 并发 + 统一错误处理 |

---

## 三、标准库精选

| 包 | 用途 |
|------|------|
| `net/http` | HTTP 服务/客户端（生产级） |
| `encoding/json` | JSON 序列化 |
| `database/sql` | 数据库驱动（MySQL/PG） |
| `context` | 超时/取消/传值 |
| `sync` | Mutex/WaitGroup/Once/Map |
| `log/slog` | 结构化日志（Go 1.21+） |
| `testing` | 单元测试 + 基准测试 |
| `os/signal` | 优雅退出（信号处理） |

---

## 四、工程实践

### 4.1 项目结构

```
myproject/
  cmd/myapp/main.go    — 入口
  internal/             — 内部包（不对外暴露）
  pkg/                 — 可复用包
  api/                 — API 定义（proto/OpenAPI）
  configs/             — 配置文件
  scripts/             — 构建脚本
  go.mod               — 依赖定义
  go.sum               — 依赖校验
```

### 4.2 关键实践

| 实践 | 说明 |
|------|------|
| 错误处理 | `if err != nil { return err }`（显式错误，无异常） |
| 资源释放 | `defer f.Close()`（确保释放） |
| 优雅退出 | `signal.NotifyContext` + context 取消 |
| 测试 | `go test -race -cover`（竞态检测+覆盖率） |
| 性能分析 | `pprof`（CPU/内存/goroutine 分析） |
| 代码生成 | `go generate`（protobuf/mock 等） |

### 4.3 常见坑

- **goroutine 泄漏**：goroutine 阻塞未退出 → 用 context 控制生命周期
- **race condition**：并发读写 map → 用 sync.Map 或 Mutex
- **defer 性能**：大量 defer 在循环中 → 提取到函数
- **GC 停顿**：大内存对象频繁分配 → 对象池（sync.Pool）
- **错误忽略**：`_ = err`（静默吞错）→ 始终处理错误

---

## 五、Go 云原生生态

| 项目 | 说明 |
|------|------|
| Kubernetes | 容器编排 |
| Docker/Moby | 容器运行时 |
| Prometheus | 监控 |
| etcd | 分布式 KV |
| Terraform | IaC |
| Istio | Service Mesh |
| gRPC-Go | RPC 框架 |
| Gin/Echo/Fiber | HTTP 框架 |

---

## 六、与其他板块的关系

- etcd 源码见「[etcd 源码](../源码系列/etcd源码.md)」；
- Kubernetes 见「[Kubernetes 核心](../云原生/Kubernetes核心.md)」；
- gRPC 见「[gRPC](../基础知识/中间件/gRPC.md)」；
- 并发编程（Java）见「[并发编程](../基础知识/并发编程.md)」。

> 一句话：**Go = goroutine（轻量并发）+ channel（通信）+ 标准库（net/http 原生生产级）+ 云原生生态最强——学习从 goroutine/channel/context 三板斧入手，工程从 go mod + testing + pprof 入手**。
