# MPTCP 路径管理与地址通告

> 对应 RFC 8684 第 3.4.1/3.4.2 节 ADD_ADDR 与 REMOVE_ADDR 子选项，以及 Kurose & Ross《Computer Networking》关于地址可达性的讨论。

## 一、背景与挑战
MPTCP 要在多条路径上建立子流，前提是「知道对方还有哪些 IP 地址与端口可用」。一个主机往往有多个网络接口：Wi-Fi 的私有地址、蜂窝的公网地址、以太网地址等。初始建连只用到其中一个四元组，其余地址对连接不可见。

于是需要一套机制，让连接两端能够动态地公布新出现的可达地址、撤销不再可用的地址，并据此驱动子流的建立与回收。挑战在于三点：

- 地址的可达性会变化（切换网络、NAT 重绑定、移动场景），必须能动态增删。
- 地址通告可能暴露主机的多宿主拓扑，存在信息泄露顾虑。
- 通告只是「信息」，真正建立子流还需对端主动发起，二者必须解耦。

## 二、核心原理
MPTCP 用两类子选项管理地址。

- ADD_ADDR：一端把自己新增的 IP（以及可选端口）告知对端。对端收到后，可据此发起 MP_JOIN 建立新子流。消息携带该地址的 address_id，便于后续引用；可支持 IPv4 与 IPv6。
- REMOVE_ADDR：撤销某个不再可达的地址，以 address_id 标识。收到后，对端应停止使用与该地址相关的子流。

设计上还有两个精妙之处：

- address_id 只分配一次、长期稳定，地址变化时通过「移除旧的 + 添加新的」表达，而不是让 id 漂移。
- 为降低信息暴露，ADD_ADDR 可以只通告 address_id 而不直接给出地址，由对端经已有子流反向探测（如通过 MP_PRIO/echo 语义），从而避免在明文中暴露全部地址。

需要强调：ADD_ADDR 只是「告知有这么一个地址」，并不自动建流；建流是对端主动 MP_JOIN 的结果。

## 三、形式化与数学基础
每条通告的地址拥有唯一标识 address_id（一个字节，取值受限），一条子流由三元组标识：

$$ subflow = (local\_addr,\ remote\_addr,\ address\_id) $$

设当前连接已知的可用地址集为 $A$，活跃子流集为 $S$。地址管理可刻画为状态转移。

收到 ADD_ADDR：

$$ A \leftarrow A \cup \{a\},\quad \text{可选触发 } MP\_JOIN(a) $$

收到 REMOVE_ADDR：

$$ A \leftarrow A \setminus \{a\},\quad S \leftarrow S \setminus \{s \mid s.address\_id = a\} $$

移除并非立即断开，相关子流应先优雅关闭（FIN），把未确认数据迁移到其余子流后回收。设移除操作在时刻 $t_0$ 发起、子流在 $t_1$ 关闭，则需保证未确认数据在窗口内完成重传：

$$ [t_0, t_1] \ge RTT_{max} + T_{retransmit} $$

地址数量与可建立的子流数存在对应关系。若本地有 $m$ 个地址、对端有 $n$ 个地址，则理论上最多可建立 $m \times n$ 条子流（实际受策略与内核上限约束）。

## 四、代码实现
以下为概念性伪代码，字段与流程以内核实现与 RFC 为准。

```c
/* 通告新地址（概览） */
struct add_addr_opt {
    uint8_t  subtype;      /* MPTCP_ADD_ADDR */
    uint8_t  address_id;   /* 稳定标识，1 字节 */
    uint16_t flags;        /* 是否附带端口、echo 标志等 */
    uint8_t  addr[16];     /* IPv4 或 IPv6，可省略表示只通告 id */
    uint16_t port;         /* 可选 */
};
```

```c
/* 对端收到 ADD_ADDR 后的处理（概念示意） */
void on_add_addr(struct mptcp_conn *c, const struct add_addr_opt *o)
{
    addr_set_add(&c->known_addrs, o->address_id, o->addr, o->port);

    if (policy_allows_new_subflow(c, o)) {
        /* 仅告知信息；是否真正建流由策略决定 */
        start_mp_join(c, o->addr, o->port);   /* 触发新子流 */
    }
}
```

```c
/* 撤销地址：优雅关闭相关子流后再移除 */
void on_remove_addr(struct mptcp_conn *c, uint8_t address_id)
{
    struct subflow *s, *tmp;
    list_for_each_entry_safe(s, tmp, &c->subflows, node) {
        if (s->address_id == address_id) {
            migrate_unacked(s);      /* 未确认数据迁移到其它子流 */
            subflow_shutdown(s);     /* 优雅关闭 */
        }
    }
    addr_set_del(&c->known_addrs, address_id);
}
```

## 五、与其他技术对比

| 维度 | MPTCP ADD_ADDR | SCTP ASCONF | 应用层多连接 |
| --- | --- | --- | --- |
| 动态增删地址 | 支持，轻量 | 支持 | 由业务自行实现 |
| 对应用透明 | 是 | 需原生支持 | 否 |
| 隐蔽性 | 可只通告 id，降低暴露 | 直接通告 | 取决于实现 |
| 建流触发 | 对端主动 MP_JOIN | 关联内自动 | 业务发起 |
| 主要障碍 | 中间盒与 NAT | 协议号常被阻断 | 复杂度 |

MPTCP 的地址通告相对轻量，且通过「只通告 id」的选项在功能与隐私之间取得平衡。

## 六、常见误区
- 误区一：通告地址即建立子流。ADD_ADDR 只是信息，建流需对端主动 MP_JOIN。
- 误区二：地址暴露没有代价。它可能泄露多宿主拓扑，故支持只通告 address_id。
- 误区三：移除地址就立即断开。应先迁移未确认数据并优雅关闭相关子流。

## 七、与开源书·权威来源对应
- RFC 8684 第 3.4.1 节定义 ADD_ADDR、第 3.4.2 节定义 REMOVE_ADDR 子选项。
- Linux 内核 MPTCP 与 iproute2 文档描述了地址通告的实际配置方式。

## 八、面试题
1. ADD_ADDR 的作用是什么？它与 MP_JOIN 的关系是什么？
2. 为什么需要 address_id？为什么可能只通告 id 而不通告地址？
3. REMOVE_ADDR 的完整流程是怎样的？为何不能立即断开？

## 九、演进与趋势
- 移动操作系统用路径管理实现 Wi-Fi 与蜂窝的无缝切换，切换过程对应用不可见。

## 十、小结
地址通告机制（ADD_ADDR/REMOVE_ADDR）让 MPTCP 能够动态发现与回收可用路径，是子流建立与回收的驱动源。它把「告知地址」与「建立子流」解耦，并通过 address_id 与隐蔽通告在功能、隐私与效率之间取得平衡，构成 MPTCP 多路径调度与无缝切换的管理基础。
