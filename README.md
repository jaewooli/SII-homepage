# 🛡️ INHACK Portal & Chrome Extension

인하대학교 정보보안 학술 동아리 **INHACK**의 공식 웹 포탈 및 드림핵([dreamhack.io](https://dreamhack.io)) 문제 풀이 이력 실시간 수집 연동을 위한 크롬 확장 프로그램 프로젝트입니다.

---

## 🏗️ 시스템 아키텍처 (System Architecture)

본 프로젝트는 **인핵 웹 포탈(Express + SQLite)**과 **크롬 확장 프로그램(Manifest V3)**의 긴밀한 연동으로 구성됩니다.
크롬 확장이 드림핵 워게임 문제 정답 제출 성공 응답(`{ correct: true }`)을 가로채어 로컬 웹 포탈 서버에 실시간으로 전송 및 동기화합니다.

```
+------------------+                   +----------------------+
|  Dreamhack.io    | Hook fetch/XHR    |   Chrome Extension   |
|  Wargame Portal  |------------------>|   (Manifest V3)      |
+------------------+                   +-----------+----------+
                                                   |
                                                   | Forward solved logs
                                                   v
+------------------+   Read/Write DB   +-----------+----------+
| SQLite database  |<----------------->|  INHACK Web Portal   |
|   (users.db)     |                   |  (Express, Port 8080)|
+------------------+                   +----------------------+
```

---

## 🚀 주요 제공 기능 (Key Features)

### 1. 사용자 계정 및 권한 관리 (User Account Management)
* **역할 및 등급 이중화**: 최고 관리자(Super Admin), 일반 관리자(Normal Admin), 일반 회원의 세분화된 권한 체계.
* **보안 통제**: 회원 가입 패스워드 암호화(`bcryptjs` 적용), 첫 로그인 시 패스워드 변경 의무화, 승인 모달 패스워드 재검증.
* **관리 편의 기능**: CSV 파일을 이용해 복수의 회원 계정을 한 번에 일괄 업로드 및 자동 가입시킬 수 있는 일괄 등록 기능 탑재.

### 2. 비주얼 블록 에디터 (Visual Block Editor)
* **컨텐츠 관리**: 동아리 소개(Home), Curriculum, 특별 행사(Other Events), CTF 챌린지 데이터 등 사이트의 다양한 섹션을 UI 상에서 드래그 조절 핸들이 탑재된 2단 분할 에디터 화면으로 시각적 편집.
* **실시간 미리보기**: 마크다운 편집 시 실시간으로 우측 화면에 렌더링된 정적 HTML Live Preview 제공.
* **유효성 검사**: CTF 문제 등록 시 카테고리(`WEB`, `PWN`, `REV` 등)의 유효성 상시 검증 및 비정상 형식 차단.

### 3. 메뉴 및 데이터 삭제 시 안전 장치 (Backup & Recovery)
* **스마트 클리닝**: 메뉴나 섹션 삭제 시, 이에 종속된 정적 결과물인 `.html` 파일은 즉시 영구 삭제하되 원본 설정 파일인 `.json`은 `.json.bak` 파일로 자동 백업하여 디스크에 보관.
* **원클릭 복원**: 어드민 네비게이션 편집기에서 `♻️ 삭제된 메뉴 복구` 버튼을 눌러 디스크 상의 `.json.bak` 리스트를 조회하고 즉시 복원. 복원 시, 해당 메뉴가 원래 있던 부모 메뉴 구조 내부 또는 최상위 메뉴 리스트로 자동 역추적 복원 및 SQLite DB 동기화 완료.

### 4. 드림핵 wargame 실시간 풀이 동기화 (Dreamhack Tracker)
* **XHR/Fetch Monkey-Patching**: 드림핵 사이트 접속 중 정답 플래그 제출이 감지되면 Chrome Extension Content Script가 이를 캐치하여 동기화 중계.
* **푼 문제 트래킹**: 관리자 패널의 회원 리스트에 계정별 '푼 문제' 개수를 표시하며, 클릭 시 해당 계정이 드림핵 사이트에서 푼 실제 챌린지 명칭과 일시를 모달 팝업으로 상세 조회 가능.

---

## 📂 디렉토리 구조 (Directory Map)

* **[`ChromeExtension/`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/ChromeExtension)**: 크롬 확장 프로그램 소스
  * `manifest.json`: Manifest V3 설정 파일
  * `content.js`: Dreamhack.io 페이지 내부 API 통신 가로채기(Monkey-patching) Content Script
  * `background.js`: 백그라운드 서비스 워커 (이벤트 메시지 중계 및 로컬 포탈 API 통신)
* **[`INHACK-Homepage/`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/INHACK-Homepage)**: 메인 웹 포탈 프로젝트 소스
  * **[`server/`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/INHACK-Homepage/server)**: Node.js Express 백엔드 소스
    * [`app.js`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/INHACK-Homepage/server/app.js): 엔트리 서버 실행 파일 (포트 `8080` 기동)
    * [`routes/admin.js`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/INHACK-Homepage/server/routes/admin.js): 어드민 계정 권한 제어, 블록 컨텐츠 업데이트, 휴지통 복원 API
    * [`helpers/template.js`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/INHACK-Homepage/server/helpers/template.js): JSON 구조를 정적 HTML 조각으로 변환하는 컴파일러
  * **[`src/`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/INHACK-Homepage/src)**: 프론트엔드 자원
    * [`css/style.css`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/INHACK-Homepage/src/css/style.css): 전체 사이트 레이아웃, 대시보드 리사이저, 사용자 테이블 반응형 스크롤 CSS
    * [`js/admin.js`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/INHACK-Homepage/src/js/admin.js): 비주얼 블록 에디터 프론트 로직 및 복구 팝업 모달 관리

---

## 💻 개발 퀵 스타트 (Quick Start Commands)

### 1. 의존성 패키지 설치
```bash
npm install
```

### 2. 개발 서버 기동 (Nodemon 자동 소스 리로드)
```bash
npm run dev
```

### 3. 정적 프로덕션 서버 실행
```bash
npm start
```

---

> [!NOTE]
> 개발 및 유지 보수를 진행하기에 앞서 [`DEVELOPMENT_GUIDELINES.md`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/DEVELOPMENT_GUIDELINES.md) 및 [`PROJECT_MEMORY.md`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/PROJECT_MEMORY.md)를 탐독하시는 것을 권장합니다.