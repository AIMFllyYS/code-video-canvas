# PurpleInk Design System Agent Guide

Version: 2026-07-24  
Status: production-oriented reference  
Normative implementation: `app/globals.css`  
Visual reference: the shipped homepage

This guide is a synthesized handoff for an agent that must design or implement PurpleInk without relying on undocumented visual guesses. The original source documents remain in the package under `source-reference/`; this file explains how to read them together.

## 1. Core Direction

PurpleInk is a near-monochrome creative-technology system animated by spectral indigo. Its creative north star is **Spectral Ink**:

- black, white, and neutral gray create structure, hierarchy, and legibility;
- spectral indigo carries brand recognition, primary action, focus, selection, progress, and expressive energy;
- indigo may behave like digital ink, light, photographic emulsion, or fluid motion in imagery and signature interactions;
- layout relies on space, alignment, evidence, and interaction rather than a grid of floating cards;
- restrained typography gives product evidence and imagery the expressive role;
- motion enhances access and feedback but is never required to understand or use content.

The homepage is the visual fact source. Existing homepage Hex values are production anchors. Documentation, ColorBox output, and generated candidates must not silently replace those anchors. When documentation and rendered CSS disagree, inspect `app/globals.css` first and treat its current mapping as the implementation contract.

## 2. Token Architecture

PurpleInk has two layers:

1. **Primitive tokens** (`--pi-*`) are exact brand, neutral, night, and asset colors. They answer “what exact color is this?” They are appropriate for brand assets, exact gradient stops, static SVG/app-icon fields, or a new semantic definition.
2. **Semantic tokens** (`--background`, `--foreground`, `--primary`, `--accent`, `--muted`, `--border`, etc.) describe a UI role. Components must consume this layer so Light/Dark themes can change without component-level color edits.

Tailwind semantic aliases are declared in `@theme inline` in `app/globals.css`. For example, `bg-background`, `text-foreground`, `border-border`, `outline-ring`, `bg-primary`, and `text-primary-foreground` resolve through the semantic layer.

Do not use generic Tailwind `purple-*`, `violet-*`, or `slate-*` families when PurpleInk tokens already express the role. Do not add Hex values inside components for a role already represented by a semantic variable.

## 3. Primitive Palette

| Primitive | Hex | Role and boundary |
| --- | --- | --- |
| `--pi-white` | `#FFFFFF` | Light background and inverted text |
| `--pi-black` | `#0A0A0A` | Light-theme foreground and black controls |
| `--pi-neutral-50` | `#FAFAFA` | Dark-theme foreground and ink-stage text |
| `--pi-neutral-100` | `#F5F5F5` | Light muted/secondary surface |
| `--pi-neutral-300` | `#E5E5E5` | Light border and strong surface |
| `--pi-neutral-600` | `#737373` | Light muted text |
| `--pi-night` | `#03040A` | Dark background and media/ink stage |
| `--pi-night-asset` | `#030409` | Exact darkest homepage gradient asset stop |
| `--pi-night-glow` | `#0C0E21` | Dark glow asset stop |
| `--pi-night-surface` | `#18181B` | Dark grouped surface |
| `--pi-night-border` | `#27272A` | Dark boundary |
| `--pi-night-muted` | `#A1A1AA` | Dark secondary text |
| `--pi-indigo-900` | `#352E82` | Launch ink expansion and deep fluid indigo |
| `--pi-indigo-700` | `#333DA7` | Brand spectrum start and dark accent surface |
| `--pi-indigo-600` | `#5160C3` | Footer spectrum middle stop |
| `--pi-indigo-500` | `#6366F1` | Primary action and focus ring |
| `--pi-indigo-400` | `#7388DF` | Brand spectrum end |
| `--pi-indigo-300` | `#8C9EE6` | Footer spectrum light stop |
| `--pi-indigo-200` | `#A5B4F0` | Quiet signal and footer spectrum stop |
| `--pi-indigo-150` | `#A5B4FC` | Light accent surface |
| `--pi-mark-green` | `#00C37A` | Registration mark and proof/approved state only |
| `--pi-icon-violet` | `#7D3DF3` | Static favicon/app-icon field only; never a UI color ramp |

`--pi-indigo-150` and `--pi-indigo-200` are intentionally separate. The former is the interface accent surface; the latter is a precise homepage footer/quiet-state stop.

