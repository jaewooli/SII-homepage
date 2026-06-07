# 🛡️ INHACK Portal & Chrome Extension - Technical Specifications

인하대학교 정보보안 학술 동아리 **INHACK**의 공식 포탈 시스템 및 드림핵([dreamhack.io](https://dreamhack.io)) 플랫폼 문제 풀이(Wargame Solves) 이력 실시간 감지/동기화를 위한 Manifest V3 기반 크롬 확장 프로그램 통합 프로젝트입니다.

---

## 🏗️ 1. System Architecture & Core Data Flow

본 시스템은 **보안 학습 관리 포탈(Node.js Express + SQLite)**과 **클라이언트 사이드 감사 에이전트(Chrome Extension)**의 상호 작용을 통해 회원의 실시간 실습 통계를 수집 및 시각화합니다.

```
       +---------------------------------------------+
       |             Chrome Browser                  |
       |  +------------------+                       |
       |  |  Dreamhack.io    |                       |
       |  |  (Main World)    |                       |
       |  +--------+---------+                       |
       |           | Inject hooks & hook Fetch/XHR   |
       |           v                                 |
       |  +------------------+                       |
       |  |  Content Script  |                       |
       |  |  (Isolated)      |                       |
       |  +--------+---------+                       |
       |           | Message Passing                 |
       |           v                                 |
       |  +------------------+                       |
       |  |Background Worker |                       |
       |  +--------+---------+                       |
       +-----------|---------------------------------+
                   | HTTP POST /dreamhack/solve-log (with Session cookie)
                   v
       +---------------------------------------------+
       |          Express Server (:8080)             |
       |  +---------------------------------------+  |
       |  |         routes/dreamhack.js           |  |
       |  +-------------------+-------------------+  |
       |                      |                      |
       |            +---------+---------+            |
       |            | Write logs        | Write DB   |
       |            v                   v            |
       |     +-------------+    +---------------+    |
       |     | logs/solves |    | SQLite (users)|    |
       |     +-------------+    +---------------+    |
       +---------------------------------------------+
```

### 1) Dreamhack Interception & Hooking Mechanism
* **Main World Hooking**: [`ChromeExtension/content.js`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/ChromeExtension/content.js)는 보안 컨텍스트 격리를 우회하기 위해 `dreamhack.io` 메인 월드(Main World) 컨텍스트에 스크립트를 동적으로 주입하여 브라우저의 기본 `window.fetch` 및 `XMLHttpRequest` API를 후킹(Monkey-Patching)합니다.
* **Event Bridging**: 정답 플래그 제출 API 호출 결과가 `{ correct: true }`일 시, 커스텀 DOM Event(`DREAMHACK_CHALLENGE_SOLVED_EVENT`)를 발송하여 격리된 콘텐츠 스크립트 영역으로 데이터를 전달합니다.
* **SameSite Lax Bypass**: 크로스 오리진 요청 시 세션 쿠키 미전송 이슈를 예방하기 위해, 익스텐션 백그라운드가 직접 API를 호출하는 대신 포탈과 동일 오리진을 보장하는 콘텐츠 스크립트 측에서 `fetch` 통신을 처리하도록 설계하여 쿠키 전송의 안정성을 확보했습니다.

---

## 🚀 2. Key Subsystems & Features

### 1) Multi-tier Authorization Model (계정 권한 이중화)
* **Super Admin & Normal Admin**: 최고 관리자(`'developer'`)와 일반 관리자 계정을 백엔드 미들웨어 레벨에서 구분하여 인가(Authorization)를 제어합니다.
* **UI/UX Guarding**: 일반 관리자가 최고 관리자를 해임, 차단 또는 계정을 임의 삭제할 수 없도록 프론트엔드(`canManage` 플래그)와 백엔드 API에서 교차 검증 보호막을 제공합니다.
* **CSV 일괄 등록**: 다수의 회원 정보를 **아이디,이름,비밀번호** 구조의 CSV 파일 업로드를 통해 단일 배치로 일괄 가입 처리하는 고속 회원 가입 인프라를 제공합니다.

### 2) Visual CMS Block Compiler (블록 기반 컨텐츠 관리 엔진)
* **JSON-to-HTML Compilation Engine**: [`helpers/template.js`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/INHACK-Homepage/server/helpers/template.js)의 컴파일러가 JSON 블록 스키마(`header`, `features`, `timeline`, `ctf_dashboard` 등)를 해석하여 시각적인 정적 HTML 페이지로 변환해 서빙합니다.
* **2단 분할 리사이저**: 관리자가 UI 상에서 트리 뷰와 에디팅 폼 사이의 경계를 드래그하여 실시간으로 리사이징(`workspace-resizer`)할 수 있는 UI 환경을 갖추고 있습니다.

### 3) Academic Semester Archiver (학기 전환 도구)
* **Consolidated Aggregation**: 학기 종료 시 실행하며, 한 학기 동안 적재된 `other-events`(특별 행사), `curriculum`(상세 4개 학습 트랙 포함), `projects`(동아리 연구), `ctf`(스코어보드 및 챌린지) 데이터를 단일 `archive-{semesterCode}.json` 데이터 파일로 병합하여 박제합니다.
* **Spacer Injection**: 병합 프로세스 과정에서 컴파일 템플릿의 가시성 확보를 위해 각 활동 세션 단락 사이에 `1.75rem` 높이의 `spacer` 블록을 자동으로 인젝션합니다.
* **Semester Reset**: 아카이빙 완료 후 다음 학기 수급을 위해 프로젝트 목록 및 CTF 챌린지 목록, 리더보드 데이터 스키마를 초기 빈 템플릿(Default Template) 상태로 깨끗하게 리셋합니다.

### 4) Safe Deletion & Recovery System (데이터 안전 파기 및 복원)
* **Resource Optimization**: 메뉴 관리에서 특정 메뉴 삭제 시, 설정 파일인 `.json`만 `.json.bak` 파일로 남겨 백업하고, 컴파일 결과물인 `.html` 정적 파일은 리소스 절약을 위해 디스크에서 즉시 완전 소멸시킵니다.
* **Reverse Tracking Restoration**: 어드민 UI 상의 `♻️ 삭제된 메뉴 복구` 모달을 통해 지워진 백업 리스트(`.json.bak`)를 비동기 스캔합니다. 복원 시 백엔드에서 원본 파일을 되살리고, 해당 메뉴가 원래 위치했던 계층(서브메뉴인 경우 해당 부모 뎁스의 submenus 배열, 최상위인 경우 최상위 배열 끝)을 역추적하여 `navigation.json`에 안전하게 다시 결합시킵니다.

---

## 📂 3. Directory Map & Code References

* **[`ChromeExtension/`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/ChromeExtension)**: Manifest V3 크롬 확장 애플리케이션
  * [`manifest.json`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/ChromeExtension/manifest.json): 확장 앱 인프라 및 권한 선언
  * [`content.js`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/ChromeExtension/content.js): Main World Fetch/XHR Hook 주입 및 SameSite Lax 우회 통신 처리
  * [`background.js`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/ChromeExtension/background.js): 이벤트 중계 서비스 워커
* **[`INHACK-Homepage/`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/INHACK-Homepage)**: 웹 포탈 메인 서비스 소스
  * **[`server/`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/INHACK-Homepage/server)**: Node.js Express 백엔드 엔진
    * [`app.js`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/INHACK-Homepage/server/app.js): Express 인스턴스 초기화 및 라우터 마운트 엔트리
    * [`config/db.js`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/INHACK-Homepage/server/config/db.js): SQLite 마이그레이션 및 초기 사용자 시딩 스키마 정의
    * [`routes/admin.js`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/INHACK-Homepage/server/routes/admin.js): 인가 정책 관리, 학기 전환 병합 알고리즘, 복원 파이프라인
    * [`helpers/template.js`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/INHACK-Homepage/server/helpers/template.js): 정적 HTML 컴파일 렌더러
  * **[`src/`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/INHACK-Homepage/src)**: 퍼블릭 자바스크립트 및 에디터 리소스
    * [`css/style.css`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/INHACK-Homepage/src/css/style.css): 전역 스타일 토큰 정의 및 테이블 반응형 뷰 스크롤링 CSS
    * [`js/admin.js`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/INHACK-Homepage/src/js/admin.js): CMS 에디터 상태 동기화 및 동적 복원 모달 UI 스크립트

---

## 💻 4. Environment Setup & Launch Commands

### 1) Prerequisites
프로젝트 루트 폴더 및 Express 포탈 루트(`/INHACK-Homepage`)에 동일하게 Node.js 런타임 환경이 요구됩니다.

### 2) Install Dependencies
```bash
npm install
```

### 3) Development Run (Nodemon Hot Reloading)
```bash
npm run dev
```

### 4) Production Startup
```bash
npm start
```

---

> [!IMPORTANT]
> 개발 및 배포 가이드라인에 대한 준수 사항은 [`DEVELOPMENT_GUIDELINES.md`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/DEVELOPMENT_GUIDELINES.md) 및 [`PROJECT_MEMORY.md`](file:///mnt/e/Programming/Projects/Hosting/SII-homepage/PROJECT_MEMORY.md)에서 더 상세히 추적 및 관리되고 있습니다.
