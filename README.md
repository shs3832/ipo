# IPO Calendar Alerts

공모주 일정을 매일 동기화해 내부 캘린더에 반영하고, 청약 마감 당일 오전 10시에 분석 메일을 발송하는 Next.js 기반 MVP입니다.

## 포함 기능

- 내부 월간 캘린더에서 `청약 / 환불 / 상장` 일정 확인
- 종목 상세 화면에서 공모가, 일정, 점수형 분석 확인
- 관리자 화면에서 수신자, 발송 잡, 최근 발송 이력 확인
- `daily-sync`, `prepare-daily-alerts`, `dispatch-alerts` 배치 작업 분리
- 현재는 이메일 발송 구현, 텔레그램은 데이터 모델만 선반영
- PostgreSQL 기반 Prisma 스키마 제공
- `DATABASE_URL`이 없으면 샘플 데이터로 전체 흐름 미리보기 가능

## Node 버전 관리

이 프로젝트는 `nvm` 기준으로 관리합니다.

```bash
nvm install
nvm use
node -v
```

현재 프로젝트 기본 버전은 `.nvmrc`의 `v24.14.0`입니다.  
`~/.zprofile`에도 `nvm` 로딩을 넣어 두어서 새 터미널에서도 바로 버전 전환이 됩니다.

## 설치와 실행

```bash
npm install
npm run prisma:generate
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 을 열면 됩니다.

## 환경 변수

`.env.example`을 복사해 `.env`로 사용하세요.

```bash
cp .env.example .env
```

주요 변수:

- `DATABASE_URL`: PostgreSQL 연결 문자열
- `JOB_SECRET`: 잡 API 보호용 시크릿
- `ADMIN_EMAIL`: 1차 관리자 수신 이메일
- `SMTP_*`: 실제 이메일 발송 설정
- `IPO_SOURCE_URL`: 외부 JSON 소스가 있으면 사용, 없으면 샘플 데이터 사용
- `OPENDART_API_KEY`: OpenDART 실데이터 수집용 API 키
- `OPENDART_BASE_URL`: 기본값은 `https://opendart.fss.or.kr`

소스 우선순위:

1. `IPO_SOURCE_URL`
2. `OPENDART_API_KEY`
3. 샘플 데이터

## 데이터베이스 준비

Prisma 스키마는 `prisma/schema.prisma`에 있습니다.

```bash
npx prisma generate
npx prisma db push
```

개발 초기에는 `DATABASE_URL` 없이도 샘플 모드로 화면과 배치를 확인할 수 있습니다.

## 배치 작업

세 가지 잡이 분리되어 있습니다.

```bash
npm run job:daily-sync
npm run job:prepare-daily-alerts
npm run job:dispatch-alerts
```

샘플 모드에서는 실제 이메일 대신 콘솔 프리뷰를 출력합니다.  
SMTP를 설정하면 동일한 흐름으로 실발송됩니다.

## OpenDART 준비

실데이터 연동 전, OpenDART 키가 정상인지 먼저 확인할 수 있습니다.

`.env`에 아래 값을 넣으세요.

```bash
OPENDART_API_KEY="발급받은_키"
OPENDART_BASE_URL="https://opendart.fss.or.kr"
```

그다음 연결 확인:

```bash
npm run source:check:opendart
```

정상이면 `status: "000"`이 반환됩니다.  
이 단계는 키 자체와 OpenDART 접근 가능 여부만 확인하며, 아직 캘린더 실데이터 수집기로 전환하는 단계는 아닙니다.

OpenDART 기반 1차 수집기는 현재달 `증권신고서(지분증권)` 공시를 기준으로 아래 정보를 채웁니다.

- 종목명
- 시장 구분(가능한 범위)
- 대표/공동 주관사
- 청약 시작일/종료일
- 공모가

아래 항목은 OpenDART만으로는 바로 확보되지 않거나 보수적으로 비워 둘 수 있습니다.

- 최소청약주수
- 증거금률
- 환불일
- 상장일
- 수요예측 경쟁률

## API 엔드포인트

- `GET /api/jobs/daily-sync`
- `GET /api/jobs/prepare-daily-alerts`
- `GET /api/jobs/dispatch-alerts`

`JOB_SECRET`가 설정된 경우 `x-job-secret` 헤더 또는 `?secret=` 쿼리가 필요합니다.  
Vercel Cron 호출은 `x-vercel-cron` 헤더를 통해 허용됩니다.

## 배포 메모

`vercel.json`에 다음 UTC 기준 크론이 들어 있습니다.

- `21:00 UTC` -> `06:00 KST` `daily-sync`
- `00:00 UTC` -> `09:00 KST` `prepare-daily-alerts`
- `01:00 UTC` -> `10:00 KST` `dispatch-alerts`

## Vercel 배포 순서

1. GitHub에 현재 저장소를 push
2. Vercel에서 `Add New Project`로 저장소 import
3. Framework는 `Next.js` 그대로 사용
4. Environment Variables에 아래 값 입력
   - `DATABASE_URL`
   - `JOB_SECRET`
   - `ADMIN_EMAIL`
   - `SMTP_HOST`
   - `SMTP_PORT`
   - `SMTP_USER`
   - `SMTP_PASS`
   - `SMTP_FROM`
   - 필요 시 `IPO_SOURCE_URL`
   - 실데이터 연동 시 `OPENDART_API_KEY`
5. PostgreSQL에 스키마 반영

```bash
npx prisma db push
```

6. 첫 배포 후 Vercel 프로젝트의 `Cron Jobs`와 `Functions` 로그에서 스케줄 호출 여부 확인

참고:

- 이 프로젝트는 `package.json`의 `engines.node = 24.x`를 사용합니다.
- 화면은 `force-dynamic`으로 설정되어 배포 후에도 최신 DB 상태를 즉시 반영합니다.
- `JOB_SECRET`를 설정해 두면 일반 호출은 막고, Vercel Cron은 그대로 통과합니다.

## 확장 방향

- 실제 공모주 소스 어댑터 추가
- 관리자 초대 기반 다중 수신자 UI
- 텔레그램 발송 어댑터 구현
- 종목별 구독 범위와 필터링
- 수동 보정 입력 폼과 변경 이력 저장
