# Track N4 产物 Compiler 与 HyperFrames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立从不可信模型 source 到可复现 `CvcCompositionBundleV1` 的唯一可信通道，执行全部十级门禁，并把固定版本 HyperFrames CLI 设为默认 renderer，同时阻止 source、asset、路径或 workspace 状态逃逸可信范围。

**Architecture:** browser-safe normalizer 产出带字符串 `schemaVersion`、且唯一动画字段为 `timelineJs` 的 `ShotSourcePackageV1`。服务端 G1–G5 在执行前验证归一、schema、语法、安全与确定性；纯 compiler 再生成固定尺寸、只有一个 compiler-owned paused GSAP timeline 的 HyperFrames composition。canonical manifest 与真实文件 hash 形成不受输入枚举顺序影响的 bundle hash。workspace-scoped `ArtifactStore` 与 attempt-scoped `RenderWorkspace` 为 sandboxed、固定版本 HyperFrames CLI provider 物化不可变 bundle；G6–G10 证明 compiler、CLI、seek、像素确定性与媒体完整性。

**Tech Stack:** TypeScript strict mode、Zod 4、parse5、PostCSS、Acorn/Acorn Walk、GSAP、固定版本 HyperFrames CLI、由 HyperFrames 管理的 Playwright/Chromium、FFmpeg/ffprobe、SHA-256、Vitest、Track N1 的 Postgres artifact metadata。

---

## Track 合同与执行顺序

- 按 N4.1 → N4.2 → N4.3 → N4.4 → N4.5 → N4.6 的顺序实施。
- 前置依赖：N0 已冻结 v3 architecture/version baseline 与 package scaffold；N1 已提供 workspace-scoped artifact persistence；N1.5 已产出固定版本 HyperFrames spike 证据；N2 已提供 `shot-render` task；N3 fabricate 已切到结构化 source 输出。source/bundle contract 由 N4 自己实现，不假设 N0 已定义。
- 本 Track 负责 `CONTRACT-SOURCE-001..004`、`CONTRACT-GATE-001..002`、`CONTRACT-COMPILER-001..003`、`CONTRACT-HF-001..002`、`CONTRACT-RENDER-001`、`CONTRACT-STORE-001`、`CONTRACT-ART-001..002` 与 A17–A25。
- 权威 source 动画字段只能是 `timelineJs`，不允许别名或第二套时钟。
- `ShotSourcePackageV1`、`ShotSourcePatchV1`、`CvcCompositionBundleV1` 与 `RenderableBundleDescriptorV1` 的 `schemaVersion` 必须是字符串；只有架构合同明确规定的 `RenderTaskV1` 与 `RenderReceiptV1` 等类型可以保留数值版本字段。
- 默认链路绝不执行模型提供的完整 HTML。完整 HTML 只能作为确定性 normalizer 的输入，并且必须在任何执行之前转换为四个权威字段。
- compiler 独占 composition ID、宽高、fps、时长、seed、shell、asset 接线、clip 时间以及唯一 paused timeline 的控制权，模型输出不得覆盖这些值。
- HyperFrames 命令必须使用本地固定版本依赖；运行时代码不得下载 CLI 版本，也不得绑定实验性 capture 路径。

<a id="task-n41"></a>

### Task N4.1: 构建 browser-safe extractor 与权威 `SourceNormalizer`

**Dependencies:** N0 冻结的 v3 架构/版本基线、contract package 骨架与测试 workspace 配置。

**Spec coverage:** `CONTRACT-SOURCE-001`, `CONTRACT-SOURCE-003..004`, `PROD-SHOT-003..008`, A17–A19.

**Files**

- Create: `packages/contracts/src/source-normalizer-core.ts`
- Create: `packages/contracts/src/source-normalizer-core.test.ts`
- Create: `src/features/artifacts/source-normalizer.ts`
- Create: `src/features/artifacts/source-normalizer.test.ts`
- Modify: `packages/contracts/src/source.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `vitest.config.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Delete: none
- Prohibited: `src/features/render/**`, `packages/video-compiler/**`, `trigger/**`, `src/lib/artifact-store/**`, `src/app/**`

- [ ] **Step 1 — 通过 pnpm 增加 parser 依赖并保持 package 测试可运行。**

  ```powershell
  pnpm add --save-exact parse5@8.0.0 postcss@8.5.6 acorn@8.15.0 acorn-walk@8.3.4
  ```

  在保留 `src/**/*.test.ts` 的前提下，把 `packages/**/*.test.ts` 加入现有 Vitest include 列表；不得手改 `pnpm-lock.yaml`。

- [ ] **Step 2 — 编写失败优先的 normalizer 矩阵。**

  使用表驱动测试固定以下精确优先级：

  1. 已完成解析的严格对象；
  2. 单个完整 JSON 文档；
  3. 单个外层 `json` code fence，且周围没有说明文字；
  4. 一组显式四段 fence，名称依次为 `html`、`css`、`setup-js`、`timeline-js`；
  5. 由 legacy extraction adapter 接受的单个完整 HTML 文档；
  6. 拒绝。

  拒绝矩阵必须覆盖：两个 JSON 对象、首尾花括号打捞、外层 fence 混入说明文字、四段缺一、段名重复、未知段名、多个完整 HTML 文档、多个候选 timeline 脚本、无法唯一分类的无标记脚本，以及接受包络之外额外的非空白正文。

- [ ] **Step 3 — 运行 RED。**

  ```powershell
  pnpm test -- packages/contracts/src/source-normalizer-core.test.ts src/features/artifacts/source-normalizer.test.ts
  ```

  预期：退出码 1，原因是 browser-safe core 与 server wrapper 尚不存在。

