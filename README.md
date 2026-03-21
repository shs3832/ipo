# IPO Calendar Alerts

공모주 일정을 자동 수집해 내부 캘린더에 반영하고, 청약 마감 당일 오전 10시에 분석 메일을 보내는 개인용 서비스입니다.  
1차는 단일 관리자 중심으로 운영하지만, 데이터 모델과 알림 파이프라인은 향후 다중 수신자 확장을 전제로 설계되어 있습니다.

## 프로젝트 성격

- `Next.js 16` App Router 기반 웹앱
- `Prisma + PostgreSQL(Neon)` 데이터 저장
- `Vercel` 배포 및 Cron 실행
- `Gmail SMTP` 기반 이메일 발송
- `OpenDART` 기반 공모주 일정/기초 재무 데이터 수집

핵심 목표는 다음 3가지입니다.

- 공모주 일정을 캘린더에서 빠르게 확인
- 청약 마감 당일 오전 10시에 분석 메일 발송
- 점수형 분석을 기반으로 빠른 판단 지원

## 현재 구현 사항

### 사용자 화면

- 월간 캘린더에서 `청약마감 / 환불 / 상장` 일정 표시
- 일정 종류 체크박스 필터
- 캘린더 체크박스 필터는 현재 브라우저별로 마지막 선택 상태를 기억
- 홈 화면 상단 히어로 + 요약 카드 + 월간 캘린더
- 캘린더 아래 `종목 개요` 카드 목록
- 현재 캘린더는 평일 기준으로만 보이며 토요일/일요일 열은 숨김 처리됨
- 모바일에서는 캘린더를 숨기고 `종목 개요` 중심으로 노출
- 종목 상세 페이지에서 일정, 가격, 점수, 분석 요약, 이벤트 타임라인 제공
- 관리자만 볼 수 있는 민감 정보 분리
- 로그인 / 관리자 / 상세 페이지까지 공통 톤으로 재정리된 카드형 UI 적용
- 상세 페이지는 이동 중 중앙 스피너 기반 loading 상태를 표시
- 관리자 페이지는 이동 중 스피너와 카드 틀을 함께 보여주는 loading 상태를 표시

### 라우팅 / 성능

- 홈 `/`는 정적 경로로 prerender 되며 `5분` 단위로 재검증됩니다.
- 공개 홈 데이터는 관리자 대시보드 조회와 분리된 read model을 사용합니다.
- 공개 조회 경로에서는 관리자 bootstrap 같은 DB write를 수행하지 않습니다.
- 상세 페이지 공개 데이터는 캐시된 helper로 읽고, 관리자 메타데이터만 조건부로 덧붙입니다.
- 관리자 페이지는 snapshot을 1회만 읽고 상태 요약은 메모리에서 계산합니다.

### 스타일 구조

- 전역 엔트리: [`src/app/globals.scss`](/Users/shs/Desktop/Study/ipo/src/app/globals.scss)
- 공통 토큰 / 리셋 / 공용 규칙: [`src/styles`](/Users/shs/Desktop/Study/ipo/src/styles)
- 페이지별 스타일: 각 라우트의 `*.module.scss`
- 기존 단일 `globals.css` 중심 구조에서 `공통 SCSS + 페이지별 모듈 SCSS` 구조로 분리됨
- 공통 반응형 기준의 모바일 브레이크포인트는 현재 `1024px`

### 데이터 수집

- `IPO_SOURCE_URL`이 있으면 외부 JSON 우선 사용
- 없으면 `OpenDART` 실데이터 사용
- `OpenDART` 요약값만 부족한 항목은 증권신고서 원문을 추가 파싱
- `listingDate` 보강이 필요할 때는 `KIND 신규상장기업현황`을 보조 소스로 사용
- `확정 공모가`, `일반청약 경쟁률`, `IR 일정`, `수요예측 일정`, `유통가능주식수/비율`은 `KIND 상세`로 보강
- 둘 다 없으면 빈 fallback 상태로 동작
- fallback 상태에서는 더미 공모주를 생성하지 않음
- 현재 OpenDART는 `현재월 + 다음월 청약 일정`을 캘린더 표시 대상으로 수집
- 내부적으로는 이전달~현재달 공시를 참고해 다음달 일정까지 보강
- 날짜/월 경계 계산은 `Asia/Seoul` 기준 helper로 통일되어 있음
- `daily-sync` 이후 현재 표시 범위에서 소스에 없는 종목은 `WITHDRAWN`으로 정리됨
- 캘린더에는 `매일 오전 6시(Asia/Seoul) 갱신` 및 `일정 변동 가능` 안내 문구를 노출

현재 수집 조합은 아래 순서로 동작합니다.

1. `OpenDART estkRs` 요약값
2. `OpenDART` 증권신고서 원문 viewer 파싱
3. `KIND 신규상장기업현황`
4. `KIND 상세(회사개요/공모정보)`

