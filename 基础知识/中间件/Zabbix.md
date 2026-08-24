# Zabbix（传统监控系统 / 企业级告警平台）

> Zabbix 是**开源老牌企业级监控系统**（2001 年诞生，波兰团队维护），以「**主动/被动采集 + 触发器（Trigger）+ 事件告警 + 分布式监控（Proxy）**」覆盖服务器/网络/应用监控。相比 Prometheus（云原生/拉模型/标签）、Grafana（可视化层）、Nagios（脚本告警）、云监控（托管），Zabbix 以「**开箱即用的企业监控全栈（模板/告警/报表）+ 主动推送采集（穿 NAT）**」在传统运维环境仍是主力。本篇按「解决的问题 → 原理 → 对比 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 监控缺失 | 服务器/网络/数据库状态不可见，故障后知后觉 |
| 告警泛滥 | 没有阈值/抑制/升级机制，告警轰炸被忽略 |
| 采集困难 | 内网/跨网段机器采集（防火墙/NAT） |
| 资产规模 | 上千台机器统一纳管（模板批量应用） |
| 报表/趋势 | 容量趋势、SLA 报表需要历史数据积累 |

> 核心认知：**Zabbix = 「监控四件套」**——数据采集（Agent/SNMP/主动）+ 触发器（阈值判断）+ 告警（动作/媒介）+ 展示（图形/报表），一个产品闭环。

---

## 二、核心原理

### 2.1 架构

```
Zabbix Server（中心）
  ├── 数据收集（被动轮询 + 主动 Trapper）
  ├── 触发器评估（表达式 → 问题/恢复）
  ├── 动作（告警：邮件/钉钉/微信/脚本）
  └── 数据存储（MySQL/PG）

Zabbix Proxy（分布式采集节点，可选）
  └── 机房/远程站点本地采集 → 上报中心（断网缓存）

Zabbix Agent（被监控端）
  ├── 被动模式：Server 轮询（默认，10050 端口）
  └── 主动模式：Agent 主动推送（Trapper，穿 NAT/防火墙）

前端 Web UI（配置/图形/报表/权限）
```

### 2.2 核心对象模型

| 对象 | 说明 |
|------|------|
| Host / Host Group | 主机/主机组（按业务/机房分组） |
| Item | 监控项（如 CPU 使用率，采集间隔） |
| Trigger | 触发器（表达式：`{host:item.last()}>90`） |
| Action | 动作（触发器触发 → 告警媒介/升级） |
| Template | 模板（一批 Item+Trigger 批量套用主机） |
| Discovery | 自动发现（网段扫描/自动注册纳管） |

### 2.3 对象模型深入（如何配置一台主机）

```
配置流程：
  ① 定义主机组（按业务线：订单组/支付组）
  ② 关联模板（Linux by Zabbix agent / MySQL by Zabbix agent）
     → 模板自动带来几十个 Item + 相关 Trigger + 图形
  ③ 调整关键 Item 采集间隔（CPU 10s，磁盘 60s）
  ④ 自定义 Trigger（业务指标：下单失败率 > 1%）
  ⑤ 配置 Action（触发条件 → 通知媒介/脚本）
  ⑥ 自动发现（新机器自动纳管，套用模板）

模板体系的价值：
  一次定义（Item+Trigger+Graph+Discovery Rule）→ 无限套用
  官方/社区 1000+ 模板（Linux/Windows/MySQL/Redis/Nginx/Docker...）
  生产建议：以官方模板为基线，按业务扩展自定义模板
```

### 2.4 采集方式

| 方式 | 协议/说明 | 适用 |
|------|-----------|------|
| Zabbix Agent | 自定义采集项（CPU/内存/磁盘/进程/日志） | 服务器（最常用） |
| SNMP | 网络设备（交换机/路由器/防火墙） | 网络监控 |
| IPMI | 硬件传感器（温度/电源） | 物理机 |
| JMX | Java 应用指标 | Java 中间件 |
| HTTP/数据库查询 | 站点可用性/业务指标 | 应用监控 |
| 主动 Trapper | Agent 主动推送 | 跨网段/NAT |
| 自定义脚本/SSH | 任意指标采集 | 特殊场景 |

### 2.5 告警机制

