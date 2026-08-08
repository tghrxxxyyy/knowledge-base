# Helm 与 Operator：云原生交付与扩展

> K8s 之上两大工程话题：**Helm**（把复杂应用打包成可重复安装的"安装包"）与 **Operator**（用自定义控制器把"运维知识代码化"）。前者解决**交付**，后者解决**有状态应用的生命周期管理**。与「[Kubernetes核心](Kubernetes核心.md)」「[GitOps](GitOps.md)」「[基础知识/CI-CD/08-云原生CI-CD与GitOps工具](../基础知识/CI-CD/08-云原生CI-CD与GitOps工具.md)」互链。

## 一、为什么需要 Helm

裸 YAML 的三大痛点：

1. **重复**：一个服务 Deployment+Service+ConfigMap+HPA 动辄 4-6 个文件，50 个服务就是 200+ 文件。
2. **环境差异**：dev/test/prod 的副本数、资源限制、镜像 tag 不同，复制粘贴会漂移。
3. **版本与回滚**：改了哪版、怎么回滚没有记录。

**Helm 的答案**：模板 + 参数 = 安装包（Chart），一次定义到处安装。

---

## 二、Helm 核心概念

| 概念 | 说明 |
|------|------|
| **Chart** | 应用打包单元：模板 + values + 元数据，目录结构 |
| **Release** | Chart 的一次安装实例（同名同 Chart 可装多份） |
| **values.yaml** | 默认参数；`-f` / `--set` 覆盖 |
| **模板** | Go template，`{{ .Values.replicas }}` |
| **仓库** | Chart 托管（OCI Registry / Helm 仓库） |

```text
mychart/
├── Chart.yaml          # 元数据（name/version/appVersion）
├── values.yaml         # 默认参数
├── templates/
│   ├── deployment.yaml # Go template 模板
│   ├── service.yaml
│   └── _helpers.tpl    # 公共命名函数
└── charts/             # 子依赖 Chart
```

```yaml
# templates/deployment.yaml（模板节选）
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "mychart.fullname" . }}
spec:
  replicas: {{ .Values.replicas }}
  template:
    spec:
      containers:
        - name: app
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          resources:
            requests:
              cpu: {{ .Values.resources.requests.cpu }}
```

```bash
helm install myapp ./mychart -f values-prod.yaml   # 安装
helm upgrade myapp ./mychart --set image.tag=v2    # 升级（可回滚）
helm rollback myapp 1                               # 回滚到 rev 1
helm uninstall myapp
```

> 口诀：**"Chart 是源码，values 是配置，Release 是运行实例；upgrade 留痕，rollback 兜底。"**

---

## 三、Helm 工程实践

| 实践 | 说明 |
|------|------|
| 多环境 values | `values-dev.yaml / values-prod.yaml`，公共放默认，差异放环境文件 |
| 版本管理 | Chart.yaml `version` 与应用 `appVersion` 分开；Chart 入库（ArtifactHub/OCI） |
| 命名空间隔离 | 每个环境独立 namespace，Release 名加环境前缀 |
| 配置脱敏 | 密钥走 `values` 的 `secret` 引用或 External Secrets，**不落 Chart 仓库** |
| Hook 与校验 | `helm lint`、`helm template` 渲染检查、安装前 hook 做依赖检查 |
| CI 集成 | 流水线里 `helm package + helm push`，CD 里 `helm upgrade --install`（配合 GitOps） |

> ⚠️ 常见坑：① `helm upgrade` 默认不删旧资源，删字段要 `--set` 显式处理或用 `helm diff`；② 模板里写死环境导致 Chart 不可复用；③ 密钥明文进 values 仓库。

---

## 四、Operator：把运维逻辑代码化

### 4.1 什么是 Operator

- K8s 是**声明式**的：你声明期望状态（Spec），controller 负责调到期望状态（Status）。
- K8s 内置控制器管 Deployment/StatefulSet 等；但**有状态应用**（数据库/消息队列/缓存）的运维知识（备份、扩缩容、故障切换、升级）K8s 不知道。
- **Operator = CRD（自定义资源）+ Controller（业务控制器）**：把"人类运维专家的知识"变成代码，持续调谐。

### 4.2 核心机制

```mermaid
flowchart LR
    YAML[用户声明 CustomResource<br/>kind: RedisCluster, spec: 3主3从] --> API[K8s API Server]
    API --> CRD[CRD 定义与校验]
    CRD --> CTRL[Operator Controller<br/>Reconcile 循环]
    CTRL --> RES[创建/调谐子资源<br/>StatefulSet/ConfigMap/PVC/Backup Job]
    RES --> STATUS[回写 status.conditions]
    STATUS --> CTRL
```

```yaml
# 用户声明（CR 实例）
apiVersion: redis.example.com/v1
kind: RedisCluster
metadata:
  name: cache-prod
spec:
  replicas: 3
  slavesPerMaster: 1
  storage: 100Gi
  backup:
    schedule: "0 2 * * *"
```

```go
// Controller 核心：Reconcile 循环（简化示意）
func (r *RedisClusterReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    cr := &redisv1.RedisCluster{}
    r.Get(ctx, req.NamespacedName, cr)          // 1. 读期望状态
    // 2. 比对现状：StatefulSet 副本数对吗？PVC 存在吗？备份 Job 建了吗？
    // 3. 差异部分 Create/Update/Delete 调谐
    // 4. 回写 status：ready replicas、phase、last backup time
    return ctrl.Result{RequeueAfter: 30 * time.Second}, nil
}
```