### 알림

- `daily-sync`
- `prepare-daily-alerts`
- `dispatch-alerts`

3단계 배치로 분리되어 있습니다.

- `daily-sync`: 공모주 일정 동기화
- `prepare-daily-alerts`: 오늘 청약 마감 종목의 10시 메일 payload 생성
- `dispatch-alerts`: 수신자별 실제 발송
- 발송 대상 이메일은 `verified` 채널만 사용
- verified primary 이메일이 있으면 해당 채널을 우선 사용
- delivery idempotency key는 채널 주소까지 포함해 다중 이메일에서도 중복 방지가 유지됨

### 관리자/운영

- `/login` 기반 관리자 로그인
- `/admin` 보호
- 최근 운영 로그 확인
- `INFO / WARN / ERROR` 필터
- 알림 발송/중복 건너뜀/실패 이력 저장

### 현재 fallback 동작

- DB 연결이 없거나 실데이터 소스를 사용할 수 없으면 대시보드는 빈 상태로 열립니다.
- 상세 페이지는 fallback 상태에서 종목 slug를 찾지 못하면 정상적으로 `not found` 처리됩니다.
- 과거 샘플 종목 `에이블데이터`, `로보헬스`는 코드와 DB에서 제거되었습니다.
- 샘플 공모주를 대신 보여주지 않으며, 운영 모드는 `fallback`으로 표기됩니다.
- DB 가용성 판정은 TTL 캐시를 사용하므로 일시 장애 후 재시도 시 자동 복귀할 수 있습니다.

## 점수 계산 현재 상태

점수는 [src/lib/analysis.ts](/Users/shs/Desktop/Study/ipo/src/lib/analysis.ts)에서 규칙 기반으로 계산합니다.

- 시작점 `50점`
- 공모가 밴드 위치
- 기관 수요예측 경쟁률
- 의무보유확약 비율
- 유통가능물량 비율
- 구주매출 비중
- 시장 분위기 점수
- OpenDART 재무 지표

현재 OpenDART로 추가 반영 중인 재무 항목:

- 매출 성장률
- 영업이익 흑자/적자
- 당기순이익 흑자/적자
- 부채비율
- 자본 상태

중요:

- 현재는 `기관 수요예측 경쟁률`, `의무보유확약`이 충분히 안 채워지는 종목이 많습니다.
- 그래서 점수는 아직 `완성형 투자 판단 점수`가 아니라 `기초 판단 점수`에 가깝습니다.

## OpenDART에서 현재 채우는 값

지금 수집기에서 비교적 안정적으로 가져오는 값:

- 종목명
- 시장 구분
- 대표/공동 주관사
- 청약 시작일 / 종료일
- 납입일 일부(`pymd`, 현재 환불 일정 근사치로 사용)
- 공모가
- 구주매출 비중 일부
- 최신 재무지표 일부

OpenDART 원문 추가 파싱으로 일부 종목에서 보강하는 값:

- 희망 공모가 밴드
- 최소청약주수
- 증거금률

아직 비어 있거나 별도 소스가 필요한 값:

- 기관 수요예측 경쟁률
- 의무보유확약 비율
- 일부 종목의 유통가능물량 비율

현재 보강 상태:

- `환불일`: OpenDART `pymd`를 사용 중
- `상장일`: KIND `신규상장기업현황`으로 일부 종목 보강 중
- `확정 공모가`: KIND 상세 `공모가격`으로 보강 가능
- `일반청약 경쟁률`: KIND 상세 `청약경쟁률`로 보강 가능
- `IR 일정`, `수요예측 일정`: KIND 상세 일정 정보로 보강 가능
- `유통가능주식수`, `유통가능물량`: KIND 상세 회사개요로 보강 가능

주의:

- KIND 상장 데이터도 시점에 따라 아직 공개되지 않았거나 지연될 수 있습니다.
- 일정 정보는 증권사/거래소 공고에 따라 바뀔 수 있으므로 최종 확인이 필요합니다.

## 개인화 메모

- 현재 캘린더 필터 토글 기억은 가벼운 UX 목적이라 `localStorage`를 사용합니다.
- 향후 로그인 기반 개인화가 도입되면 사용자별 설정은 DB preference로 승격하는 것이 적절합니다.
- 다만 공개 read path에서 자동으로 DB write를 하지 않고, 사용자 액션 기반 저장으로 유지하는 것이 이 프로젝트 원칙에 맞습니다.

## Node 버전

이 프로젝트는 `nvm` 기준으로 관리합니다.

```bash
nvm install
nvm use
node -v
```

프로젝트 기본 버전은 [.nvmrc](/Users/shs/Desktop/Study/ipo/.nvmrc)의 `v24.14.0`입니다.

주의:

- `node v14` 같은 오래된 버전으로 실행하면 `tsx`, `Next 16` 빌드가 깨집니다.
- 작업 전 `nvm use`를 먼저 하는 것이 안전합니다.
- 스타일 작업 후에도 `npm run build`로 SCSS import 경로를 꼭 확인하는 것이 안전합니다.

## 시작하기

```bash
cp .env.example .env
npm install
npx prisma generate
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 확인

## 환경 변수

[.env.example](/Users/shs/Desktop/Study/ipo/.env.example)를 복사해서 사용합니다.

주요 변수:

- `DATABASE_URL`: PostgreSQL 연결 문자열
- `JOB_SECRET`: 잡 API 보호용 필수 시크릿
- `ADMIN_ACCESS_PASSWORD`: 관리자 로그인 비밀번호
- `ADMIN_SESSION_SECRET`: 관리자 세션 서명용 랜덤 시크릿
- `ADMIN_EMAIL`: 관리자 이메일
- `APP_BASE_URL`: 메일의 `웹에서 보기` 링크 기준 URL
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `IPO_SOURCE_URL`: 외부 JSON 데이터 소스
- `OPENDART_API_KEY`
- `OPENDART_BASE_URL`

관리자 로그인은 `ADMIN_ACCESS_PASSWORD`와 `ADMIN_SESSION_SECRET`이 둘 다 있어야 동작합니다.
`JOB_SECRET`이 없으면 잡 API는 허용되지 않고 misconfigured 상태로 차단됩니다.

소스 우선순위:

1. `IPO_SOURCE_URL`
2. `OPENDART_API_KEY`
3. 빈 fallback

## 데이터베이스

스키마 파일:

- [prisma/schema.prisma](/Users/shs/Desktop/Study/ipo/prisma/schema.prisma)

반영:

```bash
npx prisma db push
```

## 자주 쓰는 명령

```bash
npm run dev
npm run lint
npm run build
npm run job:daily-sync
npm run job:prepare-daily-alerts
npm run job:dispatch-alerts
npm run mail:sample
npm run source:check:opendart
```

참고:

- `npm run mail:sample`은 이름은 그대로지만, 샘플 종목을 보내는 명령이 아니라 준비된 알림 payload를 관리자 메일로 미리 보내보는 preview 용도입니다.

## API 엔드포인트

- `GET /api/jobs/daily-sync`
- `GET /api/jobs/prepare-daily-alerts`
- `GET /api/jobs/dispatch-alerts`

`JOB_SECRET`는 필수입니다. `?secret=` 쿼리 또는 `x-job-secret` 헤더가 필요합니다.  
Vercel Cron은 `x-vercel-cron` 헤더를 통해 허용됩니다.

## 배포 메모

### 현재 배포 구조

- `Vercel`: 웹앱 + API + Cron
- `Neon`: PostgreSQL
- `Gmail SMTP`: 메일 발송

### vercel.json 크론

- `21:00 UTC` -> `06:00 KST` `daily-sync`
- `00:00 UTC` -> `09:00 KST` `prepare-daily-alerts`
- `01:00 UTC` -> `10:00 KST` `dispatch-alerts`

### 배포 순서

1. GitHub push
2. Vercel import
3. 환경변수 등록
4. `npx prisma db push`
5. Functions / Cron 로그 확인

## 운영 중 특이사항

- 로컬에서 `.env` 값과 Vercel 환경변수가 다르면 메일/링크 테스트 결과가 달라질 수 있습니다.
- `APP_BASE_URL`이 localhost면 메일의 `웹에서 보기` 링크도 localhost로 들어갑니다.
- OpenDART는 종목별로 재무제표가 없을 수 있어, 어떤 종목은 점수에 재무 정보가 반영되고 어떤 종목은 반영되지 않습니다.
- OpenDART 요약값과 KIND 상세값이 충돌하는 경우 현재는 KIND 상세의 확정 공모가를 우선 사용합니다.
- 현재 관리자 수신자는 기본적으로 `admin-recipient` 1명입니다.
- 알림 중복 방지는 `idempotencyKey` 기반입니다.
- 홈 화면에서 `종목 개요`는 캘린더 오른쪽이 아니라 아래쪽에 배치됩니다.
- 홈 캘린더의 주말 열은 현재 숨겨져 있으며, 렌더링 토글로 다시 켤 수 있게 유지되어 있습니다.
- 캘린더 이벤트 카드의 종목명은 최대 2줄까지 노출되고 이후는 말줄임 처리됩니다.

## 다음 개선 우선순위

- 수요예측 경쟁률 소스 추가
- 의무보유확약 / 유통가능물량 보강
- 기관 경쟁률 / 의무보유확약률 안정 보강
- 점수 체계를 `수급 / 재무 / 가격 / 리스크` 축으로 분리
- 데이터 신뢰도 표시
- 다중 수신자 UI
- 텔레그램 발송 구현
