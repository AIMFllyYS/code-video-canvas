---
kind: design
name: 使用 SVG data-URI 自定义光标解决 React Flow 手型不可见问题
source: session
category: adr
---

# 使用 SVG data-URI 自定义光标解决 React Flow 手型不可见问题

_来源：2ebef8c → 7c2ea78 提交周期内记录的编码计划——内容为规划时意图，实现可能滞后或有出入。_

**状态：** accepted

## 背景
React Flow 画布使用系统关键字光标（grab/grabbing/pointer），颜色由 Windows 光标主题决定。用户使用白色/反色系统指针方案时，开手型落在浅色画布上融为一体不可见。

## 决策驱动
- 跨主题可见性
- 不依赖 OS 主题设置
- 最小改动范围

## 备选方案
- **SVG data-URI 自定义光标** — 优点：颜色烘焙进 SVG 不受 OS 主题影响、一套光标两主题通用、纯 CSS 改动；缺点：data-URI 内需 URL 编码特殊字符
- **修改系统光标主题** _（已否决）_ — 优点：一劳永逸；缺点：影响全局而非应用、用户可能不希望改变系统设置
- **改用非手型光标** _（已否决）_ — 优点：简单；缺点：破坏用户已有的平移交互预期

## 决策
在 globals.css 中定义 --cursor-grab 和 --cursor-grabbing 两个 CSS 变量，值为内联 SVG data-URI（深色填充 #1C1C1E + 白色描边 #FFFFFF），通过 .react-flow 祖先类覆盖 React Flow 的关键字光标，热点坐标分别设为 10 8 和 10 10。

## 影响
纯 CSS 改动不影响构建，无需测试；在白天与夜间两种主题下均清晰可见；末尾保留 grab/grabbing 关键字作为 SVG 加载失败的兜底。可选扩展：统一 pointer 态光标覆盖 Controls 按钮等区域。