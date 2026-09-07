# RISC-V后端代码生成

> 对应 Appel《Modern Compiler Implementation》第 8-9 章；RISC-V 规范。

## 一、背景与挑战
RISC-V 是规整的加载-存储架构，无复杂寻址、少指令格式。后端需把 IR 映射到其少量指令与 32 个整数寄存器，体现典型 RISC 后端设计。

## 二、核心原理
RISC-V 仅基址+12 位立即寻址，复杂表达式须先算地址（addi/shift）再 load/store。函数调用用 a0-a7 传参、ra 存返回地址、sp 管理栈帧。后端依次做指令选择（DAG）、寄存器分配（caller/callee 约定）、发射。

## 三、形式化与数学基础
地址合成（大立即需拆分）：
$$imm_{32} = (imm \gg 12) \ll 12 + (imm \& 0xFFF)$$
用 `lui rd, hi` 后 `addi rd, rd, lo` 拼出 32 位常量；栈帧偏移受 12 位限制需经临时寄存器。

## 四、代码实现
```asm
# 调用约定示例
addi sp, sp, -16      # 开栈帧
sd   ra, 8(sp)        # 保存返回地址
li   a0, 5            # 参数
call foo
ld   ra, 8(sp)        # 恢复
addi sp, sp, 16
ret
```

## 五、与其他技术对比
RISC-V 比 x86 编码简单、易于教学与验证；缺少复杂寻址需更多指令，但解码器与流水线更省面积。

## 六、常见误区
1. 大立即未拆分致 lui+addi 溢出符号位需修正。
2. 忘记 ra 是 caller 视角的返回地址需保存。
3. 误用零寄存器 x0 作目标致丢弃结果。

## 七、与开源书/权威来源对应
Appel ch8-9 RISC 后端；RISC-V Unprivileged Spec；LLVM RISCV 后端。

## 八、面试题
问：RISC-V 如何传参？大立即怎么拼？为何无复杂寻址？

## 九、演进与趋势
RISC-V 向量扩展（V）与压缩扩展（C）扩展后端表达能力；LLVM 持续完善。

## 十、小结
RISC-V 后端以规整指令与约定展示 RISC 代码生成的典型流程与权衡。