## 4. Semantic Mapping

The following table reflects the current CSS, including the implementation-specific `accent` mapping.

| Semantic token | Light value | Dark value | Meaning and normal consumers |
| --- | --- | --- | --- |
| `--background` | `--pi-white` | `--pi-night` | Page background |
| `--paper` | `--pi-white` | `--pi-night` | Content/paper surface used by workbench areas |
| `--foreground` | `--pi-black` | `--pi-neutral-50` | Primary text and high-contrast content |
| `--card` / `--popover` | White | Night Surface | Framed content and overlay surfaces |
| `--primary` | `--pi-indigo-500` | `--pi-indigo-500` | Stable primary semantic; primary action and progress |
| `--primary-foreground` | White | White | Text/icons on primary |
| `--secondary` | Neutral 100 | Night Surface | Secondary control surface |
| `--secondary-foreground` | Black | Neutral 50 | Content on secondary |
| `--muted` | Neutral 100 | Night Surface | Quiet grouping surface |
| `--surface-strong` | Neutral 300 | Night Border | Strong grouping surface |
| `--muted-foreground` | Neutral 600 | Night Muted | Secondary/supporting text |
| `--border` / `--input` | Neutral 300 | Night Border | Boundaries and field borders |
| `--ring` | Indigo 500 | Indigo 500 | Visible keyboard focus ring |
| `--accent` | Indigo 150 | Indigo 700 | Selection, interactive emphasis surface, workbench action background |
| `--accent-strong` | Indigo 900 | Indigo 150 | Strong emphasis text or high-contrast state |
| `--accent-light` | Indigo 150 | Indigo 700 | Soft emphasis surface/selected background |
| `--accent-foreground` | Indigo 900 | White | Content on accent |
| `--destructive` | Indigo 900 | Indigo 200 | Existing action/error fallback; do not infer a new red system |
| `--proof` | Mark Green | Mark Green | Verified or approved state |
| `--proof-ink` | Night | Night | Text/icons on Proof Green |
| `--signal` | Indigo 200 | Indigo 200 | Pending, attention, or signal color |
| `--signal-soft` | Neutral 100 | Neutral 100 | Soft signal surface |
| `--signal-ink` | Indigo 900 | Indigo 900 | Signal text/icons |
| `--ink-panel` | Night | Night | Media, preview, and ink stage |
| `--ink-panel-soft` | Night Surface | Night Surface | Secondary dark stage surface |
| `--ink-panel-text` | Neutral 50 | Neutral 50 | Main text on dark stage |
| `--ink-panel-muted` | Night Muted | Night Muted | Secondary text on dark stage |

### Important accent clarification

Some descriptive source text summarizes “accent” as Indigo 500. The live implementation is more specific: `primary` and `ring` are Indigo 500; `accent` is a theme-sensitive emphasis surface (`Indigo 150` in Light, `Indigo 700` in Dark). Use the CSS mapping when implementing components. This distinction prevents a pale Light selection surface from becoming a saturated primary button unintentionally.

### Example mapping

```text
--pi-indigo-500 (#6366F1)
  -> --primary (Light and Dark)
  -> --ring (Light and Dark)
  -> Tailwind semantic tokens: primary / ring
  -> use: primary action, progress, keyboard focus, selected/current emphasis where a strong indigo is needed
```

```text
--pi-mark-green (#00C37A)
  -> --proof (Light and Dark)
  -> Tailwind semantic token: proof
  -> use: verified/approved only, always paired with readable text or an icon
```

```text
--pi-indigo-150 (#A5B4FC)
  -> --accent and --accent-light in Light
  -> --accent-strong in Dark
  -> Tailwind semantic tokens: accent / accent-light / accent-strong
  -> use: light selection surfaces, strong Dark-theme emphasis text
```

## 5. Brand Effects

These are shared effects, not invitations to invent local gradients:

| Token | Current composition | Use |
| --- | --- | --- |
| `--brand-launch-ink` | Indigo 900 | Launch CTA click expansion |
| `--brand-spectrum-start` | Indigo 700 | Shared spectrum start |
| `--brand-spectrum-end` | Indigo 400 | Shared spectrum end |
| `--gradient-brand-spectrum` | 135deg, Indigo 700 to Indigo 400 | Homepage/media treatment |
| `--gradient-footer-spectrum` | Indigo 700/600/400/300/200 with descending opacity | Footer atmosphere |
| `--gradient-edge-spectrum` | Indigo 700 to transparent | Directional edge fade |
| `--mask-header-fade` | Black to transparent vertical mask | Homepage header readability |
| `--shadow-launch-cta` | `0 8px 32px rgb(0 0 0 / 12%)` | Signature CTA resting shadow |
| `--shadow-launch-ring` | white 72% 1px ring plus white 28% 24px glow | CTA click feedback |
| `--shadow-field-focus-light` | `0 0 20px rgb(0 0 0 / 8%)` | Restrained Light field focus halo |
| `--shadow-field-focus-dark` | `0 0 20px rgb(255 255 255 / 10%)` | Restrained Dark field focus halo |

## 6. Typography

Use the self-hosted Geist fonts configured by the app, with CJK fallbacks:

```text
Sans: Geist, PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif
Mono: Geist Mono, Noto Sans Mono CJK SC, ui-monospace, monospace
```

Sans is for headings, body, navigation, buttons, and marketing copy. Mono is restricted to IDs, versions, timestamps, dimensions, hashes, execution states, and other machine-readable metadata.

| Level | Size/weight/leading | Use |
| --- | --- | --- |
| Display | `clamp(2.25rem, 6vw, 4.5rem)`, 500, 1 | Hero or genuine section statement |
| Headline | `clamp(1.65rem, 3vw, 2.35rem)`, 750, 1.15, `-0.035em` | Product stage and section heading |
| Title | 1.05-1.5rem, 650-750, 1.05-1.5 | Panel and workbench title |
| Body | 0.875-1.125rem, 400-500, 1.5-1.65 | Explanation and review copy |
| Label | 0.6875rem, 650, 1.25 | Compact operational metadata |

Keep body lines near 65-75 characters, or roughly 72ch. Normal tracking is the default. Tight tracking is only for large headings and never below `-0.04em`; do not use negative tracking in labels or body text. Navigation and controls use normal capitalization rather than all-caps prose.

## 7. Layout, Spacing, and Geometry

- Base spacing unit: 4px.
- Common spacing: 4, 8, 12, 16, 24, 32, and 48px.
- Page horizontal padding: 16px mobile, 24px small screens, 32px large screens.
- Homepage hero content max width: 896px.
- Main navigation, footer, and primary content max width: 1280px.
- Typical section vertical whitespace: 80px; large screens may use 112px.
- Prefer whitespace and alignment for grouping instead of wrapping every section in a card.

CSS radius tokens are `compact: 8px`, `control: 10px`, `media: 12px`, `surface: 14px`, and `feature: 16px`; the default `--radius` is the 10px control radius. The source design frontmatter also names a 6px compact navigation/control-sm radius and a 999px pill radius. Follow the concrete component rule where it exists.

The system is flat by default. Use a semantic 1px boundary or tonal change before adding a shadow. Ordinary workbench panels do not use diffuse elevation.

## 8. Component Consumption Rules

### Buttons

Product `.button-primary` and `.button-secondary` share stable geometry: inline-flex, at least 44px high, 10px vertical and 16px horizontal padding, 10px radius, 14px text, 700 weight, 8px internal gap. Primary uses `--accent` and `--accent-foreground` in the current workbench CSS; secondary uses `--muted` and `--foreground`. This is distinct from the stable `--primary` token and is intentional in the shipped workbench.

Hover moves the control up 2px over 180ms. Disabled controls are stationary at 52% opacity and show a not-allowed cursor. Focus remains visible through the global 3px `--ring` outline with 3px offset.

The homepage Launch CTA is a branded exception: 64px tall, full pill, inverted against its context, with a 48px circular trailing action area. On activation, Indigo 900 expands from the trailing area, the label changes to a preparing state, and the outer ring expands/fades. Do not propagate this signature geometry to every product button.

### Badges and status

`.status-badge` is a compact full pill using Geist Mono, 5px by 9px padding, 0.68rem-ish text, 650 weight, and a 5px icon/text gap. Proof uses `--proof`/`--proof-ink`; signal uses `--signal-soft`/`--signal-ink`; neutral uses `--muted`/`--muted-foreground`. Every state has text or an icon. Color alone is never evidence.

### Cards and panels

