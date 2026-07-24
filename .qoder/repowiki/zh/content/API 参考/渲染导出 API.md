# 渲染导出 API

<cite>
**本文引用的文件**   
- [src/app/api/render/route.ts](file://src/app/api/render/route.ts)
- [src/app/api/render/export/route.ts](file://src/app/api/render/export/route.ts)
- [src/app/api/jobs/[id]/route.ts](file://src/app/api/jobs/[id]/route.ts)
- [src/app/canvas/export/export-api.ts](file://src/app/canvas/export/export-api.ts)
- [src/features/render/renderer.ts](file://src/features/render/renderer.ts)
- [src/features/render/queue-handler.ts](file://src/features/render/queue-handler.ts)
- [src/features/render/export-service.ts](file://src/features/render/export-service.ts)
- [src/features/render/repository.ts](file://src/features/render/repository.ts)
- [src/features/render/types.ts](file://src/features/render/types.ts)
- [src/components/ui/queue-status-bar.tsx](file://src/components/ui/queue-status-bar.tsx)
</cite>

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [详细组件分析](#详细组件分析)
6. [依赖关系分析](#依赖关系分析)
7. [性能考虑](#性能考虑)
8. [故障排查指南](#故障排查指南)
9. [结论](#结论)
10. [附录](#附录)

## 简介
本文件为“渲染导出模块”的 API 文档，聚焦于视频渲染与导出的 RESTful 接口。内容涵盖：
- 渲染任务提交、进度查询、格式转换与文件下载端点
- 请求参数与响应数据结构说明
- 完整渲染工作流示例（参数配置、进度跟踪、结果处理）
- 渲染队列管理、并发控制与资源优化策略
- 性能调优建议与故障排查指南

## 项目结构
渲染导出相关代码主要分布在以下位置：
- API 路由层：Next.js App Router 下的 /api/render、/api/render/export、/api/jobs/[id]
- 前端导出交互：canvas/export/export-api.ts
- 渲染核心：features/render 下的 renderer、queue-handler、export-service、repository、types

```mermaid
graph TB
subgraph "API 路由层"
R["/api/render"] --> RE["/api/render/export"]
J["/api/jobs/:id"]
end
subgraph "前端导出交互"
EA["export-api.ts"]
end
subgraph "渲染核心"
QH["queue-handler.ts"]
RS["renderer.ts"]
ES["export-service.ts"]
RP["repository.ts"]
TP["types.ts"]
end
EA --> R
R --> QH
R --> RS
RE --> ES
J --> RP
QH --> RS
ES --> RP
```

图表来源
- [src/app/api/render/route.ts](file://src/app/api/render/route.ts)
- [src/app/api/render/export/route.ts](file://src/app/api/render/export/route.ts)
- [src/app/api/jobs/[id]/route.ts](file://src/app/api/jobs/[id]/route.ts)
- [src/app/canvas/export/export-api.ts](file://src/app/canvas/export/export-api.ts)
- [src/features/render/queue-handler.ts](file://src/features/render/queue-handler.ts)
- [src/features/render/renderer.ts](file://src/features/render/renderer.ts)
- [src/features/render/export-service.ts](file://src/features/render/export-service.ts)
- [src/features/render/repository.ts](file://src/features/render/repository.ts)
- [src/features/render/types.ts](file://src/features/render/types.ts)

章节来源
- [src/app/api/render/route.ts](file://src/app/api/render/route.ts)
- [src/app/api/render/export/route.ts](file://src/app/api/render/export/route.ts)
- [src/app/api/jobs/[id]/route.ts](file://src/app/api/jobs/[id]/route.ts)
- [src/app/canvas/export/export-api.ts](file://src/app/canvas/export/export-api.ts)
- [src/features/render/renderer.ts](file://src/features/render/renderer.ts)
- [src/features/render/queue-handler.ts](file://src/features/render/queue-handler.ts)
- [src/features/render/export-service.ts](file://src/features/render/export-service.ts)
- [src/features/render/repository.ts](file://src/features/render/repository.ts)
- [src/features/render/types.ts](file://src/features/render/types.ts)

## 核心组件
- 渲染队列处理器（Queue Handler）：负责任务入队、出队、并发控制、重试与状态流转
- 渲染器（Renderer）：执行帧捕获、编码、合成等具体渲染步骤
- 导出服务（Export Service）：封装导出流程（如转码、拼接、生成缩略图），协调存储与产物
- 仓库（Repository）：持久化渲染任务、进度、产物元数据与下载链接
- 类型定义（Types）：统一任务、进度、产物、错误等数据结构

章节来源
- [src/features/render/queue-handler.ts](file://src/features/render/queue-handler.ts)
- [src/features/render/renderer.ts](file://src/features/render/renderer.ts)
- [src/features/render/export-service.ts](file://src/features/render/export-service.ts)
- [src/features/render/repository.ts](file://src/features/render/repository.ts)
- [src/features/render/types.ts](file://src/features/render/types.ts)

## 架构总览
整体采用“API 路由 + 队列 + 渲染引擎 + 存储服务”的分层架构。客户端通过 REST 接口提交渲染任务或导出请求，服务端将任务入队并异步执行；进度通过任务 ID 轮询获取；最终产物通过下载接口获取。

```mermaid
sequenceDiagram
participant Client as "客户端"
participant RenderAPI as "/api/render"
participant ExportAPI as "/api/render/export"
participant Queue as "队列处理器"
participant Renderer as "渲染器"
participant ExportSvc as "导出服务"
participant Repo as "仓库"
Client->>RenderAPI : "POST /api/render (提交渲染任务)"
RenderAPI->>Queue : "入队(任务参数)"
Queue-->>RenderAPI : "返回任务ID"
RenderAPI-->>Client : "{ taskId }"
Client->>ExportAPI : "POST /api/render/export (导出/转码)"
ExportAPI->>ExportSvc : "执行导出流程"
ExportSvc->>Repo : "记录产物元数据"
ExportSvc-->>ExportAPI : "返回导出任务ID"
ExportAPI-->>Client : "{ exportTaskId }"
Client->>RenderAPI : "GET /api/render?taskId=..." (可选 : 进度)
RenderAPI-->>Client : "{ status, progress }"
Client->>ExportAPI : "GET /api/render/export?exportTaskId=...&format=..." (可选 : 查询/下载)
ExportAPI-->>Client : "文件或JSON(含下载链接)"
```

图表来源
- [src/app/api/render/route.ts](file://src/app/api/render/route.ts)
- [src/app/api/render/export/route.ts](file://src/app/api/render/export/route.ts)
- [src/app/api/jobs/[id]/route.ts](file://src/app/api/jobs/[id]/route.ts)
- [src/features/render/queue-handler.ts](file://src/features/render/queue-handler.ts)
- [src/features/render/renderer.ts](file://src/features/render/renderer.ts)
- [src/features/render/export-service.ts](file://src/features/render/export-service.ts)
- [src/features/render/repository.ts](file://src/features/render/repository.ts)

## 详细组件分析

### 渲染任务提交接口
- HTTP 方法：POST
- URL 模式：/api/render
- 功能：提交一个渲染任务，包含分辨率、帧率、时长、编码参数、输出格式等
- 请求体字段（示例）：
  - resolution: 对象，包含 width、height
  - fps: 数字
  - duration: 数字（秒）
  - codec: 字符串（如 h264/h265）
  - outputFormat: 字符串（如 mp4/webm）
  - quality: 字符串或数字（如 high/medium/low 或比特率）
  - metadata: 对象（可选，用于附加业务信息）
- 响应数据：
  - taskId: 字符串（唯一任务标识）
  - status: 字符串（如 queued/processing/completed/failed）
  - message: 字符串（可选提示）
- 错误处理：
  - 参数校验失败返回 400
  - 队列满或资源不足返回 429/503
  - 内部错误返回 500

章节来源
- [src/app/api/render/route.ts](file://src/app/api/render/route.ts)
- [src/features/render/types.ts](file://src/features/render/types.ts)

### 渲染进度查询接口
- HTTP 方法：GET
- URL 模式：/api/render?taskId={taskId}
- 功能：根据任务 ID 查询渲染任务的状态与进度
- 查询参数：
  - taskId: 字符串（必填）
- 响应数据：
  - taskId: 字符串
  - status: 字符串（queued/processing/completed/failed）
  - progress: 数字（0~100）
  - error: 字符串（可选，失败原因）
  - result: 对象（可选，完成时包含产物信息）
- 错误处理：
  - 未找到任务返回 404
  - 参数缺失返回 400

章节来源
- [src/app/api/render/route.ts](file://src/app/api/render/route.ts)
- [src/features/render/repository.ts](file://src/features/render/repository.ts)

### 导出/格式转换接口
- HTTP 方法：POST
- URL 模式：/api/render/export
- 功能：对已有渲染产物进行格式转换、压缩、拼接等导出操作
- 请求体字段（示例）：
  - sourceId: 字符串（源产物 ID）
  - targetFormat: 字符串（如 mp4/webm/avi）
  - bitrate: 数字（可选，目标比特率）
  - scale: 数字（可选，缩放比例）
  - metadata: 对象（可选）
- 响应数据：
  - exportTaskId: 字符串（导出任务 ID）
  - status: 字符串（queued/processing/completed/failed）
  - message: 字符串（可选）
- 错误处理：
  - 源产物不存在返回 404
  - 参数非法返回 400
  - 转码失败返回 500

章节来源
- [src/app/api/render/export/route.ts](file://src/app/api/render/export/route.ts)
- [src/features/render/export-service.ts](file://src/features/render/export-service.ts)
- [src/features/render/types.ts](file://src/features/render/types.ts)

### 导出进度查询接口
- HTTP 方法：GET
- URL 模式：/api/render/export?exportTaskId={exportTaskId}
- 功能：查询导出任务的进度与结果
- 查询参数：
  - exportTaskId: 字符串（必填）
- 响应数据：
  - exportTaskId: 字符串
  - status: 字符串（queued/processing/completed/failed）
  - progress: 数字（0~100）
  - result: 对象（可选，包含下载链接、文件大小、MIME 类型等）
- 错误处理：
  - 未找到导出任务返回 404

章节来源
- [src/app/api/render/export/route.ts](file://src/app/api/render/export/route.ts)
- [src/features/render/repository.ts](file://src/features/render/repository.ts)

### 文件下载接口
- HTTP 方法：GET
- URL 模式：/api/render/download?fileId={fileId}&token={token}
- 功能：安全下载渲染产物或导出产物
- 查询参数：
  - fileId: 字符串（产物文件 ID）
  - token: 字符串（可选，鉴权令牌）
- 响应：二进制文件流
- 错误处理：
  - 文件不存在返回 404
  - 权限不足返回 401/403

章节来源
- [src/app/api/render/export/route.ts](file://src/app/api/render/export/route.ts)
- [src/features/render/repository.ts](file://src/features/render/repository.ts)

### 任务详情查询接口（通用）
- HTTP 方法：GET
- URL 模式：/api/jobs/{jobId}
- 功能：根据作业 ID 查询任务详情（可用于渲染或导出任务）
- 路径参数：
  - jobId: 字符串（任务 ID）
- 响应数据：
  - id: 字符串
  - type: 字符串（render/export）
  - status: 字符串
  - progress: 数字
  - createdAt/updatedAt: 时间戳
  - result: 对象（可选）
- 错误处理：
  - 未找到任务返回 404

章节来源
- [src/app/api/jobs/[id]/route.ts](file://src/app/api/jobs/[id]/route.ts)
- [src/features/render/repository.ts](file://src/features/render/repository.ts)

### 前端导出交互（Canvas Export）
- 模块职责：封装导出相关的 API 调用、状态管理与 UI 反馈
- 关键能力：
  - 发起导出请求（调用 /api/render/export）
  - 轮询导出进度（GET /api/render/export）
  - 触发下载（GET /api/render/download）
  - 展示队列状态（结合 queue-status-bar 组件）

章节来源
- [src/app/canvas/export/export-api.ts](file://src/app/canvas/export/export-api.ts)
- [src/components/ui/queue-status-bar.tsx](file://src/components/ui/queue-status-bar.tsx)

## 依赖关系分析
渲染导出模块的依赖关系如下：
- API 路由依赖队列处理器与仓库
- 导出服务依赖仓库与外部转码工具
- 渲染器依赖编码器与帧捕获模块
- 前端导出模块依赖 API 路由与 UI 组件

```mermaid
classDiagram
class RenderAPI {
+submitRender()
+queryProgress()
}
class ExportAPI {
+startExport()
+queryExportProgress()
+downloadFile()
}
class QueueHandler {
+enqueue(task)
+dequeue()
+getConcurrency()
}
class Renderer {
+captureFrames()
+encode()
+assemble()
}
class ExportService {
+convert(sourceId, format)
+compress()
+generateThumbnails()
}
class Repository {
+saveTask(task)
+updateProgress(id, progress)
+getFile(fileId)
}
RenderAPI --> QueueHandler : "使用"
RenderAPI --> Repository : "读写"
ExportAPI --> ExportService : "委托"
ExportAPI --> Repository : "读写"
QueueHandler --> Renderer : "调度"
ExportService --> Repository : "持久化"
```

图表来源
- [src/app/api/render/route.ts](file://src/app/api/render/route.ts)
- [src/app/api/render/export/route.ts](file://src/app/api/render/export/route.ts)
- [src/app/api/jobs/[id]/route.ts](file://src/app/api/jobs/[id]/route.ts)
- [src/features/render/queue-handler.ts](file://src/features/render/queue-handler.ts)
- [src/features/render/renderer.ts](file://src/features/render/renderer.ts)
- [src/features/render/export-service.ts](file://src/features/render/export-service.ts)
- [src/features/render/repository.ts](file://src/features/render/repository.ts)

章节来源
- [src/app/api/render/route.ts](file://src/app/api/render/route.ts)
- [src/app/api/render/export/route.ts](file://src/app/api/render/export/route.ts)
- [src/app/api/jobs/[id]/route.ts](file://src/app/api/jobs/[id]/route.ts)
- [src/features/render/queue-handler.ts](file://src/features/render/queue-handler.ts)
- [src/features/render/renderer.ts](file://src/features/render/renderer.ts)
- [src/features/render/export-service.ts](file://src/features/render/export-service.ts)
- [src/features/render/repository.ts](file://src/features/render/repository.ts)

## 性能考虑
- 队列并发控制：合理设置最大并发数，避免 CPU/GPU 过载；根据硬件能力动态调整
- 任务优先级：支持高优先级任务插队，保障关键渲染快速完成
- 缓存与去重：相同参数的任务可复用中间结果，减少重复计算
- I/O 优化：批量写入产物、使用流式传输降低内存占用
- 编码参数调优：选择合适的编码器与比特率，平衡质量与体积
- 监控与告警：记录队列长度、平均处理时间、失败率，及时扩容或降级

[本节为通用指导，不直接分析具体文件]

## 故障排查指南
常见问题与定位步骤：
- 任务无法入队：检查队列容量与并发限制；查看系统资源使用情况
- 渲染失败：查看任务错误日志；确认输入素材有效性与编码参数合法性
- 导出失败：验证源产物存在性；检查转码工具链是否可用
- 下载失败：确认文件 ID 与权限令牌；检查存储后端可用性
- 进度不更新：检查仓库写入是否正常；确认轮询间隔与超时设置

章节来源
- [src/features/render/queue-handler.ts](file://src/features/render/queue-handler.ts)
- [src/features/render/renderer.ts](file://src/features/render/renderer.ts)
- [src/features/render/export-service.ts](file://src/features/render/export-service.ts)
- [src/features/render/repository.ts](file://src/features/render/repository.ts)

## 结论
本 API 文档覆盖了渲染与导出的核心接口与工作流，提供了从任务提交到结果下载的完整链路说明。通过合理的队列管理、并发控制与性能调优，可实现稳定高效的视频渲染与导出服务。

[本节为总结性内容，不直接分析具体文件]

## 附录

### 完整渲染工作流示例
- 步骤一：提交渲染任务（POST /api/render）
- 步骤二：轮询进度（GET /api/render?taskId=...）
- 步骤三：等待完成并获取产物信息
- 步骤四：如需格式转换，调用导出接口（POST /api/render/export）
- 步骤五：轮询导出进度（GET /api/render/export?exportTaskId=...）
- 步骤六：下载最终文件（GET /api/render/download?fileId=...&token=...）

章节来源
- [src/app/api/render/route.ts](file://src/app/api/render/route.ts)
- [src/app/api/render/export/route.ts](file://src/app/api/render/export/route.ts)
- [src/app/canvas/export/export-api.ts](file://src/app/canvas/export/export-api.ts)

### 队列状态展示（UI）
- 组件职责：显示当前队列长度、活跃任务数、平均耗时等指标
- 数据来源：通过 API 查询任务状态与队列统计

章节来源
- [src/components/ui/queue-status-bar.tsx](file://src/components/ui/queue-status-bar.tsx)