```
Trigger 表达式 → 事件（Problem/Resolved）
  → Action（条件匹配）→ 通知媒介（邮件/Webhook/钉钉/短信）
  → 升级（告警级别：信息/警告/严重/灾难；时间升级）
  → 确认/关闭（操作记录）
```

**选型关注点**：Zabbix 告警是「事件驱动 + 媒介插件化」——与 Prometheus Alertmanager 对等，但 Zabbix 还内置了「告警升级 + 确认 + 报表」。

### 2.6 Trigger 表达式深入

```
表达式构成：
  {主机:监控项.函数(参数)} 运算符 阈值
  函数：last() / avg(10m) / min / max / count / nodata() / change()
  运算符：= < > <= >= <>（数值）
 与或非组合：(A) and (B) or not (C)

常用模式：
  连续 N 次超阈值（去抖）：last(3) #3 > 90（最近 3 次均 >90）
  持续窗口超阈值：min(5m) > 90（5 分钟最小值 >90）
  数据缺失（采集失败）：nodata(5m)=1
  速率变化（异常增长）：change() > 30
  业务条件组合：(status=1) and (last(3)#3>90)

维护期（Maintenance）：
  变更/发布期间抑制告警（计划内维护不告警）
```

### 2.7 告警升级与收敛

```
告警升级（Escalation）：
  级别：信息 → 警告 → 严重 → 灾难
  时间升级：告警持续 10 分钟 → 升级到二级负责人
  → 电话/短信 vs 邮件分层

告警收敛（防轰炸）：
  ① 条件组合（多条件同时满足才触发）
  ② 维护期抑制（计划内变更不告警）
  ③ 聚合通知（同类告警合并成一条）
  ④ 恢复通知（Problem 自动恢复 → Resolved 通知）
  ⑤ 告警去重（同一 Trigger 短时间内不重复发）
```

---

## 三、核心特性

| 特性 | 说明 |
|------|------|
| 全栈监控 | 服务器/网络/存储/数据库/应用一体 |
| 模板体系 | 官方/社区 1000+ 模板（MySQL/Redis/Nginx...） |
| 主动采集 | 穿 NAT/防火墙（Agent 主动上报） |
| 分布式 | Proxy 级联（多机房统一纳管） |
| 告警升级 | 级别 + 时间升级 + 确认关闭 |
| 自动发现 | 网段扫描 + 自动注册（Agent 自动纳管） |
| 报表/SLA | 内置趋势报表/可用性报表 |
| 权限 | 用户组 + 主机组权限隔离 |
| 高可用 | Server 主备（HA）+ 数据库主从 |
| 自定义 | 脚本监控项（任意指标）+ 宏变量（模板参数化） |

### 3.1 宏变量（模板参数化）

```
宏 = 模板中的变量（{$NAME}），套用主机时替换
  内置宏：{$HOST.NAME} / {$IPADDRESS} / {HOSTNAME}
  自定义宏：{$MYSQL_PASSWORD} / {$PORT} / {$URL}

价值：
  同一模板套用到不同主机时差异化配置
  敏感信息（密码）放宏，避免硬编码
  示例：MySQL 监控模板用 {$MYSQL_USER} / {$MYSQL_PASSWORD} 宏
```

---

## 四、Zabbix vs Prometheus vs Grafana vs 云监控

| 维度 | Zabbix | Prometheus | Grafana | 云监控 |
|------|--------|------------|---------|--------|
| 定位 | 传统监控全栈 | 云原生指标采集 | 可视化（需数据源） | 云上托管监控 |
| 采集模型 | 主动+被动（Agent/SNMP） | 拉模型（Pull + 服务发现） | 不采集 | 云内自动采集 |
| 数据模型 | 主机+Item（树状） | 指标+标签（多维） | — | 资源+指标 |
| 告警 | 强（升级/确认/媒介） | 强（Alertmanager） | 中（面板告警） | 强 |
| 模板 | 强（1000+） | 中（exporter + 规则） | — | 云服务模板 |
| 云原生 | 弱（需手动纳管） | 强（K8s 原生） | 强 | 强 |
| 适用 | 传统机房/混合环境 | K8s/云原生 | 统一可视化 | 云上 |

### 4.1 协作模式（不是二选一）

