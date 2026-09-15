# 隔离机制Fencing

> 对应 Gray 1978（Notes on Data Base Operating Systems，fencing 概念）与 Kleppmann DDIA 第8章（fencing tokens）。

## 一、背景与挑战
即便有租约（lease）和选主，陈旧的主（因网络抖动、GC 停顿被误判失联）可能在恢复后继续向存储写数据，破坏新主已经写入的状态——这就是「GC 安全」问题。根本难点在于：我们没法可靠地「杀掉」一个可能仍在运行的旧主进程（它可能刚从长 GC 中醒来，以为自己还是主）。fencing（隔离）不在进程层阻止，而在存储/资源层拒绝陈旧写入：任何带「旧权限」的写都被底层直接丢弃。

Gray 1978 在数据库操作系统的笔记中就指出：分布式锁必须有「防护（fencing）」机制，否则持锁者被暂停后恢复，会与新持锁者同时进入临界区。这是并发正确性（互斥）的基石，也是今天分布式锁（Chubby、etcd）必须实现 token 校验的原因。

「无法杀掉旧主」这一前提值得强调：在分布式系统中，节点的暂停与崩溃对外部不可区分（这是 FLP 与 CAP 论证的共同基础）。因此任何「通知旧主停止」的方案都不成立——旧主可能根本没收到通知，或者收到时已经太晚。fencing 的设计智慧在于：不在「旧主」这一侧做任何可靠假设，只在「存储」这一侧做单调性检查。

## 二、核心原理
- 每次授予领导权（或租约续期）时，由可靠协调者颁发一个单调递增的整数 fencing token（如 ZooKeeper 的 epoch、或使用存储自身的版本号）。
- 客户端/主在每次写请求中携带当前 token。
- 存储服务记录已接受的最大 token $t_{max}$，只执行 $t > t_{max}$ 的写，并把 $t_{max}$ 更新为 t；否则拒绝。
- 陈旧主持旧 token，其写恒被拒，从而被「隔离」。关键：token 的单调性与存储侧的强制检查，不依赖旧主是否「知道自己该停」。

存储层做 fencing 的前提是「写与 token 校验在一个原子步骤内」（CAS 语义），否则检查与写之间仍有竞态。这也是为什么 fencing 必须下沉到存储/资源层，而不能只在应用层比较。

token 的颁发源必须「可靠且全局唯一」：若用本地计数器，两个进程可能颁出相同的 token；若用物理时间戳，时钟漂移可能让旧主的 token 更大。因此实践中 token 由协调者（ZK 的 zxid、etcd 的 revision）统一颁发，或由存储自身的单调版本号（如对象存储的 generation、云盘的 sequential write token）提供。

## 三、形式化与数学基础
设第 k 次选举颁发 token $k$。存储维护 $t_{max}$。写请求带 token $t$：
$$\text{accept} \iff t > t_{max},\quad \text{then } t_{max} \leftarrow t$$
拒绝条件 $t \le t_{max}$。由于 token 严格递增且存储只前进不回退，任何陈旧主持有的 $t_{old} < t_{max}$ 必被拒。该机制的正确性不依赖时钟，只依赖「协调者颁发的 token 全局单调」这一前提。若用物理时间戳做 token，则退化为依赖时钟准确性的租约方案，GC/时钟漂移可能导致旧主 token 看似更新而绕过隔离——所以优先用逻辑单调 token。

安全性论证可形式化为：设存储接受的最后一个写来自 token $t_{max}$，则任何后续被接受的写必须 $t > t_{max}$。对任意两次「被认为属于不同主」的写，若其 token 分别为 $t_1 < t_2$，则 $t_1$ 的写必然发生在 $t_2$ 的写之前被接受；若 $t_1$ 的写晚到达，它会因 $t_{tmax} \ge t_2 > t_1$ 被拒绝。因此「乱序到达的陈旧写」不会破坏状态，这是 fencing 的核心保证。

「原子性」是另一必要条件：若「检查 token」与「执行写」之间存在窗口，两个写可能同时通过检查。形式化即要求该操作为原子的 CAS 或事务。

## 四、代码实现
```python
# 存储侧 fencing：仅接受更大 token 的写
class FencedStore:
    def __init__(self):
        self.tmax = 0
    def write(self, token, data):
        if token <= self.tmax:
            return False          # 陈旧写被隔离
        self.tmax = token
        apply(data)
        return True
    def read(self, token):
        if token < self.tmax:
            return None           # 陈旧读也不可信
        return snapshot()

# 原子 CAS 形式的 fencing（避免检查-写竞态）
def cas_write(self, token, expected, new):
    if token <= self.tmax:
        return False
    return atomic_compare_swap(self.tmax, expected, token, new)
```

与协调者配合的完整流程（申请 token → 携带 token 写）：

