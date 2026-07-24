---
kind: design
name: 确立 ShotSourcePackageV1 为唯一产物主合同
source: session
category: adr
---

# 确立 ShotSourcePackageV1 为唯一产物主合同

_来源：1bc7587 → 5c81ef8 提交周期内记录的编码计划——内容为规划时意图，实现可能滞后或有出入。_

**状态：** accepted

## 背景
当前 AI 输出格式混乱：`lastAssistantText()` 丢弃工具结构化数据、HTML 产物无 fence 剥离、raw 与 canonical artifact 未分离，导致产物无法被下游可靠消费。

## 决策驱动
- 产物可靠性
- 类型安全
- 向后兼容
- 诊断能力

## 备选方案
- **ShotSourcePackageV1 结构化契约** — 优点：Zod schema 校验、bodyFragment/css/setupJs/seekJs 字段明确、raw/canonical/rejected/final 状态机、十级门禁链保障质量；缺点：需要改造所有产物生成节点
- **保持现有自由文本产物** _（已否决）_ — 优点：改动最小；缺点：无法保证结构一致性，下游消费不可靠

## 决策
定义 ShotSourcePackageV1 接口（schemaVersion: 1, bodyFragment, css, setupJs, seekJs），通过 normalizer → 应用拥有的 HTML shell（__CVC_RENDER__@v1）→ 十级门禁链 → raw/canonical/rejected/final 状态机管理产物生命周期。

## 影响
所有 AI 节点必须产出符合 ShotSourcePackageV1 的结构化产物；HTML 门禁链包含 schema/structure/external-link/determinism/runtime-contract/smoke-test/pixel-consistency 等检查；失败产物进入 rejected 状态并保留 raw 用于诊断。