- Media cards: 12px radius, portrait media where appropriate, shared spectral treatment, subtle boundary, no heavy blur shadow.
- Workbench panels: 14px radius, 1px semantic border, paper or muted surface, task-sized padding.
- Flow nodes: 12px radius, compact row, stable dimensions; selection changes border/tone and hover may translate at most 1px without resizing.
- Avoid nested cards, decorative glass surfaces, gradient text, and generic SaaS card grids.

### Fields

Fields use semantic border and paper background, 8-10px radius, and at least 44px control height. Focus changes border/outline to `--ring` and may add the restrained field halo. Placeholder and disabled text must remain readable in both themes. The source workbench uses 8px radius for compact inputs and 9px for larger form fields.

### Navigation and release stages

Marketing navigation is fixed, blend-aware, and uses the shared header fade over the opening scene. Product navigation is a conventional dark side rail using Night, neutral, and indigo roles. The release navigator is a horizontal six-stage sequence: the current stage gets an indigo bottom boundary and current index surface, locked steps are visibly distinct and have reduced opacity, and the list remains horizontally scrollable rather than compressing labels.

## 9. Accessibility and Motion

- Body text contrast target is at least 4.5:1; large text at least 3:1.
- Keyboard focus is visible: global interactive elements use a 3px `--ring` outline with 3px offset; skip-link focus is also explicit.
- Verification, pending, failure, and review states include text, icon, or structural cues in addition to color.
- `prefers-reduced-motion: reduce` disables smooth scrolling and transitions/animations for spin, sheet, and tooltip surfaces. Reduced motion must preserve content and operation, using immediate states or a softened feedback effect.
- Prefer transform, opacity, blur, mask, and shadow for motion. Do not change layout dimensions to create animation jitter.
- Text must fit at mobile and desktop widths without overlap, occlusion, or accidental resizing of stable controls.

## 10. Color and Change Governance

1. Confirm the color need in the homepage or an explicit product requirement.
2. Reuse an existing primitive and semantic role whenever possible.
3. If a tonal gap is real, use ColorBox only to generate a candidate.
4. Preserve all homepage production anchors after export.
5. Map candidates to semantic roles before production use; never consume a raw candidate in a component.
6. Validate contrast, Light/Dark, hover, focus, disabled, reduced motion, and responsive behavior.
7. Compare a homepage screenshot to ensure a token-only refactor made no unintended visual change.
8. Synchronize `app/globals.css`, `DESIGN.md`, and the Feishu design-system document when the production contract changes.

ColorBox is supplementary. Its four ramps are Spectral Indigo (`#6366F1`), Neutral (`#737373`), Night Ink (`#03040A`), and restricted Proof Green (`#00C37A`) in OKLCH mode with 11 major steps. Export steps map 0..10 to project 50..950. Generated ramps fill documented gaps only; they never overwrite homepage anchors.

## 11. Forbidden Patterns

- Do not present PurpleInk as a generic prompt-to-video or generic AI design generator.
- Do not invent evidence, customer logos, metrics, or testimonials.
- Do not use decorative color orbs, glass cards, gradient text, nested cards, or generic purple SaaS styling.
- Do not recreate shared spectral effects with arbitrary local gradients or opacity values.
- Do not hardcode white, black, zinc, slate, purple, or violet values when a semantic role already exists.
- Do not use Proof Green for ordinary CTAs or decoration.
- Do not expand Icon Violet into a second interface palette.
- Do not add orange/red state families merely to distinguish a state; add labels, icons, and structure first.
- Do not use color as the sole state signal.

## 12. Source Map

| Source | How to use it |
| --- | --- |
| `app/globals.css` | Normative primitive/semantic values, Tailwind aliases, effects, focus, reduced-motion, and shipped workbench component CSS |
| `DESIGN.md` | English design intent, component concepts, visual principles, and frontmatter defaults |
| `docs/PURPLEINK_DESIGN_SYSTEM_FEISHU.md` | Detailed Chinese production specification, ColorBox workflow, typography, spacing, motion, accessibility, and change process |
| `docs/PURPLEINK_COLOR_SYSTEM.md` | Palette governance and semantic color summary |
| `docs/colorbox-import.json` | Candidate ramp configuration; not a production token file |

When adding or changing a component, begin with its semantic role, consult the live CSS mapping, then check the relevant component section above. Keep exact primitive use limited to assets and shared effect definitions.