- **Controller-runtime（operator-sdk / Kubebuilder 生成）**：脚手架 + Webhook（CRD 校验/默认值）+ 多版本 CRD。
- **调谐循环**：事件触发 + 定时 Requeue，幂等执行，保证"Spec 一致即成功"。
- **Level-Triggered（状态对齐）vs Edge-Triggered（事件流）**：Operator 是前者，掉了事件也不怕——定期重新比对。

### 4.3 Operator 能干什么（典型能力清单）

| 能力 | 例子 |
|------|------|
| 自动化运维 | 扩缩容（改 CR 副本数自动调 StatefulSet）、重启、滚动升级 |
| 备份恢复 | 定时备份 Job + 对象存储 + 一键恢复 CR |
| 故障自愈 | 检测主节点故障 → 自动选主/重建副本 → 更新 Status |
| 版本升级 | 灰度升级引擎版本（先备后主） |
| 安全加固 | 自动轮换证书/密码 |
| 资源管理 | 根据压力自动扩缩副本（与 HPA 互补） |

> 口诀：**"Helm 管安装，Operator 管运行；CR 是愿望，Reconcile 是行动。"**

---

## 五、Helm vs Operator 怎么选

| 维度 | Helm | Operator |
|------|------|----------|
| 解决什么 | 安装/升级/回滚的**打包交付** | 长期**生命周期运维**（备份/自愈/升级） |
| 状态管理 | 无状态感知，不管运行后的事 | 持续调谐期望状态 |
| 复杂度 | 低，模板即学即用 | 高，需写 Go/控制器 + CRD |
| 适用 | 无状态服务、标准中间件的部署 | 数据库/消息/缓存等**有状态关键应用** |
| 组合用法 | Operator 的安装本身常用 Helm 分发 | Helm chart 里嵌 CR 声明触发 Operator 管理 |

- **经验法则**：先 Helm 解决"能装、能升、能回滚"；当应用需要"备份/自愈/升级策略"且是有状态关键依赖时，再上 Operator。
- 成熟 Operator 生态：etcd-operator、ZooKeeper-operator（Kafka 用 Strimzi）、MySQL 用 Percona Operator / Vitess、Redis 用 redis-operator、Prometheus 用 prometheus-operator（CRD 是 Prometheus/ServiceMonitor）。

---

## 六、与相关主题的关联

- 「[Kubernetes核心](Kubernetes核心.md)」：控制器调谐循环、CRD、StatefulSet 的机制底座。
- 「[GitOps](GitOps.md)」：Helm 是 Argo CD/Flux 的常用交付载体（Chart 即代码）。
- 「[基础知识/CI-CD/08-云原生CI-CD与GitOps工具](../基础知识/CI-CD/08-云原生CI-CD与GitOps工具.md)」：Helm 在流水线中的打包与发布。
- 「[SRE与稳定性工程/05-变更管理与渐进式发布](../SRE与稳定性工程/05-变更管理与渐进式发布.md)」：Operator 化后的升级策略与发布纪律。

---

## 面试高频问题（12+ 条）

1. **Helm 是什么？解决什么问题？** K8s 应用包管理：模板+参数打包 Chart，解决 YAML 重复、环境差异、版本回滚。
2. **Chart / Release / values 的关系？** Chart 是模板定义，values 是参数，Release 是安装实例（同 Chart 可多 Release）。
3. **helm upgrade 和 helm install 区别？** install 新建 Release，upgrade 原地升级（可 `--atomic` 失败回滚）。
4. **回滚怎么做？** `helm rollback <release> <revision>`，升级历史保存在集群 secret 里。
5. **Helm 模板里怎么处理环境差异？** 多 values 文件 + 参数覆盖，公共逻辑放 `_helpers.tpl`。
6. **Operator 和 Helm 的区别？** Helm 管交付（装/升/回滚），Operator 管运行（备份/自愈/升级策略）。
7. **CRD 是什么？** Custom Resource Definition，扩展 K8s API 的自定义资源类型，带 OpenAPI 校验。
8. **Reconcile 循环是什么？** Controller 持续比对期望状态（Spec）与实际状态，差异调谐、幂等执行，定期 Requeue。
9. **为什么有状态应用需要 Operator？** 状态、备份、故障切换等运维知识内建于 K8s 之外，Operator 把它代码化、声明化。
10. **Operator 如何实现自动备份？** 定时 Requeue 检查备份计划 CR，到点创建 Backup Job（CronJob 或直接建 Job）。
11. **调谐循环丢了事件怎么办？** 没关系：RequeueAfter 定期全量比对（Level-Triggered），最终一致。
12. **Webhook 在 Operator 里干嘛？** ValidatingWebhook 校验 CR 参数、MutatingWebhook 填默认值，保证进集群的数据合规。
13. **什么时候不该用 Operator？** 无状态服务、标准 K8s 工作负载（Deployment 就够）、团队无 Go/控制器经验。
14. **prometheus-operator 是啥？** 用 CRD（Prometheus/ServiceMonitor/Alertmanager）声明监控目标，Controller 生成配置并管理实例。
15. **Helm 密钥怎么管理？** values 不存密钥，用 External Secrets/Sealed Secrets/Vault 注入，仓库保持干净。

---

[← 返回云原生索引](README.md)
