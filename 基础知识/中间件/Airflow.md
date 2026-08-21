# Apache Airflow（工作流编排 / Python DAG）

> Airflow 是 **Apache 顶级项目、全球最流行的工作流编排平台**（Airbnb 开源），核心思想「**工作流即代码（DAG 用 Python 定义）**」。相比 DolphinScheduler（可视化拖拽）、XXL-JOB（定时任务）、Temporal（微服务编排）、AWS Step Functions（云托管），Airflow 以「**Python 灵活最强 + 生态最广（Operator 无数）+ 调度语义完善（回填/依赖/传感器）**」成为数据工程/MLOps 领域事实标准。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 复杂依赖编排 | 任务间依赖（DAG）无法用 cron 表达 |
| 数据驱动触发 | 等文件/等表/等上游完成后才跑（传感器） |
| 历史回填 | 新任务要补跑历史 N 天数据 |
| 失败重试与告警 | 任务失败自动重试 + 多渠道告警 |
| 可测试可版本化 | 工作流要像代码一样 review/测试/版本管理 |
| 多租户隔离 | 不同团队的任务资源隔离、权限控制 |
| 跨平台集成 | 统一编排 Spark/Flink/dbt/云服务/自定义脚本 |

> 核心认知：**Airflow = 「工作流是 Python 代码（DAG）」**——每个工作流是声明式 Python 文件（DAG），调度器解析执行，天然可测试、可 Git 管理。

---

## 二、核心原理

### 2.1 架构

```
Scheduler（调度器，核心）
  ├── 扫描 DAG 目录（/dags）→ 解析 DAG 定义
  ├── 按调度时间戳生成 DagRun → TaskInstance（任务实例）
  └── 依赖满足（upstream 完成 + 传感器）→ 分发到 Executor

Executor（执行器）
  ├── LocalExecutor（单机多进程）
  ├── CeleryExecutor（分布式 Worker 队列）
  ├── KubernetesExecutor（每任务一个 Pod，动态）
  └── 云端：EKSExecutor / CloudRun 等

Worker（执行任务）→ 任务代码（Python/Bash/SQL/Spark...）
Webserver（UI：DAG 图/日志/触发/回填）
Metadata DB（DAG 运行状态持久化：PostgreSQL/MySQL）
Triggerer（异步触发器，处理 deferrable sensor）
```

### 2.2 DAG 定义（代码即工作流）

```python
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.bash import BashOperator
from datetime import datetime, timedelta

with DAG("etl_pipeline", schedule="0 2 * * *",
         start_date=datetime(2024, 1, 1),
         catchup=False,
         tags=["data", "etl"],
         default_args={
             "retries": 3,
             "retry_delay": timedelta(minutes=5),
             "on_failure_callback": alert_on_failure
         }) as dag:

    extract = BashOperator(task_id="extract", bash_command="python extract.py")
    transform = PythonOperator(task_id="transform", python_callable=transform_fn)
    load = BashOperator(task_id="load", bash_command="python load.py")

    extract >> transform >> load    # 依赖链
```

### 2.3 关键概念

| 概念 | 说明 |
|------|------|
| DAG | 工作流（Python 文件定义，一个文件一个 DAG） |
| Task / TaskInstance | 任务/任务实例（每次运行一个实例） |
| Operator | 任务类型（PythonOperator/BashOperator/SparkSubmitOperator...） |
| Sensor | 传感器任务（等外部条件：文件/表/API） |
| XCom | 任务间小数据传递（建议 < 48KB） |
| Pool / Priority | 资源池 + 优先级（并发控制） |
| Triggerer（2.2+） | 异步触发（deferrable operator，省资源） |
| Connection / Hook | 外部系统连接管理（数据库/API/云服务） |
| Variable | 全局变量（配置/密钥），敏感信息用 Secret Backend |
| Dataset（2.4+） | 数据感知调度（上游数据更新触发下游） |
| Listener（2.6+） | 生命周期监听器（自定义回调） |

### 2.4 调度语义（Airflow 的核心价值）

| 语义 | 说明 | 示例 |
|------|------|------|
| 回填（Backfill） | `airflow dags backfill -s 2024-01-01 -e 2024-01-31` 按日期补跑 | 历史数据修复 |
| catchup 追赶 | 启动时间早于 start_date 时自动补跑（默认关） | 新 DAG 上线补历史 |
| 调度时间语义 | `schedule` 表达式（cron/timedelta/自定义 Trigger） | 灵活调度频率 |
| 依赖触发 | `ExternalTaskSensor` 等外部 DAG 完成 | 跨 DAG 编排 |
| Dataset 触发 | 上游数据更新触发下游（2.4+） | 数据驱动编排 |
| Timetable | 自定义调度时间逻辑（如节假日跳过） | 非标准调度需求 |

### 2.5 执行器详解

