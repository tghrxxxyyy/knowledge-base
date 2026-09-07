# 火焰图可视化与SVG

> 对应 Brendan Gregg Flame Graphs (github.com/brendangregg/FlameGraph)。

## 一、背景与挑战
聚合的栈文本难以直观看出瓶颈。火焰图用宽度编码占用、纵向编码调用深度，使最宽框即最热路径一目了然。

## 二、核心原理
折叠格式 `main;foo;bar 123` 表示栈与采样数。火焰图自底向上为调用链，框宽正比于该函数(含子调用)采样占比。可点击放大、搜索高亮。

## 三、形式化与数学基础
框宽映射：
$$ w_i = \frac{C_i}{\sum_{root} C} \times W_{total} $$
同层框总宽 = 父框宽；颜色通常无语义(默认随机/热度)。

## 四、代码实现
```bash
# 折叠格式示例与绘制
echo "main;compute;matmul 500" > a.folded
echo "main;compute;sort 120"  >> a.folded
echo "main;io;read 80"        >> a.folded
./flamegraph.pl a.folded > a.svg
# 注释：宽度比例 500:120:80 对应三层子调用
```

## 五、与其他技术对比
火焰图展示聚合分布；时序图(如 offcputime)展示时间演化。二者互补，火焰图更利于定位稳定热点。

## 六、常见误区
框高代表深度而非时间。误把最顶框直接当优化目标——要看其宽度是否含大量子孙。

## 七、与开源书/权威来源对应
brendangregg/FlameGraph 仓库含 stackcollapse 与 flamegraph 脚本；CSAPP perf 章节。

## 八、面试题
火焰图宽度/高度含义？如何识别主瓶颈？折叠格式是什么？

## 九、演进与趋势
交互式(d3)火焰图、差分火焰图(diff)、冰柱图(icicle)反向展示。

## 十、小结
火焰图以宽度量化占用、深度展示调用，是定位热路径的视觉利器，需配合正确采样。
