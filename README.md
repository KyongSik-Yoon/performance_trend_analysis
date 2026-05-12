# Performance Trend Analysis

JENNIFER5 OpenAPI를 활용한 성능 추이 분석 도구입니다.
장기 성능 데이터를 시각화하고 시계열·히트맵 분석을 통해 용량 계획(Capacity Planning)을 지원합니다.

---

## 기술 스택

- **Vite** (빌드 도구 / 개발 서버)
- **Chart.js** (메인 시계열 차트)
- **D3.js / d3-hexbin** (Overall 히트맵, 요일×시간대 히트맵)
- **Flatpickr** (날짜 선택)
- **Pretendard JP** (웹 폰트)

---

## 프로젝트 구조

```
performance-trend-analysis/
├── index.html              # 랜딩 페이지 (JENNIFER Extension Labo)
├── pta/
│   ├── index.html          # PTA 대시보드 (메인 앱)
│   └── help.html           # 분석 가이드 (팝업 헬프)
├── src/
│   ├── main.js             # 핵심 로직 (API, 차트, 히트맵, 인터랙션)
│   ├── config.js           # 설정 모듈 (window.PTA_CONFIG 참조)
│   └── style.css           # 전체 스타일시트
├── public/pta/
│   ├── config.js           # 런타임 설정 파일 (빌드 후에도 수정 가능)
│   └── vite.svg            # 파비콘
├── vite.config.js          # Vite 빌드 및 프록시 설정
├── fix-paths.js            # 빌드 후 경로 보정 스크립트
├── help_ko.md              # 도움말 원본 (한국어)
├── help_ja.md              # 도움말 원본 (일본어)
├── system_specification.md # 시스템 상세 사양서
├── DEPLOY_GUIDE_NGINX.md   # Nginx 배포 가이드
└── package.json
```

---

## 빠른 시작 (Quick Start)

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 설정 (Runtime Configuration)

빌드 전·후 모두 설정을 변경할 수 있도록 `public/pta/config.js` 파일을 사용합니다.

```javascript
window.PTA_CONFIG = {
  BASE_URL: 'https://your-jennifer-server/',
  API_DOMAIN: '',
  TOKEN: 'your-token-here'
};
```

| 변수명 | 설명 |
|---|---|
| `BASE_URL` | Vite 개발 서버의 API 프록시 대상 주소 |
| `API_DOMAIN` | 프록시 없이 API 서버에 직접 요청할 때 사용 (Nginx 배포 시 비워둠) |
| `TOKEN` | JENNIFER5 OpenAPI 인증 토큰 |

> [!NOTE]
> `dist/pta/config.js`를 수정한 후 브라우저를 새로고침하면 변경사항이 즉시 반영됩니다. 다시 빌드할 필요가 없습니다.

### 3. 개발 서버 실행
```bash
npm run dev
```
- 랜딩 페이지: `http://localhost:5177/`
- PTA 대시보드: `http://localhost:5177/pta/`

---

## 주요 기능

- **7종 메트릭 분석**: 응답시간, TPS, Hit수, 동시사용자, 에러율, CPU, 힙메모리
- **비지니스 / 인스턴스 전환**: 도메인 내에서 비지니스 단위 또는 인스턴스 단위로 분석 대상 전환
- **계층형 도메인 셀렉터**: 브레드크럼 방식의 도메인 그룹 탐색
- **이동평균선 (7일/30일)**: 장기 트렌드 분석
- **드래그 기간 선택 및 키보드 탐색**: 방향키로 구간 이동, Shift+방향키로 범위 확장/축소
- **Overall 히트맵**: D3 Hexbin 기반의 부하 vs 성능 상관 분석
- **요일×시간대 히트맵**: IQR 통계 기반의 자동 이상치 감지
- **상세 슬라이드 패널**: 히트맵 셀 클릭 시 인라인 바 차트로 상세 데이터 확인
- **팝업 도움말**: 섹션별 문맥 연동 분석 가이드
- **Mock 데이터 폴백**: API 장애 시 자동 샘플 데이터 생성

---

## 배포 (Production Deployment)

### 빌드
```bash
npm run build
```
빌드 결과물은 `dist/` 폴더에 생성됩니다. `fix-paths.js`가 자동 실행되어 `pta/` 하위 HTML의 에셋 경로를 보정합니다.

> [!IMPORTANT]
> 모든 설정은 `public/pta/config.js`에서 관리하며, 빌드 후에도 `dist/pta/config.js`를 수정하여 즉시 반영할 수 있습니다.

### Nginx 배포
Nginx 환경에서의 상세한 배포 절차(API 프록시, HTTPS 적용 등)는 [DEPLOY_GUIDE_NGINX.md](./DEPLOY_GUIDE_NGINX.md)를 참고하세요.
