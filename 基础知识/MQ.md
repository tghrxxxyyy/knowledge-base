## **kafka的producer流程**

AR、LSR、OSR

分区中的所有副本统称为AR（Assigned Replicas）。

所有与leader副本保持一定程度同步的副本（包括leader副本在内）组成ISR（In-Sync Replicas），ISR集合是AR集合中的一个子集。

与leader副本同步滞后过多的副本（不包括leader副本）组成OSR（Out-of-Sync Replicas）


    

![](images/WEBRESOURCE56b1ab114f86b76b3d9bb9fae9087c24截图.png)




初始化分配固定的内存，即32MB。然后把 32MB 划分为 N 多个内存块，一个内存块默认是16KB，这样缓冲池里就会有很多的内存块。然后如果需要创建一个新的 Batch，就从缓冲池里取一个 16KB 的内存块就可以了。

接着如果 Batch 数据被发送到 Kafka 服务端了，此时 Batch 底层的内存块就直接还回缓冲池就可以了。这样循环往复就可以利用有限的内存，那么就不涉及到垃圾回收了。没有频繁的垃圾回收，自然就避免了频繁导致的工作线程的停顿了

## **kafka的语义保证
**

![](images/WEBRESOURCE58fb42adb445387c307b1c157766729c截图.png)

![](images/WEBRESOURCEbfa9511d50d3b8d9464b7cbd4375fb21截图.png)

mq的消息发送方式

kafka： 不关心返回、同步、异步（回调）

rocketMq: 同步、异步和OneWay(同kafka的不关心结果)。

## **rocketMq和kafka的存储和部分细节**

