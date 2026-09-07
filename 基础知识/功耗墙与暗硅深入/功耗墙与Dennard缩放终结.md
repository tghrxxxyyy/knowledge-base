# 功耗墙与 Dennard 缩放终结

> 对应 Hennessy & Patterson 量化方法"功耗墙"章与 Dennard 缩放定律。

## 一、背景与挑战
Dennard 缩放曾保证：晶体管尺寸减半，电压与电流同降，功耗密度不变、频率可升。但 2005 年前后该定律失效，电压无法继续同比降低，导致功耗随核数/频率平方上升，撞上"功耗墙"。

## 二、核心原理
动态功耗 $P = \alpha C V^2 f$，漏电功耗随工艺缩小而上升。当 $V$ 不能降，提升频率使 $P\propto f$ 且 $V$propto f$ 推高 $V^2$，功率爆炸。因此单核频率停滞，产业转向多核。

## 三、形式化与数学基础
动态功耗：
$$P_{dyn} = \alpha C V_{dd}^2 f$$
漏电随温度/工艺：
$$I_{leak} \propto e^{\frac{V_t}{nV_T}}$$
总功耗受限 $P_{budget}$，可激发晶体管数受：
$$N_{active} \le \frac{P_{budget}}{P_{per\_core}}$$

## 四、代码实现
```python
# 估算频率提升的功耗代价
def power(f, V, C=1e-9, alpha=0.5):
    return alpha * C * V*V * f

for f in [2e9, 3e9, 4e9]:
    V = 0.8 + 0.3*(f/2e9 - 1)   # 电压随频率上升
    print(f, "GHz power=", power(f, V))
# 显示功率随频率超线性增长
```

## 五、与其他技术对比
Dennard 时代靠缩放进性能；后 Dennard 时代靠并行（多核）但受阿姆达尔与暗硅限制；仅靠频率已不可行。

## 六、常见误区
误以为工艺进步就自动更快：受功耗墙约束频率停滞。误以为多核线性加速：受串行比例限制。

## 七、与开源书/权威来源对应
量化方法功耗墙与暗硅；Hennessy & Patterson 图灵奖文章《Computer Architecture: A New Golden Age》。

## 八、面试题
问：为何 Dennard 终结后频率不再涨？答：电压不能同比降，功率随频率超线性上升触顶。

## 九、演进与趋势
转向专用加速器、近阈值计算、chiplet 与 3D 集成缓解。

## 十、小结
功耗墙标志着"免费性能"时代结束，架构创新（而非工艺）成为主旋律。