| 执行器 | 并发模型 | 适用场景 | 资源效率 |
|--------|----------|----------|----------|
| SequentialExecutor | 单进程串行 | 开发测试 | 最低 |
| LocalExecutor | 多进程并发 | 小规模生产 | 中 |
| CeleryExecutor | 分布式 Worker 队列 | 中大规模生产 | 中 |
| KubernetesExecutor | 每任务一个 Pod | 云原生/弹性 | 最高（按需） |
| DaskExecutor | Dask 集群 | 科学计算 | 中 |

### 2.6 Operator 体系（生态核心）

```
BaseOperator
  ├── PythonOperator / PythonSensor / PythonBranchOperator
  ├── BashOperator / BashSensor
  ├── EmailOperator / HttpOperator / SimpleHttpOperator
  ├── 数据库：MySqlOperator / PostgresOperator / OracleOperator
  ├── 大数据：SparkSubmitOperator / HiveOperator / PrestoOperator
  ├── 云：S3ToRedshiftOperator / GCSObjectExistenceSensor
  ├── 消息：SlackWebhookOperator / EmailOperator
  └── 自定义：继承 BaseOperator，实现 execute() 方法
```

---

## 三、核心特性

| 特性 | 说明 |
|------|------|
| 代码即工作流 | Python 定义，可测试/可 review/可 Git 版本化 |
| 生态最广 | 1000+ Operator（云/DB/大数据/ML 全覆盖） |
| 调度语义完善 | 回填/追赶/传感器/Dataset 触发 |
| 分布式 | Celery/K8s 多执行器，弹性扩容 |
| UI | DAG 图/日志/触发/变量管理 |
| 告警 | 邮件/钉钉/Slack/Webhook（失败/重试/超时） |
| 数据血缘 | 内置 Datasets（2.4+ 数据感知调度） |
| MLOps | 原生支持 ML 管道（与 MLflow/Kubeflow 配合） |
| Secrets Backend | 敏感信息存储到 Vault/AWS Secrets Manager |
| Listener | 生命周期监听（自定义回调，2.6+） |
| TaskFlow API | XCom 语法糖（2.2+），函数返回自动推送到 XCom |

---

## 四、Airflow vs DolphinScheduler vs Temporal vs 云托管

| 维度 | Airflow | DolphinScheduler | Temporal | AWS Step Functions |
|------|---------|------------------|----------|--------------------|
| 定义方式 | Python 代码 | 可视化拖拽 | 代码（Go/Java/Python） | 声明式 JSON |
| 生态 | 最强（1000+ Operator） | 大数据任务多 | 微服务编排 | AWS 生态 |
| 调度语义 | 最强（回填/追赶/传感器/Dataset） | 中（补数/日历） | 中（工作流侧重） | 中 |
| 运维 | 重（组件多） | 中（ZK 依赖） | 中 | 零（托管） |
| 适用 | 数据工程/MLOps | 数据平台（中文团队） | 微服务长期运行 | 云上 Serverless |
| 学习成本 | 中（Python） | 低（可视化） | 高 | 低 |
| 容错 | 任务级重试/DAG 级重试 | 任务级重试 | Workflow 级重试 | 自动重试 |

**选型关注点**：
- 数据工程/MLOps/Python 团队 → **Airflow**（生态与灵活性最强）；
- 数据平台可视化编排/中文团队 → **DolphinScheduler**；
- 微服务长期运行/补偿编排 → **Temporal**；
- 云上快速交付 → **Step Functions / Cloud Composer（托管 Airflow）**。

---

## 五、生产实践

### 5.1 关键实践

| 实践 | 说明 |
|------|------|
| 部署 | 生产用 KubernetesExecutor 或 CeleryExecutor（弹性） |
| DB | 独立 PostgreSQL（Metadata DB 是核心依赖） |
| 任务幂等 | 任务必须幂等（重跑安全）——回填/重试的基础 |
| 并发控制 | Pool 按资源组限制（防打爆集群） |
| 变量/连接 | 敏感信息用 Airflow 加密变量 + Secret 后端 |
| 监控 | 调度器心跳 + 任务失败率 + DAG 运行时长告警 |
| 代码管理 | DAG 代码走 Git CI/CD（自动同步 /dags） |
| 日志 | 日志采集到 ELK/Loki（集中排查） |
| 测试 | DAG 文件可 pytest，Task 可单元测试 |
| 资源隔离 | 不同团队用独立 Pool + Vhost |

### 5.2 常见坑

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 调度器单点 | Scheduler 需要多副本 + 健康监控 | 多 Scheduler + Prometheus 监控心跳 |
| 任务写在 DAG 文件里 | DAG 文件只应定义结构 | 重逻辑放 Operator/代码目录 |
| 依赖不幂等 | 回填/重试产生脏数据 | 所有任务幂等化（INSERT ON DUPLICATE） |
| 时区/日历 | cron 与 start_date/catchup 语义易错 | 先本地测试，用 `execution_date` 而非 `now()` |
| 大 DAG 膨胀 | 几千任务的 DAG 解析慢 | 拆 DAG + 触发式编排（Dataset/ExternalTaskSensor） |
| XCom 溢出 | XCom 存储超过 48KB | 改用外部存储（S3/DB） |
| 序列化问题 | Python 特殊对象无法序列化 | 用 JSON-serializable 的 XCom Backend |