```python
def leader_write(self, coordinator, data):
    token = coordinator.acquire_or_renew()   # 从协调者取得单调递增 token
    if not self.store.write(token, data):
        raise FencedOut(                    # 已被隔离，应立即自杀或降级
            f"token {token} <= {self.store.tmax}, fenced by a newer leader")
    return True
```

## 五、与其他技术对比
| 维度 | Fencing token | 时间租约 | ZK 临时节点 | 存储写锁 |
| --- | --- | --- | --- | --- |
| 正确性依赖 | 单调序号 | 时钟准确 | 会话存活 | 锁服务 |
| 防陈旧主 | 强（存储强制） | 弱（依赖 TTL） | 中（会话断即失权） | 强 |
| 时钟假设 | 不需要 | 需要 | 需要 | 不需要 |
| 生效位置 | 存储/资源层 | 应用/协调层 | 协调层 | 存储层 |
| 典型实现 | etag/generation | Lease 续约 | ephemeral znode | 卷租约 |

需要区分「租约」与「fencing」的层级：租约解决的是「谁有资格写」（时效性），fencing 解决的是「旧资格还能不能写」（安全性）。二者叠加才能同时获得「快速切换」与「绝对隔离」。只用租约时，旧主在租约过期前的写仍会被接受；加了 fencing 后，即使旧主还在写，其 token 已落后，写必然被拒。

## 六、常见误区
1. 认为有 leader 选举就不需要 fencing。选举只决定「谁是当前主」，无法阻止陈旧主带旧权限继续写。
2. token 不单调。若可被回绕或重复，陈旧主可能拿到「看似新」的 token 绕过隔离。
3. 只在应用层检查 token。必须下沉到存储/资源层原子检查，否则检查与写之间仍有竞态。
4. 用物理时间戳当 token。时钟漂移/GC 可能让旧主时间戳更大，隔离失效；应优先逻辑单调 token。
5. 以为 fencing 只对写有效。陈旧读同样应被拒绝（读到的可能是不该可见的旧状态）。
6. 忽略 token 的持久性。若存储的 $t_{max}$ 在重启后丢失，旧 token 可能被误接受，故 $t_{max}$ 必须持久化。
7. 以为应用收到拒绝后可以继续运行。正确做法是立即「自杀」或降级为只读，避免持续发出会被拒的写。

## 七、与开源书·权威来源对应
- Gray 1978：Notes on Data Base Operating Systems，提出 fencing 思想。
- Kleppmann《DDIA》第 8 章：fencing tokens 与存储层隔离。
- Hunt et al. 2010（ZooKeeper）：epoch/临时节点实现隔离。
- Burrows 2006（Chubby）：分布式锁的 fencing 实践。
- Coulouris《Distributed Systems》第 15 章：协调与互斥的经典模型。

## 八、面试题
1. fencing token 如何阻止陈旧主写？
   要点：存储只接受 token 严格大于已记录的写，旧主 token 较小被拒。
2. 为什么时间租约不够稳？
   要点：依赖时钟准确，GC/时钟漂移可能导致租约过期后旧主仍写；fencing 不依赖时钟。
3. fencing 应放在哪一层？为什么？
   要点：存储/资源层原子检查，避免应用层检查与写之间的竞态。
4. 为何不能用物理时间戳做 fencing token？
   要点：时钟漂移/GC 可能使旧主时间戳更大，绕过隔离；逻辑单调 token 不依赖时钟。
5. 收到 fencing 拒绝后旧主应该怎么做？
   要点：立即终止自身或降级为只读，防止持续发出被拒的写造成资源浪费与状态混乱。
6. 为什么 $t_{max}$ 必须持久化？
   要点：若重启丢失，旧 token 可能被误接受，隔离失效。

## 九、演进与趋势
云厂商把 fencing 下沉到块存储/卷的写令牌（volume lease），即使虚拟机被「误认为死亡」也无法写盘；「防护令牌 + 原子 CAS」成为分布式锁的标准实现（如 Chubby、etcd lease）。一些系统进一步把 fencing 与「写入版本号」合并，让每次写自带单调递增 guard。

另一趋势是「存储原语化」：对象存储与分布式块设备开始直接提供「条件写 + generation」语义，使 fencing 不再需要应用自行维护 $t_{max}$，而是由存储的强一致原语保证，进一步降低正确实现的难度。

## 十、小结
Fencing 是防守脑裂的最后一道闸：它不在进程层「杀死」旧主，而在存储层用单调递增 token 强制拒绝陈旧写入，正确性不依赖时钟，是分布式协调鲁棒性的关键保障，也是 Gray 1978 以来并发互斥思想的延续。牢记「token 必须全局单调、检查必须与写原子、$t_{max}$ 必须持久化」这三条，是正确落地 fencing 的必备条件。