```
最佳实践：
  Zabbix：物理机/网络/传统中间件（基础设施层）
  Prometheus：K8s/云原生应用（Pod/Service 指标）
  Grafana：统一可视化层（接 Zabbix + Prometheus 数据源）
  → 各司其职，互补共存

数据模型差异：
  Zabbix 树状（主机 → 监控项）：适合"这台机器的状态"
  Prometheus 标签（指标 + 多维标签）：适合"按维度聚合的云原生"
```

**选型关注点**：
- 传统机房/网络设备/物理机 → **Zabbix**（Agent/SNMP/IPMI 全支持）；
- 云原生/K8s → **Prometheus**（服务发现 + 标签）；
- 两者并存是常态：**Zabbix（基础设施）+ Prometheus（K8s/应用）+ Grafana（统一大盘）**；
- 云上快速 → **云监控**（免运维）。

---

## 五、生产实践

### 5.1 关键实践

| 实践 | 说明 |
|------|------|
| 模板先行 | 官方模板 + 自定义模板（基线/批量化） |
| 采集间隔 | 常规 30~60s；关键指标 10s（间隔越短库越大） |
| 触发器 | 多条件组合（如 连续 3 次超阈值）+ 抑制（维护期） |
| 数据保留 | 原始 30 天 + 趋势 1 年（分区表清理） |
| Proxy | 多机房用 Proxy 本地采集（断网不丢） |
| 告警分级 | 严重→电话/钉钉，警告→邮件；加告警收敛（聚合） |
| 数据库 | 独立 MySQL/PG + 主从（Server 元数据库） |

### 5.2 容量规划

```
数据量估算：
  每主机 100 Item × 采集间隔 60s = 每分钟 100 条 × 1000 主机
  → 日增千万级记录 → 数据库必须分区（按天）+
    housekeeping 自动清理（保留策略：原始/趋势分级）

Server 规模：
  1000 主机以下：单机 Server（8C/16G 够）
  1000+ 主机/高采集频率：Server + Proxy 分布式
  数据库：独立实例（避免与 Server 抢资源）
```

### 5.3 常见坑

- **告警轰炸**：触发器条件太敏感 + 无抑制 → 收敛（条件组合/时间窗口/维护期）；
- **被动模式穿墙失败**：跨网段必须主动模式（Trapper）；
- **历史数据膨胀**：无清理策略拖垮数据库（分区 + 自动清理）；
- **Server 单点**：必须 HA（主备 + 数据库主从），否则中心挂=监控盲区；
- **Agent 版本混杂**：Agent 与 Server 版本不匹配 → 统一版本升级；
- **采集频率过高**：10s 间隔 × 上千主机 → DB 打爆 → 分级频率（核心 10s，常规 60s）。

### 5.4 高可用架构

```
Zabbix 高可用：
  Server HA：双 Server 共享数据库（主动/被动切换）
    → 故障自动切换（VIP 或 DNS 切换）
  Proxy：多 Proxy 分担采集（机房级容灾）
  数据库：MySQL 主从 + 半同步复制
  → 前端 UI：负载均衡 + Session 共享（可多实例）

断网容错：
  Proxy 本地缓存（断网不丢数据，恢复后回传）
  Agent 主动模式（断连自动重连）
```

---

## 六、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 传统机房/物理机/网络 | Zabbix | Nagios（过时） |
| K8s/云原生 | Prometheus | 云监控 |
| 统一可视化大盘 | Grafana（接两者） | — |
| 云上托管 | 云监控 | Prometheus 托管版 |
| 多机房统一纳管 | Zabbix Proxy 级联 | — |
| 深度自定义采集 | Zabbix（脚本/宏） | Prometheus exporter |

### 6.1 决策树

```
传统机房（物理机/网络设备/SNMP）→ Zabbix
K8s/容器 → Prometheus
两者都有 → Zabbix + Prometheus + Grafana 统一
云上无运维团队 → 云监控
需要 SLA 报表/告警升级/确认流程 → Zabbix（企业流程）
```

---

## Zabbix 架构深入：Server / Proxy / Agent 全景

### 架构组件详解

