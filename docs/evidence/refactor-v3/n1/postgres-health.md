# N1.2 Docker Postgres Health 证据

- Task：`N1.2`
- 状态：`done`
- 日期：2026-07-25
- 分支：`main`
- 实现 commit：`513bb1d`
- evidence class：`runtime-local`
- workflowVersion：`cvc-v3-foundation|cvc-arch-v3.0.0|legacy-html-v1|legacy-cvc-render-v1|node22-playwright1.61.1-ffmpeg-static5.3.0`
- push：`false`

## 1. 固定 Compose 合同

`docker-compose.dev.yml` 的实际展开配置与 N1.2 合同一致：

| 项 | 结果 |
|---|---|
| service | `postgres` |
| image | `postgres:17.5-alpine` |
| host bind | `127.0.0.1:54327 -> 5432/tcp` |
| data volume | `cvc_postgres_dev:/var/lib/postgresql/data` |
| init mount | `scripts/setup/postgres-init.sql` 只读挂载 |
| test DB init | 只创建 owner 为 `cvc` 的 `cvc_test` |
| healthcheck | `pg_isready -U cvc -d cvc` |

本证据不记录容器环境变量、throwaway password 或数据库连接串。

## 2. 真实运行结果

| 命令 | 结果 |
|---|---|
| `docker compose -f docker-compose.dev.yml config --quiet` | exit 0 |
| `docker compose -f docker-compose.dev.yml up -d --wait postgres` | exit 0 |
| `docker compose -f docker-compose.dev.yml ps postgres` | exit 0 |

真实 `ps` 摘要显示 image 为 `postgres:17.5-alpine`，状态为 `healthy`，端口只发布到
`127.0.0.1:54327`。最终数据库只读查询返回 `server_version=17.5`。

## 3. Exit gate

A01 通过：锁定版本的 Docker Postgres 已真实启动并通过 healthcheck；没有发布到
非 loopback 地址，也没有把配置解析成功冒充为容器健康。