[https://zhuanlan.zhihu.com/p/431590257](https://zhuanlan.zhihu.com/p/431590257)

[https://zhuanlan.zhihu.com/p/643661946?utm_psn=1845228963422691328](https://zhuanlan.zhihu.com/p/643661946?utm_psn=1845228963422691328)

RocketMQ 存储的文件主要包括 Commitlog 文件、ConsumeQueue 文件、Index 文件

在 RocketMQ 中顺序写入到 Commitlog 文件后，ConsumeQueue 与 Index 文件都是异步构建的

Commitlog 文件的设计理念是追求极致的消息写，但我们知道消息消费模型是基于主题的订阅机制，即一个消费组是消费特定主题的消息。如果根据主题从 commitlog 文件中检索消息，我们会发现这绝不是一个好主意，只能从文件的第一条消息逐条检索，其性能可想而知，故为了解决基于 topic 的消息检索问题，RocketMQ 引入了 consumequeue 文件，consumequeue 的结构如下图所示。

Consumequeue 的设计极具技巧，每个条目长度固定（8 字节 commitlog 物理偏移量、4 字节消息长度、8 字节 tag hashcode）。

这里不是存储 tag 的原始字符串，而选择存储 hashcode，目的就是确保每个条目的长度固定，可以使用访问类似数组下标的方式快速定位条目，极大地提高了 ConsumeQueue 文件的读取性能。

RocketMQ 引入了 Index 索引文件，实现基于文件的哈希索引。IndexFile 的文件存储结构如下图所示：

```
RocketMQ根目录/
├── store/  # Broker核心数据存储目录（由storePathRootDir配置）
│   ├── commitlog/  # 所有主题的消息统一存储区（顺序写）
│   │   ├── 00000000000000000000  # 消息数据文件（固定1G/个，按偏移量递增命名）
│   │   ├── 000000000000001073741824  # 滚动生成的下一个文件（1G=1073741824字节）
│   │   └── ...
│   ├── consumequeue/  # 消费队列目录（按主题-队列维度索引commitlog）
│   │   ├── TopicA/  # 主题A
│   │   │   ├── 0/  # 队列0
│   │   │   │   ├── 00000000000000000000  # 队列数据文件（30W条/个，固定20字节/条）
│   │   │   │   ├── 00000000000000000001
│   │   │   │   └── ...
│   │   │   ├── 1/  # 队列1（结构同队列0）
│   │   │   └── ...  # 其他队列
│   │   ├── TopicB/  # 主题B
│   │   └── ...
│   ├── index/  # 索引文件目录（支持按key查询消息）
│   │   ├── 20250714120000.index  # 索引文件（按时间戳命名）
│   │   ├── 20250714120000.index.lock  # 索引文件写锁
│   │   └── ...
│   ├── checkpoint  # 存储刷盘检查点（记录commitlog、consumequeue、index的最新刷盘位置）
│   ├── abort  # 异常关闭标记（Broker启动时检测，存在则触发数据恢复）
│   └── lock/  # 存储目录锁（防止多Broker实例同时操作同一存储目录）
│       └── unlock  # 锁文件（正常运行时存在，确保存储独占访问）
│
├── logs/  # 运行日志目录（与数据文件分离）
│   ├── broker.log  # Broker运行日志
│   ├── namesrv.log  # NameServer运行日志
│   └── ...
│
├── namesrv/  # NameServer数据目录（可选，存储路由元数据缓存）
│   └── namesrv.properties  # NameServer配置文件
│
└── config/  # 配置文件目录
    ├── broker.conf  # Broker核心配置（存储路径、主题队列数等）
    ├── namesrv.conf  # NameServer配置
    └── logback.xml  # 日志配置
```


    

![](images/WEBRESOURCE78b13b2cd0a6498bf225650812269e62截图.png)




IndexFile 文件基于物理磁盘文件实现 Hash 索引。其文件由 40 字节的文件头、500万 个 Hash 槽，每个 Hash 槽 4 个字节，最后由 2000万 个 Index 条目，每个条目由 20个 字节构成，分别为 4 字节索引 key 的 hashcode、8 字节消息物理偏移量、4 字节时间戳、4 字节的前一个 Index 条目（Hash 冲突的链表结构）。

即建立了索引 Key 的 hashcode 与物理偏移量的映射关系，根据 key 先快速定义到 commitlog 文件。

**kafka**

每个 Topic 的消息被一个或者多个 Partition 进行管理，Partition 是一个有序的，不变的消息队列，消息总是被追加到尾部。一个 Partition 不能被切分成多个散落在多个 broker 上或者多个磁盘上。

它作为消息管理名义上最大的管家内里其实是由很多的 Segment 文件组成。如果一个 Partition 是一个单个非常长的文件的话，那么这个查找操作会非常慢并且容易出错。为解决这个问题，Partition 又被划分成多个 Segment 来组织数据。Segment 并不是终极存储，在它的下面还有两个组成部分：

- 索引文件：以 *.index* 后缀结尾，存储当前数据文件的索引；

- 数据文件：以 *.log* 后缀结尾，存储当前索引文件名对应的数据文件。

- 

![](images/WEBRESOURCEe7da4ccab3c2d5070558f9ab7871c685image.png)


    

![](images/WEBRESOURCE0c5ad69677c31895b0441b315f060cc6截图.png)




Segment 文件的命名规则是： 某个 Partition 全局的第一个 Segment 从 0 开始，后续每个 Segment 文件名以当前 Partition 的最大 offset(消息偏移量)为基准,文件名长度为 64 位 long 类型，19 位数字字符长度，不足部分用 0 填充。

首先会根据 offset 值去查找 Segment 中的 index 文件，因为 index 文件是以上个文件的最大 offset 偏移命名的所以可以通过二分法快速定位到索引文件。

找到索引文件后，索引文件中保存的是 offset 和对应的消息行在 log 日志中的存储型号，因为 Kafka 采用稀疏矩阵的方式来存储索引信息，并不是每一条索引都存储，所以这里只是查到文件中符合当前 offset 范围的索引。

拿到 当前查到的范围索引对应的行号之后再去对应的 log 文件中从 当前 Position 位置开始查找 offset 对应的消息，直到找到该 offset 为止。

## Kafka的重平衡


Kafka提供了三种再平衡策略：Round Robin（轮询），Range（范围）和Sticky（粘性）。

- Round Robin（轮询）： 这种策略会以轮询的方式将所有分区依次分配给消费者，确保每个消费者都能均匀地获得分区。

- Range（范围）： Range策略首先计算每个消费者可以消费的分区个数，然后按照顺序将指定个数范围的分区分配给各个消费者。这有助于均衡分配消费压力。

- Sticky（粘性）： Sticky是较新版本中新增的策略，旨在解决Round Robin和Range策略可能导致某些消费者负载过重的问题。Sticky策略在保持均衡的基础上，尽可能保持未宕机的消费者仍然消费它们之前负责的分区，以减少不必要的再平衡。

再平衡会在以下情况发生时触发：

1. 新增或删除消费者：当消费者组中新增或删除消费者时，需要重新分配分区。

1. 消费者订阅主题发生变化：例如，使用正则表达式

[](https://zhida.zhihu.com/search?content_id=629531125&content_type=Answer&match_order=1&q=%E6%AD%A3%E5%88%99%E8%A1%A8%E8%BE%BE%E5%BC%8F&zhida_source=entity)3. 主题新增分区：如果消费者订阅的主题发生新增分区的情况，新增的分区需要被分配给消费者

[https://www.zhihu.com/question/495501697/answer/3296985757](https://www.zhihu.com/question/495501697/answer/3296985757)

Kafka的重平衡其实包含两个非常重要的阶段：消费组加入阶段(PreparingRebalance)、队列负载(CompletingRebalance).

PreparingRebalance：此阶段是消费者陆续加入消费组，该组第一个加入的消费者被推举为Leader，当该组所有已知memberId的消费者全部加入后，状态驱动到CompletingRebalance。

CompletingRebalance：PreparingRebalance状态完成后，如果消费者被推举为Leader，Leader会采用该消费组中都支持的队列负载算法进行队列分布，然后将结果回报给组协调器；如果消费者的角色为非Leader，会向组协调器发送同步队列分区算法，组协调器会将Leader节点分配的结果分配给消费者。

重平衡的过程

1. 触发条件：重平衡可以通过多种方式触发，包括但不限于消费者组内的成员发生变化（如消费者加入、退出）、主题的分区数量变化等。

1. 准备阶段：一旦检测到需要进行重平衡，Kafka 会选定一个协调者（Coordinator）。所有属于该消费者组的消费者将向协调者发送心跳来表明自己仍然活跃，并准备参与新一轮的分配。

1. 选举领导者：在某些情况下，比如使用了KafkaConsumer.assign()手动分配分区时，不会执行此步骤。但在自动订阅模式下，协调者会在所有存活的消费者中选择一个作为领导者来进行具体的分配决策。

1. 分配策略计算：由选出的领导者根据当前存活的消费者列表以及要消费的主题分区情况，采用特定算法（如Range Assignment或Round Robin Assignment等）来决定如何最公平地分配这些分区给每个消费者。

1. 同步与应用新分配：领导者将计算好的分配方案发送给协调者，然后协调者再广播给所有的消费者。消费者收到新分配后开始按照新的配置拉取消息。

**重平衡过程中可能出现的问题**

- 服务中断：在整个重平衡期间，整个消费者组实际上处于暂停状态，直到所有成员都接收到新的分配并且确认为止。这意味着在这段时间内，消息处理会被暂时停止。

- 频繁发生导致效率低下：如果消费者频繁地加入或离开组，则会导致连续不断的重平衡操作，这不仅增加了网络开销，也降低了整体的消息吞吐量。

- 不均匀的数据分布：虽然Kafka提供了几种不同的分配策略来尝试优化负载均衡，但在实际部署中，由于各种因素的影响，有时候可能会出现部分消费者负担过重而其他消费者则相对空闲的情况。

- 长时间阻塞：在极端情况下，如果某个消费者无法及时响应或者协调过程中出现了错误，可能导致整个重平衡过程被卡住，进而影响整个系统的正常运行。

## Kafka的消息投递/幂等

[https://mp.weixin.qq.com/s/GxPT-MfoGvsDsEP--4z8WA](https://mp.weixin.qq.com/s/GxPT-MfoGvsDsEP--4z8WA)

## kafka 的 ISR 机制

**AR (Assigned Replicas)：**

定义：AR 是指分配给某个主题的分区的所有副本的集合。

作用：AR 包括所有的副本，无论是领导者（Leader）副本还是跟随者（Follower）副本。这些副本分布在不同的Broker上，以确保高可用性和数据冗余。

**ISR (In-Sync Replicas)：**

定义：ISR 是指与领导者副本保持同步的副本集合。

作用：ISR 中的副本被认为是“同步”的，即它们与领导者副本的数据是一致的。只有 ISR 中的副本才有资格成为新的领导者副本。

**OSR (Out-of-Sync Replicas)：**

定义：OSR 是指与领导者副本不同步的副本集合。

作用：OSR 中的副本落后于领导者副本，可能因为网络延迟、Broker 故障等原因导致数据不一致。这些副本不能成为新的领导者副本，直到它们重新同步到 ISR 中。

在分区中，所有副本统称为 AR ，Leader 维护了一个动态的 in-sync replica(ISR),ISR 是指与 leader 副本保持同步状态的副本集合。当然 leader 副本本身也是这个集合中的一员。

当 ISR 中的 follower 完成数据同步之后， leader 就会给 follower 发送 ack ,如果其中一个 follower 长时间未向 leader 同步数据，该 follower 将会被踢出 ISR 集合，该时间阈值由 replica.log.time.max.ms 参数设定。当 leader 发生故障后，就会从 ISR 集合中重新选举出新的 leader。

## kafka中LEO、HW、LSO、LW 分别代表什么

- LEO ：是 LogEndOffset 的简称，代表当前日志文件中下一条。

- HW：水位或水印一词，也可称为高水位（high watermark）,通常被用在流式处理领域（flink、spark），以表征元素或事件在基于时间层面上的进展。在 kafka 中，水位的概念与时间无关，而是与位置信息相关。严格来说，它表示的就是位置信息，即位移（offset）。取 partition 对应的ISR中最小的 LEO作为HW，consumer 最多只能消费到 HW 所在的上一条信息。

- LSO: 是 LastStableOffset 的简称，对未完成的事务而言，LSO 的值等于事务中第一条消息的位置（firstUnstableOffset），对已完成的事务而言，它的值同HW 相同。

- LW: Low Watermark 低水位，代表AR 集合中最小的 logStartOffset 值。

![](images/WEBRESOURCEe9f8824a764083f24a4d614b4d2a6f06image.png)

## kafka 是如何清理过期数据的

kafka 将数据持久化到了硬盘上，允许你配置一定的策略对数据清理，清理的策略有两个，删除和压缩。

数据清理的方式

1、删除

log.cleanup.policy=delete 启用删除策略

直接删除，删除后的消息不可恢复。可配置以下两个策略：

#清理超过指定时间清理：  

log.retention.hours=16

#超过指定大小后，删除旧的消息：

log.retention.bytes=1073741824

为了避免在删除时阻塞读操作，采用了 copy-on-write 形式的实现，删除操作进行时，读取操作的二分查找功能实际是在一个静态的快照副本上进行的，这类似于 Java 的 CopyOnWriteArrayList。

2、压缩

将数据压缩，只保留每个 key 最后一个版本的数据。

首先在 broker 的配置中设置 log.cleaner.enable=true 启用 cleaner，这个默认是关闭的。

在 topic 的配置中设置 log.cleanup.policy=compact 启用压缩策略

## RocketMq 如何保证消费顺序性

[https://blog.csdn.net/crazymakercircle/article/details/135416965](https://blog.csdn.net/crazymakercircle/article/details/135416965)

[https://blog.csdn.net/zsq1233ddd/article/details/143191477](https://blog.csdn.net/zsq1233ddd/article/details/143191477)

![](images/WEBRESOURCE64c7daf701c79e96f275bb06bee5dee4image.png)

**第一把锁：broker端的分布式锁**

正常的逻辑，如果保证一个分区，分配到也仅仅分配到一个client，就需要布式锁，比如redis分布式锁。

RocketMQ没有用redis分布式锁，而是自研分布式锁，在broker中设置分布式锁，所以broker直接充当redis这些角色而已。

所以，在 RocketMQ 的 broker端：

通过分布式锁，实现一个分区 queue 绑定到一个消费者client，

并且 broker 设置一个专门的管理器，来管理分布式锁。

**第二把锁：broker端的全局锁**

一个分区配备一把锁，分布式锁this.mqLockTable 是一个 ConcurrentMap。

为了保证分布式锁操作的原子性，brocker设置一个专门的管理器，来管理分布式锁。

**客户端两级锁**

MQClientInstance 客户端实例，会开启多个异步并行服务：

负载均衡服务 rebalanceService：再平衡服务， 专门进行 queue分区的 再平衡，再分配

消息拉取服务 pullMessageService：专门拉取消息，通过内部实现类DefaultMQPushConsumerImpl 拉取

消息消费线程：ConsumeMessageOrderlyService 有序消息消费