```
┌─────────────────────────────────────────────────────────┐
│                    Zabbix Server                         │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐    │
│  │ 调度器    │  │ 触发器   │  │ 事件管理器          │    │
│  │ Poller   │  │ Eval     │  │ Event Manager      │    │
│  └──────────┘  └──────────┘  └────────────────────┘    │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐    │
│  │ Trapper  │  │ 自发现    │  │ 告警发送器          │    │
│  │ 接收端   │  │ Disc     │  │ Alerter            │    │
│  └──────────┘  └──────────┘  └────────────────────┘    │
│                      ↕                                  │
│              MySQL / PostgreSQL                          │
└─────────────────────────────────────────────────────────┘
          ↕ (主动/被动)          ↕ (主动/被动)
┌──────────────────┐    ┌──────────────────┐
│  Zabbix Proxy    │    │  Zabbix Proxy    │
│  (数据中心A)     │    │  (数据中心B)     │
│  ┌────────┐      │    │  ┌────────┐      │
│  │本地缓存│      │    │  │本地缓存│      │
│  └────────┘      │    │  └────────┘      │
└──────────────────┘    └──────────────────┘
      ↕ (10050/10051)         ↕
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Agent       │  │ Agent       │  │ Agent       │
│ (被监控主机)│  │ (被监控主机)│  │ (被监控主机)│
└─────────────┘  └─────────────┘  └─────────────┘
```

### Zabbix Agent 2 vs Agent 1 对比

| 维度 | Agent 1 | Agent 2 |
|------|---------|---------|
| 语言 | C | Go |
| 插件机制 | 无（编译时内置） | 无限插件架构（Go plugin） |
| 预处理 | 服务器端预处理 | 客户端预处理（减少 Server 压力） |
| 并发采集 | 单线程 | 原生并发（Go goroutine） |
| 内存占用 | ~10MB | ~30MB（但功能更强） |
| 支持协议 | Agent/SNMP/JMX | Agent/SNMP/JMX/HTTP/MySQL/PostgreSQL/Podman |
| 证书认证 | 无 | 支持 TLS 证书双向认证 |
| 可靠性 | 本地文件存储状态 | SQLite 存储状态（更可靠） |

### Agent 2 插件架构

```yaml
# agent2 配置示例（插件化）
Plugins:
  MySQL:
    Enabled: true
    DSN: "tcp(127.0.0.1:3306)/"
    Username: "zabbix"
    Password: "{$MYSQL_PASSWORD}"
  PostgreSQL:
    Enabled: true
    DSN: "host=127.0.0.1 port=5432 user=zabbix"
  HTTPAgent:
    Enabled: true
    Timeout: 5s
  MQTT:
    Enabled: true
    Broker: "tcp://127.0.0.1:1883"
```

---

## 模板系统与 LLD（Low Level Discovery）

### 模板层次体系

```mermaid
graph TD
    A[全局模板] --> B[操作系统模板]
    A --> C[数据库模板]
    A --> D[中间件模板]
    B --> B1[Linux by Zabbix Agent]
    B --> B2[Windows by Zabbix Agent]
    C --> C1[MySQL by Zabbix Agent]
    C --> C2[PostgreSQL by Zabbix Agent]
    D --> D1[Nginx by Zabbix Agent]
    D --> D2[Redis by Zabbix Agent]
    B1 --> E[业务自定义模板]
    C1 --> E
    D1 --> E
```

### LLD 低级发现原理

```
LLD 工作流程：
  ① 发现规则（Discovery Rule）→ 执行发现脚本/命令
  ② 返回 JSON 格式发现数据（Macros 变量）
  ③ 根据发现数据自动创建 Item + Trigger + Graph
  ④ 当新实体出现/消失时自动增删监控

LLD 发现类型：
  文件系统发现 → 自动监控每个分区
  网络接口发现 → 自动监控每张网卡
  Docker 容器发现 → 自动监控每个容器
  K8s Pod 发现 → 自动监控每个 Pod
  自定义发现 → 自定义脚本返回 JSON

LLD JSON 示例：
  {
    "data": [
      {"/{#DISK}": "/", "{#FSTYPE}": "ext4"},
      {"/{#DISK}": "/data", "{#FSTYPE}": "xfs"}
    ]
  }
```

### LLD 宏变量映射