### 5.3 KubernetesExecutor 生产配置

```yaml
# airflow.cfg
[core]
executor = KubernetesExecutor
kubernetes_namespace = airflow

[kubernetes_worker]
resources:
  limits:
    memory: 2Gi
    cpu: "1"
  requests:
    memory: 1Gi
    cpu: "0.5"
image = my-airflow-worker:latest
delete_worker_pods = True
delete_worker_pods_on_failure = True

# Pod 模板（per-task 资源覆盖）
node_selector:
  node-role: data-worker
tolerations:
  - key: "data"
    operator: "Equal"
    value: "true"
    effect: "NoSchedule"
```

---

## 六、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 数据工程管道 | Airflow | DolphinScheduler |
| MLOps 编排 | Airflow + MLflow | Kubeflow |
| 中文团队数据平台 | DolphinScheduler | Airflow |
| 微服务长期运行 | Temporal | Airflow（不推荐） |
| 云上托管 | Cloud Composer | Step Functions |
| 轻量定时任务 | XXL-JOB | — |
| 数据感知调度 | Airflow Dataset | 自定义 |
| 混合语言团队 | Airflow（Python Operator 支持任意语言） | Temporal |

---

## 七、与其他板块的关系

- DolphinScheduler 对比见「[DolphinScheduler](./DolphinScheduler.md)」；
- 任务调度对比见「[分布式任务调度对比](./分布式任务调度对比.md)」；
- XXL-JOB 见「[任务调度 XXL-JOB](./任务调度XXL-JOB.md)」；
- 大数据全链路见「[大数据/README](../大数据/README.md)」；
- Kubernetes 部署见「[云原生/容器编排](../../云原生/容器编排与DevOps.md)」。

---

## 八、Airflow 生产配置清单

### 8.1 airflow.cfg 关键配置

```ini
[core]
executor = KubernetesExecutor
parallelism = 32                    # 全局任务并行度
dag_concurrency = 16                # 单 DAG 并行度
max_active_runs_per_dag = 1         # 单 DAG 最大运行数
load_examples = False               # 生产禁用示例 DAG
fernet_key = <加密密钥>              # Variable/Connection 加密

[scheduler]
min_file_process_interval = 30      # DAG 文件扫描间隔
parsing_processes = 4               # 并行解析进程数
child_process_log_directory = /var/log/airflow/scheduler

[webserver]
web_server_port = 8080
rbac = True                         # 开启 RBAC 权限
audit_logging = True                # 操作审计日志

[kubernetes]
namespace = airflow
worker_container_repository = my-registry/airflow-worker
worker_container_tag = latest
delete_worker_pods = True
delete_worker_pods_on_failure = True
```

### 8.2 监控告警配置

```
关键监控指标：
  scheduler_heartbeat                # 调度器心跳（<5s 正常）
  dagbag_import_errors               # DAG 导入错误数
  task_instance_success/failure      # 任务成功/失败数
  task_duration                      # 任务执行时长
  pool_available_slots               # 资源池可用槽位

告警规则（Prometheus）：
  - scheduler_heartbeat > 30s       → 调度器可能挂了
  - dagbag_import_errors > 0        → DAG 文件语法错误
  - task_failure_rate > 0.1         → 任务失败率过高
  - task_duration > 3600s           → 任务执行超时
```

### 8.3 安全最佳实践

| 实践 | 说明 |
|------|------|
| RBAC | 开启 RBAC，按团队分配角色（Admin/Op/User/Viewer） |
| 加密 | Fernet 加密 Variable/Connection |
| Secret Backend | 敏感信息用 Vault/AWS Secrets Manager |
| 网络隔离 | Webserver/Scheduler/Worker 网络隔离 |
| 审计日志 | 开启审计日志，记录所有操作 |
| HTTPS | Webserver 强制 HTTPS |
| 密码策略 | 强密码 + MFA |

---

## 九、Airflow 2.x 与 1.x 差异

| 维度 | Airflow 1.x | Airflow 2.x |
|------|-------------|-------------|
| 调度器 | 单调度器 | 多调度器高可用 |
| 执行器 | 4 种 | 新增 KubernetesExecutor |
| DAG 解析 | 同步 | 异步（性能提升 10 倍+） |
| TaskFlow API | 无 | 有（XCom 语法糖） |
| Dataset | 无 | 2.4+ 数据感知调度 |
| Listener | 无 | 2.6+ 生命周期监听 |
| UI | Flask-Admin | Flask-AppBuilder（RBAC） |
| Python 版本 | 2.7/3.5+ | 3.7+（3.8+ 推荐） |

---

> 一句话：**Airflow = DAG 即代码（Python）+ Scheduler 调度 + Executor 执行（Celery/K8s）+ 回填/传感器/Dataset 触发——数据工程编排事实标准；选型先看「团队（Python/数据工程→Airflow，可视化中文→DS）」，再定「执行器（K8s 动态→KubernetesExecutor）」，最后配「幂等任务 + 调度器高可用 + 监控告警」**。
