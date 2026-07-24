# ADR-0004：video-compiler → HyperFrames 单帧时钟

- 状态：Accepted
- 日期：2026-07-24

## Context

CVC 当前让模型生成接近可执行的完整 HTML，并用自建 `window.__CVC_RENDER__@v1`
接口逐帧截取。未来目标渲染引擎是 HyperFrames，其 composition/timing/timeline/media
合同已经提供正式帧时钟。长期同时保留两套时钟会造成 preview/render、媒体播放和
确定性门禁分叉。

PurpleInk Firenze 的 compiler 输入是受约束 Plan，CVC 的核心是 AI 生成代码，二者
不能直接共用 compiler 输入，但可以共享 Bundle 和 Render Receipt。

## Decision

1. 模型输出先归一为 `ShotSourcePackageV1`；
2. 原始完整 HTML 只走 legacy extraction，不直接执行；
3. G1–G5 在 compile 前完成；
4. `packages/video-compiler` 纯函数式生成 `CompositionBundleV1`；
5. compiler 拥有 shell、尺寸、duration、seed、timing、依赖与资产；
6. HyperFrames CLI 是首版稳定入口；
7. G6–G10 覆盖 compile、check、seek、pixel hash、media probe；
8. `__CVC_RENDER__@v1` 只存在于迁移期 legacy provider；
9. parity 通过后删除 legacy provider；
10. PurpleInk 只与 CVC 对齐 bundle/render contracts。

## Consequences

正面：

- 不可信模型代码与 renderer 隔离；
- 同一帧时钟覆盖 preview/render/media；
- bundle 可寻址、可缓存、可审计；
- 未来可共享 render worker。

代价：

- 需要 AST/DOM 级 normalizer 与安全门禁；
- 需要迁移现有 artifact；
- HyperFrames 版本升级进入 workflowVersion；
- legacy parity 期间短暂维护两个 provider，但只有一个默认。

## Rejected alternatives

- 直接执行完整 HTML：安全和可复现性不足；
- 长期双时钟：测试与媒体语义分叉；
- 直接使用 HyperFrames 低层 engine：过早绑定内部 API；
- 强制 CVC 改成 Firenze Plan-only compiler：破坏产品核心能力。

## Verification

- full HTML/fragments 成功与拒绝矩阵；
- 相同输入 bundle hash 相同；
- HyperFrames check 为 0 finding；
- 乱序 seek 与同帧双拍通过；
- MP4 尺寸、时长、流和 SHA-256 正确；
- N7 source scan 无 legacy clock 主路径。