| 宏 | 说明 | 示例 |
|----|------|------|
| `{#FSNAME}` | 文件系统名 | /, /data |
| `{#FSTYPE}` | 文件系统类型 | ext4, xfs |
| `{#IFNAME}` | 网络接口名 | eth0, eth1 |
| `{#CONTAINER}` | Docker 容器名 | nginx-abc123 |
| `{#PODNAME}` | K8s Pod 名 | web-7d4b8f |

---

## Zabbix Trigger 表达式深入

### 触发器函数详解

| 函数 | 说明 | 示例 |
|------|------|------|
| `last()` | 最近 N 次值 | `last(3)#3 > 90`（最近 3 次均超 90） |
| `avg()` | 时间窗口平均值 | `avg(5m) > 80`（5 分钟平均 >80） |
| `min()` | 时间窗口最小值 | `min(10m) < 10`（10 分钟最低 <10） |
| `max()` | 时间窗口最大值 | `max(3m) > 95`（3 分钟最高 >95） |
| `count()` | 时间窗口值计数 | `count(1h,100,"gt")`（1 小时内 >100 的次数） |
| `nodata()` | 数据缺失检测 | `nodata(5m)=1`（5 分钟无数据） |
| `change()` | 值变化检测 | `change(1h) > 0`（1 小时内有变化） |
| `diff()` | 与前值比较 | `diff()=1`（与上一值不同） |
| `band()` | 按位与 | `band(last(),1)=0`（最低位为 0） |
| `forecast()` | 趋势预测 | `forecast(1h,2h) > 100`（预测 2 小时后超 100） |

### 复杂触发器示例

```
# CPU 连续 3 次超 90% 且 5 分钟平均超 80%
{Host:system.cpu.util.avg(5m)}>80 and {Host:system.cpu.util.last(3)}>90

# 磁盘使用率 > 90% 且 inode 使用率 > 80%
{Host:vfs.fs.size[/,pused].last()}>90 and {Host:vfs.fs.inode[/,pused].last()}>80

# 网络流量突增（当前值 > 平均值 3 倍）
{Host:net.if.in[eth0].last()} > 3*{Host:net.if.in[eth0].avg(1h)}

# 数据库连接数超阈值 + 慢查询数突增
{DB:db.connections.active.last()}>500 and {DB:db.slow_queries.count(5m)}>10
```

---

## 告警升级（Escalation）机制

```mermaid
graph TD
    A[触发器 Problem] --> B{持续 5 分钟?}
    B -->|是| C[第 1 级：邮件通知运维]
    B -->|否| Z[等待]
    C --> D{持续 15 分钟?}
    D -->|是| E[第 2 级：钉钉通知团队]
    D -->|否| Z
    E --> F{持续 30 分钟?}
    F -->|是| G[第 3 级：电话通知负责人]
    F -->|否| Z
    G --> H{持续 60 分钟?}
    H -->|是| I[第 4 级：短信通知 CTO]
    H -->|否| Z
    I --> J{触发器 Resolved}
    J --> K[发送恢复通知]
```

### 告警升级配置

| 步骤 | 时间 | 动作 | 媒介 |
|------|------|------|------|
| 1 | 立即 | 通知运维组 | 邮件 |
| 2 | 持续 10 分钟 | 升级到团队负责人 | 钉钉 |
| 3 | 持续 30 分钟 | 升级到部门经理 | 短信 + 邮件 |
| 4 | 持续 60 分钟 | 升级到 CTO | 电话 |
| 恢复 | 任意时刻 | 发送恢复通知 | 所有已通知媒介 |

---

## Zabbix Proxy 分布式监控

### Proxy 工作原理

```
Zabbix Proxy 核心机制：
  ① 代理采集：Proxy 代替 Server 采集 Agent 数据
  ② 本地缓存：断网时数据存本地磁盘（SQLite/MySQL）
  ③ 数据转发：网络恢复后批量回传 Server
  ④ 心跳机制：Proxy 定期向 Server 报告存活
  ⑤ 配置同步：Server 下发监控配置到 Proxy

部署模式：
  模式一：Proxy 仅采集（推荐，最常见）
  模式二：Proxy 采集 + 简单触发器评估（减少 Server 压力）

适用场景：
  跨机房/跨地域监控（带宽受限）
  大规模监控（分担 Server 采集压力）
  防火墙/NAT 穿透（Agent → Proxy → Server）
```