- [ ] **Step 4 — 实现精确 source 合同与确定性 matcher。**

  `packages/contracts/src/source.ts` 必须导出：

  ```ts
  export interface ShotSourcePackageV1 {
    schemaVersion: 'cvc.shot-source/v1'
    bodyFragment: string
    css: string
    setupJs: string
    timelineJs: string
  }
  ```

  四个字段必须始终存在。`bodyFragment` 经 trim 后必须非空，其余三个字段为空时使用 `''`。core 返回带 `format`、权威 package 与 warnings 的可判别成功结果，或带稳定 issue code 的可判别失败结果。它不得修复畸形标签、在多个脚本间猜测、丢弃说明文字、执行代码、使用 Node API、访问存储或导入 server-only 模块。

  HTML adapter 使用 parse5 强制输入为单个完整文档，提取 body fragment 与 style 内容，并且只在 setup/timeline 分类唯一时接受脚本内容。server wrapper 必须委托同一个 core 完成归一，不得增加第二套解析算法。

- [ ] **Step 5 — 运行 GREEN 并证明 browser safety。**

  ```powershell
  pnpm test -- packages/contracts/src/source-normalizer-core.test.ts src/features/artifacts/source-normalizer.test.ts
  pnpm typecheck
  rg -n "node:|server-only|Buffer|process\.|fs|path|child_process" packages/contracts/src/source-normalizer-core.ts
  $alternateClockField = 'seek' + 'Js'
  if (rg -n "$alternateClockField|__CVC_RENDER__|first.*\\{|last.*\\}" packages/contracts/src/source-normalizer-core.ts src/features/artifacts/source-normalizer.ts) { throw "alternate source clock or salvage path detected" }
  git diff --check
  if (rg -n ([char]0xFFFD) packages/contracts/src/source.ts packages/contracts/src/source-normalizer-core.ts src/features/artifacts/source-normalizer.ts) { throw "U+FFFD detected" }
  ```

  预期：测试/typecheck 退出 0；browser-safety 与替代时钟扫描无命中；U+FFFD 扫描无命中。

- [ ] **Step 6 — Task 退出门。**

  在测试输出中保存矩阵行数与每个稳定 issue code。A17 与 A18 必须通过；A19 的每一种歧义都必须在不执行 source 的情况下失败。

- [ ] **Step 7 — 仅提交 N4.1 文件。**

  ```powershell
  git add -- packages/contracts/src/source-normalizer-core.ts packages/contracts/src/source-normalizer-core.test.ts packages/contracts/src/source.ts packages/contracts/src/index.ts src/features/artifacts/source-normalizer.ts src/features/artifacts/source-normalizer.test.ts vitest.config.ts package.json pnpm-lock.yaml
  git diff --cached --check
  git diff --cached --stat
  git commit -m "feat(source): add authoritative normalizer" -m "Task: N4.1" -m "Spec: CONTRACT-SOURCE-001, CONTRACT-SOURCE-003..004, A17..A19" -m "Evidence: pnpm test -- packages/contracts/src/source-normalizer-core.test.ts src/features/artifacts/source-normalizer.test.ts"
  ```

<a id="task-n42"></a>

### Task N4.2: 强制执行 source/patch 合同与 G1–G5

**Dependencies:** N4.1；N1 的不可变 artifact repository 与 attempt fencing；N3 的 fabricate application service。

**Spec coverage:** `CONTRACT-SOURCE-001..002`, `CONTRACT-GATE-001..002`, `CONTRACT-ART-001`, `PROD-NFR-SEC-002`, A19–A20.

**Files**

