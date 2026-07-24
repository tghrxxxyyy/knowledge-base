## ES的整体结构

![](images/WEBRESOURCEabe528d18ed7248fcdf11844f4ce0361截图.png)

- 一个 ES Index 在集群模式下，有多个 Node （节点）组成。每个节点就是 ES 的Instance (实例)。

- 每个节点上会有多个 shard （分片）， P1 P2 是主分片, R1 R2 是副本分片

- 每个分片上对应着就是一个 Lucene Index（底层索引文件）

- Lucene Index 是一个统称

	- 由多个 Segment （段文件，就是倒排索引）组成。每个段文件存储着就是 Doc 文档。

	- commit point记录了所有 segments 的信息

***补充lucene索引结构：***

![](images/WEBRESOURCEea934d9559d710b878191319d5d48ab8截图.png)

## ES存储的流程

![](images/WEBRESOURCEc023a6ef5e9a3145f105c4deaf1b8857截图.png)