### Proxy 高可用

| 组件 | HA 方案 | 说明 |
|------|---------|------|
| Proxy | 主备 Proxy | 同一网段部署两个 Proxy，共享 Agent 列表 |
| Server | 主备 Server | 共享数据库，VIP 切换 |
| 数据库 | MySQL 主从 | 半同步复制，防止数据丢失 |
| 网络 | 多链路 | Proxy 到 Server 有备用网络路径 |

---

## Zabbix API 与自动化

### API 核心接口

```python
# Zabbix API 调用示例
import jsonrpc

# 认证
zabbix = jsonrpc.ServerProxy("http://zabbix-server/api_jsonrpc.php")
auth = zabbix.user.login("Admin", "zabbix")
# 返回: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# 获取主机列表
hosts = zabbix.host.get({
    "auth": auth,
    "params": {
        "output": ["hostid", "host", "name"],
        "selectInterfaces": ["ip"],
        "filter": {"status": 0}
    }
})

# 批量创建监控项
items = zabbix.item.create({
    "auth": auth,
    "params": {
        "hostid": "10001",
        "name": "CPU Load",
        "key_": "system.cpu.load[percpu,avg1]",
        "type": 0,  # 0=Zabbix Agent
        "value_type": 0,  # 0=浮点数
        "delay": "30s"
    }
})

# 导出模板
export = zabbix.configuration.export({
    "auth": auth,
    "params": {
        "format": "yaml",
        "options": {"templates": ["10001"]}
    }
})
```

### 自动化集成场景

| 场景 | 实现方式 |
|------|----------|
| 自动纳管新主机 | Zabbix Agent 自动注册 + API 批量关联模板 |
| 配置批量变更 | API 批量修改 Item/Trigger 参数 |
| 监控即代码 | API + Terraform/Ansible 实现监控配置版本化 |
| CMDB 联动 | API 拉取主机清单 → 自动创建/删除监控 |
| 告警自动工单 | Webhook 告警 → Jira/ServiceNow 自动创建工单 |

---

## 自定义 Item 采集

### 自定义 Key 配置

```bash
# Agent 配置文件（zabbix_agentd.conf）
UserParameter=mysql.connections[*],mysql -u$1 -p$2 -e "show status" 2>/dev/null | grep "Threads_connected" | awk '{print $$2}'
UserParameter=nginx.requests[*],curl -s "http://$1/nginx_status" | grep "accepts" | awk '{print $$3}'
UserParameter=docker.container.cpu[*],docker stats --no-stream --format "{{.CPUPerc}}" $1 | tr -d '%'
```

### 采集方式对比

| 方式 | 延迟 | 准确性 | 适用 |
|------|------|--------|------|
| Zabbix Agent（被动） | 秒级 | 高 | 常规监控 |
| Zabbix Agent（主动） | 秒级 | 高 | 跨网段/NAT |
| SNMP | 秒级 | 中 | 网络设备 |
| JMX Gateway | 秒级 | 高 | Java 应用 |
| HTTP Agent | 秒级 | 高 | REST API 指标 |
| 计算项 | 实时 | 高 | 派生指标 |
| 聚合项 | 实时 | 高 | 跨主机聚合 |

---

## Zabbix vs Prometheus vs Datadog 对比

| 维度 | Zabbix | Prometheus | Datadog |
|------|--------|------------|---------|
| 部署模式 | 自建（Server+Agent+DB） | 自建（Server+Agent） | SaaS（免运维） |
| 数据模型 | 主机+Item（树状） | 指标+标签（多维） | 指标+标签（多维） |
| 采集模型 | 主动推送+被动拉取 | Pull（拉模型） | Agent 推送 |
| 存储 | MySQL/PG（关系型） | 本地 TSDB（时间序列） | 云端 TSDB |
| 查询语言 | 函数表达式 | PromQL | DQL（私有） |
| 告警 | 升级/确认/媒介 | Alertmanager | 内置告警 |
| 可视化 | 内置 Web UI | Grafana | 内置 Dashboard |
| 云原生 | 弱 | 强（K8s 原生） | 强（多云） |
| 成本 | 开源免费（运维成本） | 开源免费（运维成本） | 按主机计费（$15+/主机/月） |
| 扩展性 | Proxy 分布式 | Federation/远程写 | 自动扩展 |