- Create: `src/features/artifacts/gate-runner.ts`
- Create: `src/features/artifacts/gate-runner.test.ts`
- Create: `src/features/artifacts/source-gates.ts`
- Create: `src/features/artifacts/source-gates.test.ts`
- Create: `src/features/artifacts/artifact-service.ts`
- Create: `src/features/artifacts/artifact-service.test.ts`
- Create: `src/features/artifacts/repository.ts`
- Modify: `packages/contracts/src/source.ts`
- Modify: `packages/contracts/src/artifact.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `src/features/ai/application/shot-generate-service.ts`
- Modify: `src/features/ai/application/shot-generate-service.test.ts`
- Delete: none
- Prohibited: `src/features/render/**`, `packages/video-compiler/**`, `trigger/tasks/shot-render.ts`, `src/app/**`, `src/lib/db/schema/**`, `migrations/**`

- [ ] **Step 1 — 编写 RED schema、patch 与负向门禁测试。**

  精确测试 `ShotSourcePackageV1` 字段以及：

  ```ts
  export interface ShotSourcePatchV1 {
    schemaVersion: 'cvc.shot-source-patch/v1'
    baseContentHash: string
    changes: Partial<Pick<
      ShotSourcePackageV1,
      'bodyFragment' | 'css' | 'setupJs' | 'timelineJs'
    >>
  }
  ```

  增加以下失败用例：字段缺失、未知字段、空 body、字段超限、畸形 HTML/CSS/JS、外部 `src`/`href`、fetch、XHR、WebSocket、静态/动态 import、eval、`Function`、Worker、storage、cookie 访问、墙钟、requestAnimationFrame、GSAP ticker/play、定时器、无 seed 随机、`repeat: -1`，以及语法上明显的无限循环。

  Patch 测试必须拒绝空 change set 与过期 `baseContentHash`，并证明成功 patch 会创建新的不可变 artifact 版本而不会修改基线 artifact。

- [ ] **Step 2 — 运行 RED。**

  ```powershell
  pnpm test -- src/features/artifacts/source-gates.test.ts src/features/artifacts/gate-runner.test.ts src/features/artifacts/artifact-service.test.ts
  ```

  预期：退出码 1，原因是 gate runner 与 patch application service 尚不存在。

- [ ] **Step 3 — 实现严格 schema 与共享 gate result。**

  使用以下精确结果合同：

  ```ts
  export interface ContractIssueV1 {
    code: string
    severity: 'error' | 'warning'
    path?: string
    message: string
    hint?: string
  }

  export interface GateResultV1 {
    gate: `G${1|2|3|4|5|6|7|8|9|10}`
    status: 'passed' | 'failed' | 'skipped'
    issues: ContractIssueV1[]
    evidenceArtifactId?: string
  }
  ```

  应用确定性硬限制：`bodyFragment` 与 `css` 各 256 KiB，`setupJs` 为 64 KiB，`timelineJs` 为 128 KiB，完整权威 package 为 512 KiB。

- [ ] **Step 4 — 实现 AST/parser 支持的 G1–G5。**

  - G1：取得 N4.1 唯一的归一结果。
  - G2：验证严格 schema 与字节限制。
  - G3：分别使用 parse5、PostCSS 与 Acorn 验证 HTML、CSS 与 JavaScript 语法。
  - G4：检查已解析 tag/attribute 与 JavaScript AST，拒绝网络、代码生成和存储能力。
  - G5：检查 AST、调用与属性，拒绝时钟、动画驱动器、定时器、随机、ticker/play、无限 repeat 与无限循环。

  每个失败 gate 都返回稳定 issue code，后续 pre-render gate 标记为 `skipped`。G1–G5 期间不得执行任何模型 source。

- [ ] **Step 5 — 仅在门禁与 attempt fencing 通过后提交 canonical source。**

  `artifact-service.ts` 按 normalize → G1–G5 → attempt fence → immutable artifact commit 的顺序执行。门禁失败时只能写入受限的 gate receipt/evidence artifact，不得写入可执行 source artifact。Patch application 必须在登记 successor 的同一事务中，用当前 artifact 实体 SHA-256 校验 `baseContentHash`。

- [ ] **Step 6 — 运行 GREEN 与安全扫描。**

  ```powershell
  pnpm test -- src/features/artifacts/source-gates.test.ts src/features/artifacts/gate-runner.test.ts src/features/artifacts/artifact-service.test.ts src/features/ai/application/shot-generate-service.test.ts
  pnpm typecheck
  rg -n "eval\\(|new Function|requestAnimationFrame|Date\.now|performance\.now|Math\.random|setTimeout|setInterval|\\.play\\(|ticker" src/features/artifacts packages/contracts/src/source.ts
  $alternateClockField = 'seek' + 'Js'
  if (rg -n "$alternateClockField|__CVC_RENDER__" packages/contracts/src/source.ts src/features/artifacts) { throw "alternate source clock detected" }
  git diff --check
  if (rg -n ([char]0xFFFD) packages/contracts/src/source.ts packages/contracts/src/artifact.ts src/features/artifacts) { throw "U+FFFD detected" }
  ```

  预期：测试/typecheck 退出 0；生产 gate 代码中的禁止 token 只作为 AST 规则名/测试 fixture 字符串存在，绝不执行；替代时钟扫描无命中。

- [ ] **Step 7 — Task 退出门。**

  生成 G1–G5 矩阵，展示有效权威 fragment、有效完整 HTML extraction、每个 A20 恶意 fixture 与过期 patch 的 pass/fail/skipped 状态；确认任何失败输入都不会创建可执行 source artifact。

- [ ] **Step 8 — 仅提交 N4.2 文件。**

  ```powershell
  git add -- packages/contracts/src/source.ts packages/contracts/src/artifact.ts packages/contracts/src/index.ts src/features/artifacts/gate-runner.ts src/features/artifacts/gate-runner.test.ts src/features/artifacts/source-gates.ts src/features/artifacts/source-gates.test.ts src/features/artifacts/artifact-service.ts src/features/artifacts/artifact-service.test.ts src/features/artifacts/repository.ts src/features/ai/application/shot-generate-service.ts src/features/ai/application/shot-generate-service.test.ts
  git diff --cached --check
  git diff --cached --stat
  git commit -m "feat(artifact): enforce source gates" -m "Task: N4.2" -m "Spec: CONTRACT-SOURCE-001..002, CONTRACT-GATE-001..002, CONTRACT-ART-001, A19..A20" -m "Evidence: pnpm test -- src/features/artifacts/source-gates.test.ts src/features/artifacts/gate-runner.test.ts src/features/artifacts/artifact-service.test.ts"
  ```

<a id="task-n43"></a>

### Task N4.3: 实现纯 video compiler 与 HyperFrames 单时钟 shell

**Dependencies:** N4.2；N1.5 已验证的 HyperFrames composition 合同；N0 的 package workspace 骨架。

**Spec coverage:** `CONTRACT-COMPILER-001`, `CONTRACT-COMPILER-003`, `CONTRACT-HF-001`, ADR-0004, A21.

**Files**

- Create: `packages/video-compiler/package.json`
- Create: `packages/video-compiler/tsconfig.json`
- Create: `packages/video-compiler/src/index.ts`
- Create: `packages/video-compiler/src/compile.ts`
- Create: `packages/video-compiler/src/compile.test.ts`
- Create: `packages/video-compiler/src/shell.ts`
- Create: `packages/video-compiler/src/shell.test.ts`
- Create: `packages/video-compiler/src/validate.ts`
- Create: `packages/video-compiler/src/validate.test.ts`
- Modify: `packages/contracts/src/composition.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `tsconfig.json`
- Delete: none
- Prohibited: `src/features/render/**`, `src/features/artifacts/**`, `src/lib/artifact-store/**`, `trigger/**`, `src/app/**`, `next.config.ts`

- [ ] **Step 1 — 编写 RED 纯 compiler 与 shell 测试。**

  覆盖：

  - 带应用所有 render spec 与 versions 的严格 `CompileShotInputV1`；
  - 同一权威输入编译两次产生逐字节相同的文件内容；
  - 改变输入枚举顺序不会改变输出字节；
  - root 宽高、时长与 composition ID 等于可信 render spec；
  - 声明的 track 上恰好一个 `.clip` 覆盖应用所有时长；
  - 恰好同步创建一个 `gsap.timeline({ paused: true })`；
  - timeline registry key 与 root composition ID 完全相等；
  - `setupJs` 在登记 timeline 前同步执行；
  - `timelineJs` 只接收 compiler 所有的 paused timeline；
  - 输出不包含网络 URL、模型控制的 shell、额外时钟、播放调用或 legacy render hook；
  - 导入或调用 compiler 不发生网络、DB、artifact-store、时钟、文件系统或全局随机操作。

- [ ] **Step 2 — 运行 RED。**

  ```powershell
  pnpm test -- packages/video-compiler/src/compile.test.ts packages/video-compiler/src/shell.test.ts packages/video-compiler/src/validate.test.ts
  ```

  预期：退出码 1，原因是 compiler package 尚不存在。

- [ ] **Step 3 — 定义并验证精确 compiler input。**

  ```ts
  export interface CompileShotInputV1 {
    source: ShotSourcePackageV1
    renderSpec: {
      compositionId: string
      width: number
      height: number
      fps: number
      durationSeconds: number
      seed: string
    }
    assets: readonly AssetRefV1[]
    versions: {
      workflow: string
      compiler: string
      sourceSchema: 'cvc.shot-source/v1'
    }
  }
  ```

  验证安全 composition ID、整数宽高/fps、有限正时长、seed、asset identity/hash/media type 与精确 source schema；拒绝 source 自带的任何 render spec 或 version。

- [ ] **Step 4 — 生成固定、离线的 HyperFrames project。**

  compiler 至少输出 `index.html`、`styles.css`、`runtime.js` 与可信本地 assets。`index.html` 包含独立的固定尺寸 root，并带 `data-composition-id`、`data-start="0"`、`data-width`、`data-height` 与 `data-duration`；root 的 CSS `width`/`height` 必须是与可信 render spec 一致、可解析的像素盒。唯一 `.clip` 必须显式带 `data-track-index="0"`、`data-start="0"` 与 `data-duration=<full-duration>`。不得把媒体放入 `<template>` 或额外 wrapper；框架拥有 media playback。Full-bleed 样式属于 clip 子节点，而不是 composition root。

  `runtime.js` 按以下顺序同步执行：

  ```ts
  window.__timelines = window.__timelines || {}
  const timeline = gsap.timeline({ paused: true })
  runDeterministicSetup()
  registerModelTweens(timeline)
  window.__timelines[compositionId] = timeline
  ```

  `registerModelTweens` 包含已验证的 `timelineJs`。它只能向 `timeline` 添加有限 tween，不能创建或驱动另一个 timeline。GSAP 与所有媒体 asset 都必须引用可信 bundle-local 文件，绝不引用 CDN。

- [ ] **Step 5 — 保持 compiler 纯函数边界。**

  `compileShot(input)` 是仅由已验证输入与 compiler 常量决定的确定性函数。它不依赖 repository、`ArtifactStore`、网络、进程环境、当前时间、UUID、文件系统或随机状态。Asset bytes/descriptors 由 N4.4 定义的应用边界在调用前组装。

- [ ] **Step 6 — 运行 GREEN 与纯度/单时钟扫描。**

  ```powershell
  pnpm test -- packages/video-compiler/src/compile.test.ts packages/video-compiler/src/shell.test.ts packages/video-compiler/src/validate.test.ts
  pnpm typecheck
  rg -n "fetch|XMLHttpRequest|WebSocket|node:fs|ArtifactStore|getDb|Date\.now|performance\.now|Math\.random|randomUUID|process\.env" packages/video-compiler/src
  $alternateClockField = 'seek' + 'Js'
  if (rg -n "$alternateClockField|__CVC_RENDER__|requestAnimationFrame|ticker|\\.play\\(|setTimeout|setInterval" packages/video-compiler/src) { throw "alternate clock or playback driver detected" }
  git diff --check
  if (rg -n ([char]0xFFFD) packages/video-compiler packages/contracts/src/composition.ts) { throw "U+FFFD detected" }
  ```

  预期：测试/typecheck 退出 0；纯度与替代时钟扫描无生产代码命中。

- [ ] **Step 7 — Task 退出门。**

  在两个独立进程中各编译一次 golden fixture，并比较每个输出字节；确认只有一个 composition ID、一个 paused timeline、一个 registry key，且 render-time 不依赖网络。

- [ ] **Step 8 — 仅提交 N4.3 文件。**

  ```powershell
  git add -- packages/video-compiler/package.json packages/video-compiler/tsconfig.json packages/video-compiler/src/index.ts packages/video-compiler/src/compile.ts packages/video-compiler/src/compile.test.ts packages/video-compiler/src/shell.ts packages/video-compiler/src/shell.test.ts packages/video-compiler/src/validate.ts packages/video-compiler/src/validate.test.ts packages/contracts/src/composition.ts packages/contracts/src/index.ts pnpm-workspace.yaml tsconfig.json
  git diff --cached --check
  git diff --cached --stat
  git commit -m "feat(compiler): build HyperFrames composition shell" -m "Task: N4.3" -m "Spec: CONTRACT-COMPILER-001, CONTRACT-COMPILER-003, CONTRACT-HF-001, A21" -m "Evidence: pnpm test -- packages/video-compiler/src/compile.test.ts packages/video-compiler/src/shell.test.ts packages/video-compiler/src/validate.test.ts"
  ```

<a id="task-n44"></a>

### Task N4.4: 增加 canonical bundle/hash/provenance 与 workspace-scoped artifact 物化

**Dependencies:** N4.3；N1 的 artifact metadata/atomic commit 实现。

**Spec coverage:** `CONTRACT-COMPILER-002..003`, `CONTRACT-STORE-001`,
`CONTRACT-ART-001..002`, `CONTRACT-PINK-001..003`, A20–A21.

**Files**

- Create: `packages/video-compiler/src/manifest.ts`
- Create: `packages/video-compiler/src/manifest.test.ts`
- Create: `packages/video-compiler/src/canonical-json.ts`
- Create: `packages/video-compiler/src/canonical-json.test.ts`
- Create: `src/lib/artifact-store/artifact-store.ts`
- Create: `src/lib/artifact-store/artifact-store.test.ts`
- Create: `src/features/render/render-workspace.ts`
- Create: `src/features/render/render-workspace.test.ts`
- Modify: `packages/contracts/src/artifact.ts`
- Modify: `packages/contracts/src/composition.ts`
- Create: `packages/contracts/src/composition.conformance.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/video-compiler/src/compile.ts`
- Modify: `packages/video-compiler/src/index.ts`
- Modify: `src/features/artifacts/artifact-service.ts`
- Delete: none
- Prohibited: `src/lib/storage/**`, `src/features/director/**`, `trigger/**`, `src/app/**`, `src/lib/db/schema/**`, `migrations/**`

- [ ] **Step 1 — 编写 RED canonicalization、scope 与路径边界测试。**

  验证：

  - 以不同顺序排列输入 assets/files 仍产生相同 canonical bytes 与 bundle hash；
  - Unicode、整数、有限小数、布尔值、null、数组与对象 key 全部服从同一个带版本 encoder；
  - 非有限数值与不支持的值会失败；
  - 修改任一文件字节、可信 render 字段、compiler version、workflow version 或 provenance 都会改变 hash；
  - `bundleHash`、render key、input fingerprint 与实体 content hash 不得互相代用；
  - `CvcCompositionBundleV1.renderable` 通过 `RenderableBundleDescriptorV1`
    conformance fixture；fixture 不引入 PurpleInk runtime、DB、Trigger 或 UI；
  - workspace A 不能对 workspace B 的 artifact ID 执行 `get` 或 `head`；
  - materialization 拒绝绝对路径、盘符前缀、`..`、编码 traversal、symlink escape、重复目标路径以及 manifest/file hash 不一致；
  - cleanup 在成功、失败与取消后都具有幂等性。

- [ ] **Step 2 — 运行 RED。**

  ```powershell
  pnpm test -- packages/contracts/src/composition.conformance.test.ts packages/video-compiler/src/canonical-json.test.ts packages/video-compiler/src/manifest.test.ts src/lib/artifact-store/artifact-store.test.ts src/features/render/render-workspace.test.ts
  ```

  预期：退出码 1，原因是 canonical bundle 与 scoped workspace port 尚不存在。

- [ ] **Step 3 — 定义精确的字符串版本 bundle 合同。**

  ```ts
  export interface RenderableBundleDescriptorV1 {
    schemaVersion: 'renderable-bundle-descriptor/v1'
    format: 'hyperframes-html/v1'
    entryPath: string
    files: readonly {
      path: string
      sha256: string
      mediaType: string
      byteSize: number
    }[]
    width: number
    height: number
    fps: number
    durationSeconds: number
    requiredHyperframesVersion: string
    bundleHash: string
    provenanceDigest: string
  }

  export interface CvcCompositionBundleV1 {
    schemaVersion: 'cvc.composition-bundle/v1'
    entryHtml: 'index.html'
    files: readonly {
      path: string
      sha256: string
      mediaType: string
      byteSize: number
    }[]
    manifest: {
      compositionId: string
      width: number
      height: number
      fps: number
      durationSeconds: number
      sourceHash: string
      assetHashes: readonly string[]
      workflowVersion: string
      compilerVersion: string
      requiredHyperframesVersion: string
      provenance: ArtifactProvenanceV1
    }
    renderable: RenderableBundleDescriptorV1
  }
  ```

- [ ] **Step 4 — 实现带版本的 canonical hashing。**

  显式编码 `canonicalizerVersion`。按归一化 POSIX path 排序 file descriptor，并按字典序排序 asset hash。为每个输出文件计算真实 SHA-256 与 byte size；从 canonical provenance 计算 `provenanceDigest`；使用不含 hash 自身的 canonical manifest core 与已排序真实文件 hash 计算 `bundleHash`。任何 hash 输入都不得包含调用方枚举顺序。

- [ ] **Step 5 — 实现精确的 scoped storage/workspace port。**

  ```ts
  export interface ArtifactStore {
    put(scope: WorkspaceScope, input: PutArtifactInput): Promise<StoredArtifact>
    get(scope: WorkspaceScope, artifactId: string): Promise<Uint8Array>
    head(scope: WorkspaceScope, artifactId: string): Promise<ArtifactHead | null>
  }

  export interface RenderWorkspace {
    create(scope: WorkspaceScope): Promise<WorkspaceHandle>
    materialize(
      scope: WorkspaceScope,
      artifactId: string,
      workspace: WorkspaceHandle,
      relativePath: string
    ): Promise<string>
    cleanup(workspace: WorkspaceHandle): Promise<void>
  }
  ```

  业务代码只能接收经过 scope 校验的不透明 artifact ID。只有 `RenderWorkspace` 可以向 CLI/FFmpeg 暴露进程本地路径，而且路径必须位于 attempt root 内；这类路径绝不持久化、记录到日志、写入 receipt 或返回 UI。

- [ ] **Step 6 — 接入不可变 bundle commit。**

  application service 写入临时对象内容，验证实体 SHA-256/size，检查 attempt fencing，并在同一个 Postgres 事务中登记不可变 artifact 与 aggregate reference。失败事务不得留下业务引用，已提交 artifact 永不覆盖。

- [ ] **Step 7 — 运行 GREEN 与 canonical/scope 扫描。**

  ```powershell
  pnpm test -- packages/contracts/src/composition.conformance.test.ts packages/video-compiler/src/canonical-json.test.ts packages/video-compiler/src/manifest.test.ts src/lib/artifact-store/artifact-store.test.ts src/features/render/render-workspace.test.ts src/features/artifacts/artifact-service.test.ts
  pnpm typecheck
  rg -n "schemaVersion:\\s*1" packages/contracts/src/source.ts packages/contracts/src/composition.ts packages/video-compiler/src
  rg -n "localPath|storageKey|absolutePath" packages/contracts/src src/features/artifacts src/features/render/render-workspace.ts
  rg -n "director" src/features/render packages/video-compiler
  git diff --check
  if (rg -n ([char]0xFFFD) packages/contracts packages/video-compiler src/lib/artifact-store src/features/render/render-workspace.ts) { throw "U+FFFD detected" }
  ```

  预期：测试/typecheck 退出 0；bundle/source 不存在数值 schema version；storage/path 细节不跨越 public contract；renderer/compiler 没有 Director import。

- [ ] **Step 8 — Task 退出门。**

  对 asset/file 枚举的所有排列运行 canonical fixture，并断言只有一个 bundle hash；
  运行跨 workspace 与 path-escape fixture，并断言稳定的 authorization/path issue
  code；证明 CVC descriptor 通过跨项目共享 conformance，但没有提前提取共享 package
  或复制 PurpleInk 内部 runtime。

- [ ] **Step 9 — 仅提交 N4.4 文件。**

  ```powershell
  git add -- packages/video-compiler/src/manifest.ts packages/video-compiler/src/manifest.test.ts packages/video-compiler/src/canonical-json.ts packages/video-compiler/src/canonical-json.test.ts packages/video-compiler/src/compile.ts packages/video-compiler/src/index.ts packages/contracts/src/artifact.ts packages/contracts/src/composition.ts packages/contracts/src/composition.conformance.test.ts packages/contracts/src/index.ts src/lib/artifact-store/artifact-store.ts src/lib/artifact-store/artifact-store.test.ts src/features/render/render-workspace.ts src/features/render/render-workspace.test.ts src/features/artifacts/artifact-service.ts
  git diff --cached --check
  git diff --cached --stat
  git commit -m "feat(artifact): add canonical composition bundles" -m "Task: N4.4" -m "Spec: CONTRACT-COMPILER-002..003, CONTRACT-STORE-001, CONTRACT-ART-001..002, CONTRACT-PINK-001..003, A20..A21" -m "Evidence: pnpm test -- packages/contracts/src/composition.conformance.test.ts packages/video-compiler/src/canonical-json.test.ts packages/video-compiler/src/manifest.test.ts src/lib/artifact-store/artifact-store.test.ts src/features/render/render-workspace.test.ts"
  ```

<a id="task-n45"></a>

### Task N4.5: 实现 sandboxed 固定版本 HyperFrames provider 与 G6–G10

**Dependencies:** N4.4；N1.5 已记录精确 HyperFrames 版本并验证 CLI entrypoint；本地 FFmpeg/ffprobe 可用。

**Spec coverage:** `CONTRACT-GATE-002`, `CONTRACT-HF-001..002`, `CONTRACT-RENDER-001`, `PROD-RENDER-001..006`, A20, A22–A25.

**Files**

- Create: `src/features/render/provider.ts`
- Create: `src/features/render/hyperframes-cli.ts`
- Create: `src/features/render/hyperframes-provider.ts`
- Create: `src/features/render/hyperframes-provider.test.ts`
- Create: `src/features/render/hyperframes-provider.integration.test.ts`
- Create: `src/features/render/runtime-sandbox.ts`
- Create: `src/features/render/runtime-sandbox.test.ts`
- Create: `src/features/render/verify.ts`
- Create: `src/features/render/verify.test.ts`
- Create: `scripts/verification/verify-hyperframes-shot.mts`
- Modify: `packages/contracts/src/composition.ts`
- Modify: `src/lib/version/workflow-version.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Delete: none
- Prohibited: `src/features/director/**`, `src/features/ai/**`, `src/lib/storage/**`, `src/app/**`, `trigger/tasks/project-compose.ts`

- [ ] **Step 1 — 验证版本 pin 并编写 RED provider/sandbox 测试。**

  断言 `package.json` 使用精确 HyperFrames 版本，并且等于 `workflow-version.ts` 中的 `requiredHyperframesVersion`；缺失或带 range prefix 时必须失败。

  编写测试覆盖：

  - bundle/descriptor hash 不一致；
  - 文件缺失、多余文件、文件 hash/size 不一致；
  - path traversal、symlink escape、跨 scope artifact 访问；
  - 出站 HTTP(S)、fetch/XHR/WebSocket、外部 image/media/script、eval/Function、Worker、墙钟、requestAnimationFrame、定时器、无 seed 随机；
  - 受限的进程 timeout、输出字节、文件数、console 事件数、stdout/stderr 大小与 cancellation；
  - 成功的 G6 shell/timing/id/timeline；
  - G7 CLI check 零 finding；
  - G8 在 0、中点、最后一个有效帧以及由 bundle hash 派生的乱序时间点执行 seek；
  - G9 对同一帧的两次 capture 产生完全相同的 PNG SHA-256 与非空 sample；
  - G10 MP4 具有预期 video stream/size/duration 与实体 SHA-256。

- [ ] **Step 2 — 运行 RED。**

  ```powershell
  pnpm test -- src/features/render/runtime-sandbox.test.ts src/features/render/verify.test.ts src/features/render/hyperframes-provider.test.ts
  ```

  预期：退出码 1，原因是 provider、sandbox 与 G6–G10 verifier 尚不存在。

- [ ] **Step 3 — 定义 render task/receipt 与 provider port。**

  ```ts
  export interface RenderTaskV1 {
    schemaVersion: 1
    workspaceId: string
    projectId: string
    shotId: string
    runId: string
    attemptId: string
    bundleArtifactId: string
    expectedBundleHash: string
  }

  export interface RenderReceiptV1 {
    schemaVersion: 1
    provider: 'hyperframes' | 'legacy'
    outputArtifactId: string
    contentHash: string
    mediaProbe: MediaProbeV1
    gateResults: readonly GateResultV1[]
  }
  ```

  `RenderProvider.render(task, signal)` 返回该 receipt。这两个数值版本是有意保留的，不改变 source/bundle 合同采用字符串版本的规则。

- [ ] **Step 4 — 实现 attempt sandbox。**

  只把 manifest 列出的文件物化到全新的 attempt workspace，并强制执行等价于以下内容的 CSP：

  ```text
  default-src 'none'; script-src 'self'; style-src 'self';
  img-src 'self' data: blob:; media-src 'self' blob:;
  connect-src 'none'; worker-src 'none'; frame-src 'none';
  object-src 'none'; base-uri 'none'; form-action 'none'
  ```

  拒绝所有出站 origin，只允许 provider 所有、用于提供 manifest 文件的 loopback origin。使用独立 browser context/process，不提供 Node integration、ambient file access 或继承的 credential environment，并对已脱敏 console/error 设置上限。强制限制为 128 个文件、单文件 16 MiB、bundle 总计 64 MiB、输出 512 MiB、100 个 console 事件、进程合并输出 64 KiB，以及每个 CLI phase 120 秒。透传 `AbortSignal`，并始终调用 `RenderWorkspace.cleanup`。

- [ ] **Step 5 — 执行本地固定版本 CLI，运行时不得下载。**

  从已安装 package metadata 解析其声明的 `hyperframes` bin entry，并使用 `process.execPath` 启动。生产 worker 代码不得调用 package manager。

  adapter 表达的验证命令为：

  ```powershell
  pnpm exec hyperframes check <attempt-workspace> --json --strict
  pnpm exec hyperframes snapshot <attempt-workspace> --at 0,<mid>,<end>,<out-of-order-times>
  pnpm exec hyperframes render <attempt-workspace> --quality high --output <attempt-output>
  ffprobe -v error -show_streams -show_format -of json <attempt-output>
  ```

  这些命令示例仅用于本地证据；生产路径直接使用已解析的固定版本 bin。

- [ ] **Step 6 — 实现 G6–G10 与不可变输出 commit。**

  G6 检查 root、尺寸、时长、composition/timeline key 相等、唯一 paused timeline、本地 assets 与 descriptor hash。G7 存储受限的 CLI check 证据。G8 从 `bundleHash` 派生稳定的乱序 seek 时间点。G9 对独立 capture 的同一帧两份副本计算 hash，并拒绝空白或无效纯色 sample。G10 执行 render 与 ffprobe，验证尺寸/时长/stream，从最终 MP4 实体字节计算 SHA-256，并在 attempt fencing 下提交 artifact。

- [ ] **Step 7 — 运行 GREEN 与真实固定版本 CLI fixture。**

  ```powershell
  pnpm test -- src/features/render/runtime-sandbox.test.ts src/features/render/verify.test.ts src/features/render/hyperframes-provider.test.ts
  pnpm test -- src/features/render/hyperframes-provider.integration.test.ts
  pnpm exec tsx scripts/verification/verify-hyperframes-shot.mts
  pnpm typecheck
  rg -n "npx|--yes|experimental|fast.capture|__CVC_RENDER__" src/features/render/hyperframes-cli.ts src/features/render/hyperframes-provider.ts scripts/verification/verify-hyperframes-shot.mts
  rg -n "director|features/ai" src/features/render
  git diff --check
  if (rg -n ([char]0xFFFD) src/features/render scripts/verification/verify-hyperframes-shot.mts packages/contracts/src/composition.ts) { throw "U+FFFD detected" }
  ```

  预期：unit/integration test、typecheck、HyperFrames check、乱序 snapshot、同帧 hash、render、ffprobe 与实体 hash 全部通过；禁止 CLI/legacy/import 扫描无命中。

- [ ] **Step 8 — Task 退出门。**

  保存 G6–G10 的受限证据：零 finding 的 check JSON、seek 时间点与 PNG hash、同帧相等性、MP4 ffprobe projection、预期/实际实体 hash 与 workspace-clean 状态。不得持久化机器路径。

- [ ] **Step 9 — 仅提交 N4.5 文件。**

  ```powershell
  git add -- src/features/render/provider.ts src/features/render/hyperframes-cli.ts src/features/render/hyperframes-provider.ts src/features/render/hyperframes-provider.test.ts src/features/render/hyperframes-provider.integration.test.ts src/features/render/runtime-sandbox.ts src/features/render/runtime-sandbox.test.ts src/features/render/verify.ts src/features/render/verify.test.ts scripts/verification/verify-hyperframes-shot.mts packages/contracts/src/composition.ts src/lib/version/workflow-version.ts package.json pnpm-lock.yaml
  git diff --cached --check
  git diff --cached --stat
  git commit -m "feat(render): add sandboxed HyperFrames provider" -m "Task: N4.5" -m "Spec: CONTRACT-GATE-002, CONTRACT-HF-001..002, CONTRACT-RENDER-001, A20, A22..A25" -m "Evidence: pnpm test -- src/features/render/runtime-sandbox.test.ts src/features/render/verify.test.ts src/features/render/hyperframes-provider.test.ts && pnpm exec tsx scripts/verification/verify-hyperframes-shot.mts"
  ```

<a id="task-n46"></a>

### Task N4.6: 证明 legacy parity 并将默认 render provider 切到 HyperFrames

**Dependencies:** N4.5；N2 的 `shot-render` task 与 render attempt repository。

**Spec coverage:** `CONTRACT-RENDER-001`, `CONTRACT-HF-001..002`, ADR-0004, A17–A25.

**Files**

- Create: `src/features/render/legacy-provider.ts`
- Create: `src/features/render/provider-policy.ts`
- Create: `src/features/render/provider-policy.test.ts`
- Create: `src/features/render/provider-parity.test.ts`
- Modify: `src/features/render/renderer.ts`
- Modify: `src/features/render/renderer.test.ts`
- Modify: `src/features/render/index.ts`
- Modify: `trigger/tasks/shot-render.ts`
- Modify: `trigger/tasks/shot-render.test.ts`
- Modify: `src/features/pipeline/repository.ts`
- Delete: none
- Prohibited: `src/features/director/**`, `src/features/ai/**`, `src/features/audio/**`, `src/app/**`, `packages/video-compiler/**`, `src/lib/db/schema/**`, `migrations/**`

- [ ] **Step 1 — 编写 RED provider policy 与 parity 测试。**

  断言：

  - 没有设置项时选择 `hyperframes`；
  - 只有显式 server-side migration flag 与 pre-N4 artifact marker 同时存在时才允许 `legacy`；
  - 正常 v3 bundle 不能路由到 legacy；
  - 同一 golden canonical source/render spec 在两个 provider 上产生相同尺寸、满足容差的时长、非空 hero frame 与预期内容语义；
  - HyperFrames receipt 通过 G6–G10；
  - provider 失败或取消时绝不静默 fallback；
  - `shot-render` 只接受 artifact ID 与预期 bundle hash，不接受 HTML 或 server path。

- [ ] **Step 2 — 运行 RED。**

  ```powershell
  pnpm test -- src/features/render/provider-policy.test.ts src/features/render/provider-parity.test.ts trigger/tasks/shot-render.test.ts
  ```

  预期：退出码 1，原因是 provider policy 与显式 legacy adapter 尚不存在。

- [ ] **Step 3 — 将现有 renderer 隔离为仅迁移 adapter。**

  `legacy-provider.ts` 包装现有 frame-capture/encode 实现。`renderer.ts` 改为 provider dispatcher，不包含 source normalization、Director import 或 provider fallback。现有 `__CVC_RENDER__@v1` 支持仅限于 `legacy-provider.ts` 及其 migration 测试。

- [ ] **Step 4 — 将 `shot-render` 切到可信 v3 链路。**

  task 加载 scoped source artifact，确认 G1–G5，编译并提交 bundle，构造 `RenderTaskV1`，再调用 `provider-policy.ts` 选中的 provider。默认选择始终为 HyperFrames。完整 HTML legacy 输入先经过 N4.1 adapter，再进入同一 source gate/compiler；默认 provider 绝不直接执行它。

- [ ] **Step 5 — 运行 GREEN、parity 与默认路径扫描。**

  ```powershell
  pnpm test -- src/features/render/provider-policy.test.ts src/features/render/provider-parity.test.ts trigger/tasks/shot-render.test.ts src/features/render/renderer.test.ts
  pnpm typecheck
  rg -n "__CVC_RENDER__" src trigger --glob "*.ts" --glob "!*.test.ts" --glob "!src/features/render/legacy-provider.ts"
  rg -n "director|fabricateShot|stage-runner" src/features/render trigger/tasks/shot-render.ts
  rg -n "htmlKey|storageKey|localPath" trigger/tasks/shot-render.ts src/features/render/provider.ts src/features/render/renderer.ts
  git diff --check
  if (rg -n ([char]0xFFFD) src/features/render trigger/tasks/shot-render.ts) { throw "U+FFFD detected" }
  ```

  预期：测试/typecheck 退出 0；legacy clock 只存在于显式 adapter；Director 与路径细节扫描无命中。

- [ ] **Step 6 — 运行 Track N4 Tier B 与专项门禁。**

  ```powershell
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm build
  pnpm exec tsx scripts/verification/verify-hyperframes-shot.mts
  $alternateClockField = 'seek' + 'Js'
  if (rg -n $alternateClockField packages src trigger) { throw "alternate source clock detected" }
  $genericBundlePattern = '(interface|type)\s+' + 'Composition' + 'BundleV1\b'
  if (rg -n $genericBundlePattern packages src trigger) { throw "generic bundle type detected" }
  rg -n "schemaVersion:\\s*1" packages/contracts/src/source.ts packages/contracts/src/composition.ts packages/video-compiler/src
  rg -n "director" src/features/render packages/video-compiler
  if (rg -n ([char]0xFFFD) AGENTS.md README.md docs src packages trigger scripts/verification) { throw "U+FFFD detected" }
  git diff --check
  ```

  预期：

  - Tier B 与真实 HyperFrames 专项门禁退出码为 0；
  - 不存在替代 source 时钟；
  - 只使用精确 bundle 类型名；
  - source/bundle descriptor 版本均为字符串；
  - renderer/compiler 没有 Director import；
  - U+FFFD 扫描无匹配。

- [ ] **Step 7 — Track 退出门。**

  记录：

  - N4.1–N4.6 commit SHA；
  - normalizer 成功/拒绝矩阵；
  - G1–G10 结果矩阵与 evidence artifact ID；
  - canonical permutation 数量与稳定 bundle hash；
  - HyperFrames check 零 finding、乱序 seek 结果、同帧 PNG hash 相等性、MP4 ffprobe 与 SHA-256；
  - 跨 workspace/path/network/eval/clock/random 负向结果；
  - 默认 provider 证明与显式 migration-only legacy 边界；
  - focused/Tier B 退出码、最终 worktree 状态，以及未 push 的确认。

- [ ] **Step 8 — 仅提交 N4.6 文件。**

  ```powershell
  git add -- src/features/render/legacy-provider.ts src/features/render/provider-policy.ts src/features/render/provider-policy.test.ts src/features/render/provider-parity.test.ts src/features/render/renderer.ts src/features/render/renderer.test.ts src/features/render/index.ts trigger/tasks/shot-render.ts trigger/tasks/shot-render.test.ts src/features/pipeline/repository.ts
  git diff --cached --check
  git diff --cached --stat
  git commit -m "refactor(render): default to HyperFrames" -m "Task: N4.6" -m "Spec: CONTRACT-RENDER-001, CONTRACT-HF-001..002, ADR-0004, A17..A25" -m "Evidence: pnpm test -- src/features/render/provider-policy.test.ts src/features/render/provider-parity.test.ts trigger/tasks/shot-render.test.ts"
  ```
