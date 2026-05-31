# INHACK Homepage - Development & Design Guidelines

This document outlines the strict guidelines for editing, developing, and maintaining the INHACK Homepage codebase. All developers (including AI assistants) must read and adhere to these directives.

---

## 🎨 1. Design & UI/UX Principles
The INHACK Homepage utilizes a formal, institutional portal aesthetic. The design is structured, professional, and rigid, suitable for an official academic security research organization.

### 🚫 Prohibited Design Styles
- **No Hacker/Cyber HUD Aesthetic**: Avoid neon glows, telemetry bars, retro-terminal headers, scanline grids, uppercase-tracked mono fonts, or CLI-style decorations (e.g. `// OVERVIEW`, `> TERMINAL_MENU`).
- **No Playful/Friendly Styles**: Avoid Kakao/Toss styles with soft rounded containers (`border-radius: 20px+`), pastel colors, or playful emojis.
- **No Old Bank Styles**: Avoid dated, cluttered, table-heavy light-themed designs.

### 🎯 Mandatory Design Tokens
- **Base Theme**: Default dark mode. Base background is premium dark slate-blue (`#0b0f19`), and card surfaces use structured slate (`#151b2d`).
- **Accent Lighting**: Elegant sapphire/indigo blue (`#3b82f6` primary, `#2563eb` hover) for primary interactions. Use forest green (`#10b981`) for success/secure indicators and muted crimson (`#ef4444`) for errors/warnings.
- **Sharp Geometry & Rigid Layout**: Layout components must use clean, rigid borders (`border-radius: 4px` max) and structured grid structures. No decorative angled corners or background scanlines.
- **Typography Stack**:
  - **Headings & Navigation**: `Outfit`, sans-serif (clean, bold, Title Case, standard tracking).
  - **Body Content**: `Outfit`, sans-serif (highly readable, lightweight).
  - **Technical Logs/Data**: `Fira Code`, monospace (only for actual data values such as IP addresses, timestamps, hashes, or logs).

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
