# 图谱 RAG GraphRAG

> 对应微软 GraphRAG 与 llm-course 进阶。用知识图谱增强全局问答。

## 一、核心概念

传统 RAG 擅长「点查」。GraphRAG 在离线阶段用 LLM 从文档抽取**实体-关系**构建知识图谱，并做社区摘要；在线阶段既能向量检索，也能图遍历回答「某主题的整体趋势」类全局问题。

## 二、关键要点

- 实体/社区级摘要弥补局部检索的全局盲点。
- 成本高（离线抽取+摘要），适合知识密集型全局问答。

## 三、与开源书的对应

- Microsoft GraphRAG: https://github.com/microsoft/graphrag

## 七、面试题

- GraphRAG 相比传统 RAG 解决了哪类问题？
