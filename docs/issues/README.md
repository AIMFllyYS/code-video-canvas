# docs/issues/

本目录保存问题证据与实施计划。v3 当前入口是
[`refactor-v3/`](./refactor-v3/)；历史 `issue-01` 至 `issue-13` 和
[`known-issues.md`](./known-issues.md) 保留 Demo v1 的诊断事实，但不再是新的 Goal
状态账本。

## v3 职责

| 文件 | 职责 |
|---|---|
| `refactor-v3/issue-n*.md` | N0–N7 的详细、可执行 Implementation Plan |
| `2026-07-24-refactor-v3-task-breakdown.md` | 唯一 Task 状态与依赖账本，位于 `docs/specs` |
| 旧 issue | 历史诊断、复现与技术债证据 |

Track Issue 可以定义：

- 精确文件范围与禁止范围；
- Task 依赖；
- RED→GREEN 步骤；
- focused verification；
- Track exit gate；
- commit boundary。

Track Issue 不得独立维护第二份任务状态，不得改变 Product/Architecture 决策。需要改变
合同必须先修订活动 Spec/ADR，再更新 Task Breakdown。

## 命名

- `refactor-v3/issue-n0-*.md` 至 `issue-n7-*.md` — v3 Track 计划；
- `issue-<number>-<brief>.md` — 历史或独立问题；
- `known-issues.md` — Demo v1 历史索引。

## GitHub Issues

本目录是仓库内可版本化证据；GitHub Issues 可用于团队协作，但不能取代活动 Spec 与
Task Breakdown 的规范/状态职责。
