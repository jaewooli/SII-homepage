# SII Homepage - Development & Design Guidelines

This document outlines the strict guidelines for editing, developing, and maintaining the SII Homepage codebase. All developers (including AI assistants) must read and adhere to these directives.

---

## 🎨 1. Design & UI/UX Principles
The SII Homepage utilizes a high-performance developer console aesthetic, heavily inspired by the **official Unity and Unreal Engine websites**. 

### 🚫 Prohibited Design Styles
- **No Toss/KakaoBank Style**: Avoid soft rounded containers (`border-radius: 20px+`), bubble shapes, pastel/friendly gradients, or playful emojis.
- **No Old Bank Styles**: Avoid dated, cluttered, table-heavy light-themed designs.
- **No "AI-Created" Look**: Avoid generic placeholder graphics, abstract wavy SVGs, or standard default template components.

### 🎯 Mandatory Design Tokens
- **Base Theme**: Default dark mode. Base background is deep black/obsidian (`#040508`), and card surfaces use deep slate (`#0a0d16`).
- **Accent Lighting**: Sharp electric cyan (`#00f0ff`), high-fidelity blue (`#0066ff`), neon green (`#00ff66`) for success indicators, and neon red (`#ff003c`) for security errors.
- **Sharp Geometry**: Layout components must use sharp rect borders (`border-radius: 2px` or `4px` max) to maintain a structural, industrial feel.
- **Typography Stack**:
  - **Headings**: `Space Grotesk`, sans-serif (bold, uppercase, tracked out).
  - **HUD/Telemetry/Tags**: `Fira Code`, monospace (`[PHASE_01]`, `// PRESENTER`).
  - **Body Content**: `Outfit`, sans-serif (clean, lightweight).

---

## 🔬 2. Verification Flow
Whenever modifying files or updating the application:
1. **Dev Server Verification**: Ensure the server runs properly (`npm run dev`) and logs no errors.
2. **Page Loading Checks**: Verify routes (e.g., `/homepage/main`, `/homepage/login`, `/homepage/dreamhack`) serve the corresponding files with correct content.
3. **Responsive Checks**: Ensure layout behaves correctly under standard mobile viewports.

---

## 🐙 3. Git & GitHub Flow
All changes must be committed and pushed to the remote repository.
- **Commit Messages**: Write meaningful, structured commit messages detailing the changes.
- **Push**: Always push branches/updates to remote tracking branches on GitHub after verification is complete.
