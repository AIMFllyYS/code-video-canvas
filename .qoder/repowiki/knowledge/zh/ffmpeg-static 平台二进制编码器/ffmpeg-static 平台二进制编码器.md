---
kind: external_dependency
name: ffmpeg-static 平台二进制编码器
slug: ffmpeg-static
category: external_dependency
category_hints:
    - client_constraint
scope:
    - '**'
---

### ffmpeg-static 集成约束
- 编码参数固定：libx264 / medium preset / CRF 18 / yuv420p / bitexact / faststart，输出原子 rename 提交。