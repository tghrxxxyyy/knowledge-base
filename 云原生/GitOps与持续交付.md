# GitOps 与持续交付

> 板块：云原生 　|　 返回：[README](README.md)

## 一、GitOps 理念

把「系统期望状态」存 Git，工具（Argo CD/Flux）自动把集群同步到该状态。Git 即真相源。

```
开发者 Push 清单 → Git → Argo CD 检测差异 → 自动/审批同步 K8s
```

## 二、与传统 CI/CD 区别

- 传统：CI 构建 → CD 推送集群（Push）。
- GitOps：集群主动拉取 Git 状态（Pull），自愈（漂移自动纠正）。

## 三、核心工具

- **Argo CD**：声明式、可视化、多集群。
- **Flux**：轻量、CNCF。
- **Tekton**：K8s 原生流水线。

## 四、优势

- 审计：所有变更在 Git。
- 回滚：git revert 即回滚。
- 一致：多环境用同一 Git 驱动。

## 五、渐进式交付

- 蓝绿 / 金丝雀用 Argo Rollouts 配合 Mesh 做流量切分。

## 六、常见坑

1. 把密钥提交 Git → 泄露（用 Sealed Secrets / Vault）。
2. 清单与集群漂移不管 → GitOps 价值打折。
3. 同步频率过高 → 控制面压力。

## 七、延伸阅读

- [云原生/README](README.md)
- [SRE/README](../../SRE/README.md)
- 工具：Argo CD、Flux、Tekton
