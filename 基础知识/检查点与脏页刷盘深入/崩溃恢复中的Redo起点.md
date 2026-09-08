# 崩溃恢复中的Redo起点

> 对应 Mohan 1992 ARIES 的 Redo 阶段与「重复历史」原则，参考 Silberschatz 第17章。

## 一、背景与挑战
崩溃后数据库可能处于「已提交事务未刷盘、未提交事务部分落盘」的混合状态。必须找到一个安全的 Redo 起点，既不多做也不少做，保证已提交不丢、未提交可回滚。

## 二、核心原理
ARIES 采用「重复历史」（repeat history）：从最后一个检查点开始重放所有日志记录（无论事务是否提交），把数据库恢复到崩溃前瞬间，再对未提交事务做 Undo。Redo 起点是检查点记录中最早脏页的 LSN（即 `redo_lsn`）。

## 三、形式化与数学基础
$$ LSN_{redo} = \min\{ LSN(p) \mid p \text{ 是检查点时的脏页} \} $$
重放区间 $[LSN_{redo}, LSN_{end}]$，再 Undo 活跃事务区间，保证 ACID。

## 四、代码实现
```c
// 伪代码：ARIES 恢复
analyse();   // 确定 redo_lsn 与活跃事务
redo();      // 从 redo_lsn 重放所有记录
undo();      // 对未提交事务逆序回滚
```

## 五、与其他技术对比
非 ARIES 系统（如某些 LSM）依赖 SSTable 不可变与 manifest，恢复即加载最新 manifest 指向的文件，逻辑更简单。ARIES 的精细 Redo/Undo 适合原地更新引擎。

## 六、常见误区
认为 Redo 只重做已提交事务——ARIES 先全重放再 Undo 未提交，逻辑上等价于「重复历史」。认为检查点后日志可全删——需 `redo_lsn` 之后都保留。

## 七、与开源书/权威来源对应
Mohan 1992 ARIES 全文（尤其 Analysis/Redo/Undo 三阶段）；Silberschatz 17.6「ARIES」。

## 八、面试题
问：为什么 ARIES 要先 Redo 全部再 Undo？答：把库先恢复到崩溃前状态（含未提交修改），再统一回滚未提交事务，逻辑清晰且幂等。

## 九、演进与趋势
并行 Redo（多线程重放日志）加速大库恢复；物理 Redo 与逻辑 Redo 混合进一步提速。

## 十、小结
Redo 起点由检查点脏页 LSN 决定，配合「重复历史」原则实现精确崩溃恢复。
