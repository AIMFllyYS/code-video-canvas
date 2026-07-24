---
kind: external_dependency
name: Drizzle ORM + better-sqlite3 本地数据库
slug: drizzle-sqlite
category: external_dependency
category_hints:
    - migration_status
scope:
    - '**'
---

### 数据层现状
- Demo 阶段采用 SQLite（better-sqlite3）+ Drizzle ORM，单文件本地存储，零外部服务。
- 表结构：projects、canvas_nodes（含九种 CanvasNodeType 与六态 NodeStatus）、canvas_edges、jobs（进程内队列后端）、artifacts（产物索引）、settings（键值对，含 StepFun Key）。
- 后续规模化才考虑迁移至 Postgres/MinIO 等适配器。