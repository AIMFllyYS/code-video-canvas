# N1 HyperFrames Canary

This directory is the pinned HyperFrames `0.7.70` integration canary for Task N1.5.

The composition is deliberately self-contained: its GSAP `3.15.0` runtime is embedded as a `data:` script, it has no media or repository-relative assets, and it performs no network requests. The single `640x360`, `24 fps`, `2.5 s` root owns one synchronously-created paused GSAP timeline at `window.__timelines["n1-hyperframes-canary"]`. Rendering state is determined only by timeline seek.

Run from the repository root:

```powershell
Push-Location -LiteralPath 'scripts/spikes/hyperframes-canary'
$hfDoctor = pnpm.cmd exec hyperframes doctor --json | ConvertFrom-Json
Pop-Location
if ($hfDoctor.ok -ne $true) { throw 'HyperFrames doctor payload.ok is not true' }

pnpm.cmd exec hyperframes check scripts/spikes/hyperframes-canary --snapshots --json
pnpm.cmd exec hyperframes render scripts/spikes/hyperframes-canary --output .data/spikes/hyperframes-canary.mp4 --quality draft
```

The spike runner records only normalized, path-free proof in the ignored `.data/spikes/hyperframes.json`: CLI payload hashes, non-empty snapshot SHA-256 values, render exit code, normalized ffprobe fields, and the MP4 SHA-256. Generated snapshots and media are local evidence and must not be committed.