### 成本估算对比

```
1000 台主机监控年成本估算：
  Zabbix（自建）：
    服务器：2 台 Server + 1 台 DB = ¥5 万/年
    运维人力：1 人 × 20% = ¥5 万/年
    总计：~¥10 万/年

  Prometheus（自建）：
    服务器：3 台（HA）= ¥8 万/年
    运维人力：1 人 × 20% = ¥5 万/年
    总计：~¥13 万/年

  Datadog（SaaS）：
    1000 主机 × $15/月 × 12 = $180,000/年 ≈ ¥130 万/年

  结论：
    小规模（<100 台）→ Datadog 最省心
    中大规模（>500 台）→ Zabbix/Prometheus 自建更经济
    混合环境 → Zabbix（基础设施）+ Prometheus（云原生）
```

---

## 生产部署容量规划

### Server 规格推荐

| 监控规模 | Server 配置 | DB 配置 | Proxy 数量 |
|----------|-------------|---------|------------|
| <500 主机 | 4C/8G | 4C/8G | 0 |
| 500~2000 主机 | 8C/16G | 8C/16G（独立） | 1~2 |
| 2000~10000 主机 | 16C/32G | 16C/32G（主从） | 3~5 |
| >10000 主机 | 32C/64G（集群） | 32C/64G（集群） | 5+ |

### 数据量估算

```
数据量计算公式：
  每天数据量 = 主机数 × Item数 × (86400/采集间隔) × 每条大小(~100B)

示例（1000 主机，每主机 100 Item，60s 间隔）：
  = 1000 × 100 × (86400/60) × 100B
  = 1000 × 100 × 1440 × 100B
  ≈ 14.4 GB/天（原始数据）

清理策略：
  原始数据：保留 30 天 → ~432 GB
  趋势数据（每小时聚合）：保留 1 年 → ~5 GB
  快照数据：保留 30 天 → 较小
  → 总存储需求：~500 GB（需分区表 + 自动清理）
```

---

## Zabbix 在云原生监控中的定位

```mermaid
graph TD
    A[云原生监控体系] --> B[基础设施层]
    A --> C[应用层]
    A --> D[业务层]
    B --> B1[Zabbix: 物理机/网络设备]
    B --> B2[云监控: 云资源指标]
    C --> C1[Prometheus: K8s/Pod/Service]
    C --> C2[OpenTelemetry: 分布式追踪]
    D --> D1[自定义监控: 业务指标]
    D --> D2[APM: 应用性能]
    B1 --> E[Grafana: 统一可视化]
    B2 --> E
    C1 --> E
    D1 --> E
```

### Zabbix 云原生集成方案

| 方案 | 说明 | 适用 |
|------|------|------|
| Zabbix Agent 2 on K8s | DaemonSet 部署 Agent 2 | K8s 节点+容器监控 |
| Zabbix + Prometheus Exporter | Zabbix 采集 Prometheus 指标 | 混合环境过渡 |
| Zabbix + 云 API | 直接调用云 API 采集云资源 | 深度云资源监控 |
| Zabbix + OpenTelemetry | OTel Collector 转发到 Zabbix | 统一可观测性 |

---

## 七、与其他板块的关系

- 云原生监控对比见「[Prometheus 与 Grafana 监控](./Prometheus与Grafana监控.md)」；
- 可观测性标准见「[OpenTelemetry](./OpenTelemetry.md)」；
- 日志体系见「[ELK 日志体系](./ELK日志体系.md)」「[Loki](./Loki.md)」；
- 云上监控见「[云上可观测性体系](./云上可观测性体系.md)」。

> 一句话：**Zabbix = 采集（Agent/SNMP/主动）+ 触发器（阈值）+ 告警（升级/媒介）+ 报表——传统企业监控闭环；选型先看「环境（传统机房→Zabbix，云原生→Prometheus）」，再定「部署（多机房→Proxy 级联 + Server HA）」，最后配「模板批量 + 告警收敛 + 分级采集频率 + 数据保留策略」**。