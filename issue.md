# Issue Log

## 2026-04-26

### Follow-up: PWA Web Push End-To-End

이번 후속에서는 기존 이메일 알림을 유지하면서 앱푸시를 실제로 받을 수 있도록 PWA/Web Push 경로를 end-to-end로 연결했다. 관리자 수신자 기준으로 시작하며, public 로그인/개인화 페이지 없이도 `/admin/recipients`에서 현재 브라우저 앱푸시 구독 저장, 해제, 테스트 발송을 할 수 있다.

### What Changed In This Web Push Follow-up

1. `web-push`와 타입 패키지를 추가하고 VAPID env(`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`)를 `env`와 `.env.example`에 반영했다.
2. `app/manifest.ts`, `public/sw.js`, PWA icon/badge asset을 추가해 설치형 웹앱과 push notification click handling 기반을 만들었다.
3. 관리자 전용 Web Push API를 추가했다.
   - `/api/admin/web-push/subscribe`
   - `/api/admin/web-push/unsubscribe`
   - `/api/admin/web-push/send-test`
4. `RecipientChannel(type=WEB_PUSH)`에 브라우저 push endpoint와 keys를 저장하고, 구독 저장 시 `WEB_PUSH` preference를 active로 바꾼다.
5. `/admin/recipients`에 클라이언트 Web Push manager를 추가해 service worker 등록, 브라우저 권한 요청, 구독 저장/해제, 테스트 발송을 처리한다.
6. 실제 `dispatch-alerts`는 이제 preference가 켜진 verified `EMAIL` / `WEB_PUSH` 채널을 모두 발송 대상으로 본다.
7. Web Push 발송 실패 중 `404` / `410`은 만료된 구독으로 보고 해당 push 채널을 unverified 처리한다.

### Operational Notes In This Web Push Follow-up

- Web Push는 HTTPS 또는 localhost 보안 컨텍스트, 브라우저 알림 권한, VAPID env가 필요하다.
- iOS/iPadOS는 홈 화면에 추가된 PWA에서만 앱푸시 수신을 기대할 수 있다.
- 기존 이메일 채널은 preference가 꺼지지 않는 한 기존처럼 발송된다.
- 이번 migration은 현재 `DATABASE_URL` 대상 DB에 `npx prisma migrate deploy`로 적용했다.

### Verification In This Web Push Follow-up

- `npx prisma validate`
- `npm test`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `npm audit --audit-level=moderate`
  - `postcss@8.5.10` override 후 취약점 `0건`
- Playwright smoke
  - `/admin/recipients` 미인증 접근 시 `/login?next=%2Fadmin%2Frecipients` 리다이렉트 확인
  - migration 적용 전 `NotificationPreference` 테이블 누락을 확인하고 `npx prisma migrate deploy`로 해결
- `node --test`가 API 경로의 `/test/route.ts`를 테스트 파일처럼 발견하지 않도록 테스트 발송 API 경로를 `/send-test`로 조정
- Code review 후속으로 `/api/admin/web-push/send-test`가 모든 구독 발송 실패 시 HTTP 500과 `ok: false`를 반환하게 했고, 관리자 클라이언트도 응답 body의 `ok: false`를 실패로 처리하게 했다.
- Review fix verification
  - `npm test -- tests/recipient-service.test.ts tests/alert-service.test.ts`
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm run build`
  - `npm audit --audit-level=moderate`
- Production follow-up: Vercel에서 `/admin/recipients` 렌더 중 `prisma.notificationPreference.upsert()`가 interactive transaction 5초 제한을 넘는 문제가 확인됐다. 관리자 recipient bootstrap의 긴 `$transaction`을 제거하고, 페이지 렌더에서는 `ensureAdminRecipient()`를 한 번만 실행한 뒤 이메일 채널, preference, Web Push 상태 조회가 같은 recipient id를 재사용하게 바꿨다.
- UX follow-up: 관리자 알림 채널 안내가 현재 발송 가능한 상태를 정확히 말하도록 바꿨다. 이메일 OFF + 앱푸시 ON + 구독 있음이면 앱푸시로 10시 자동 알림이 발송된다고 표시하고, 실제 발송 가능한 채널이 없을 때만 경고를 표시한다.
- Message follow-up: 관리자 수신 채널 화면, 앱푸시 버튼/피드백, 테스트 푸시 본문, 발송 selection 로그의 문구를 “이 기기에서 다음 10시 자동 알림을 받을 수 있는지” 중심으로 정리했다. 메일 전용 표현은 채널 공통 알림 표현으로 바꿨다.
- README follow-up: 루트 README의 프로젝트 요약, stack, admin 기능, notification pipeline, portfolio notes, command, runtime note를 현재 이메일/앱푸시 채널 구조와 관리자 앱푸시 운영 상태에 맞게 갱신했다.
- Pending UX follow-up: `/admin/recipients`의 서버 액션 버튼과 앱푸시 API 버튼에 처리 중 문구와 스피너를 추가하고, 수신자 관리 페이지 이동/초기 렌더 중 전용 loading 화면을 보여 주도록 했다.
- Push navigation follow-up: 푸시 알림 클릭 시 이미 열린 앱 창이 있으면 서비스워커가 앱에 이동 메시지를 보내고, 앱 루트에서 “푸시 알림을 열고 있습니다” 오버레이와 스피너를 표시한 뒤 대상 URL로 이동하게 했다. 새 창/콜드 스타트용 전역 loading 화면도 추가했다.

### Follow-up: Admin Notification Channel Toggle UI

이번 후속에서는 앞서 추가한 채널 preference 기반을 관리자 수신자 화면에서 실제로 확인하고 조작할 수 있게 했다. 기존 이메일 발송은 유지하되, `/admin/recipients`에서 10시 분석 알림의 이메일 채널을 on/off 할 수 있게 했다. 이후 Web Push 후속에서 앱푸시 구독/테스트/발송까지 연결했다.

### What Changed In This Admin Toggle Follow-up

1. 관리자 수신자 화면에 `알림 채널 설정` 카드를 추가했다.
2. 이메일 채널은 현재 상태를 보여 주고 `켜기` / `끄기` 버튼으로 `NotificationPreference`를 갱신할 수 있게 했다.
3. 앱푸시 채널은 future preference 항목으로 먼저 표시했고, 이후 Web Push 후속에서 구독 저장 후 활성화할 수 있게 했다.
4. 이메일 채널을 끈 경우 앱푸시 발송 연결 전에는 실제 자동 알림이 없다는 경고 문구를 표시한다.
5. 채널 preference 변경 server action과 운영 로그 기록을 추가했다.

### Verification In This Admin Toggle Follow-up

- `npm test -- tests/recipient-service.test.ts`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

### Follow-up: Notification Channel Preference Foundation

이번 후속에서는 기존 10시 분석 메일 발송을 유지하면서, 이후 앱푸시를 같은 알림 구조에 붙일 수 있도록 채널별 알림 preference 기반을 먼저 추가했다. 실제 Web Push 구독/발송은 아직 연결하지 않고, 1차 범위는 데이터 모델과 dispatch 대상 산정 조건에 한정했다.

### What Changed In This Notification Follow-up

1. Prisma `ChannelType`에 `WEB_PUSH`를 추가했다.
2. `NotificationPreference` 모델과 migration을 추가해 `recipientId + alertType + channelType` 단위의 on/off 상태를 저장할 수 있게 했다.
3. 관리자 기본 recipient 생성 시 `CLOSING_DAY_ANALYSIS` 기준 `EMAIL on`, `WEB_PUSH off` preference를 보장하도록 했다.
4. 기존 이메일 발송 대상 산정은 verified `EMAIL` 채널이면서 이메일 preference가 켜진 경우만 통과하도록 바꿨다.
5. 기존 recipient에 preference row가 아직 없더라도 이메일은 기본 on으로 해석해 기존 메일 발송 동작이 유지되게 했다.

### Verification In This Notification Follow-up

- `npx prisma validate`
- `npm test -- tests/recipient-service.test.ts`
- `npx tsc --noEmit`

### Follow-up: Implementation TODO Split

이번 후속에서는 코드 변경 없이 앞으로 구현할 후보를 `issue.md` 변경 로그에서 분리해 루트 `TODO.md`로 정리했다. `issue.md`는 최근 스레드 기록으로 유지하고, `TODO.md`는 active / parked / done enough 상태를 기준으로 점수 재오픈, 캘린더 주말 열 복구, closing-soon 알림, major dependency upgrade, DB migration, README/포트폴리오 설명 보강 항목의 현재 판단과 재오픈 조건을 관리한다.

### Follow-up: Documentation Role Cleanup

이번 후속에서는 코드 변경 없이 나눠진 md 문서의 역할을 정리했다. README는 포트폴리오/첫 진입 문서로, `docs/README.md`는 사람용 문서 지도, `docs/context/README.md`는 AI 작업자용 읽기 순서로 역할을 명확히 하고, 길어진 과거 스레드 로그는 아카이브 문서로 분리해 현재 `issue.md`를 최근 맥락 중심으로 가볍게 유지한다.

### Follow-up: Portfolio README Refresh

이번 후속에서는 코드 변경 없이 루트 `README.md`를 포트폴리오 제출용 문서 성격에 맞게 재정리했다. 프로젝트의 성격, 프론트엔드/백엔드 특징, 기술 스택, 운영 안정성 포인트, AI 프롬프트 기반 개발 방식과 문제 해결 접근을 README에서 바로 확인할 수 있도록 구성했다.

### Follow-up: Calm IPO Desk Detail Pass / Browser Review

이번 후속에서는 인앱 브라우저로 홈, 종목 개요, 상세, 관리자 화면을 직접 훑으며 `Calm IPO Desk` 컨셉이 실제 화면에 잘 반영됐는지 확인했다. 전체 방향은 유지하되, 더 차분한 업무용 화면에 맞게 필요한 부분만 추가로 다듬었다.

### What Changed In This Detail Pass

1. 모바일/좁은 화면에서 카드가 화면보다 커 보이지 않도록 공통 `page-shell` 여백과 홈 카드 padding을 조정했다.
2. 1024px 전후에서 홈/관리자 히어로가 반쪽 레이아웃처럼 보이지 않도록 1열 전환 기준을 더 이른 breakpoint로 맞췄다.
3. 홈 종목 개요 정렬 select는 네이티브 접근성을 유지하면서 `appearance: none`, 커스텀 화살표, hover/focus 상태를 입혀 브라우저 기본 디자인 느낌을 줄였다.
4. 종목 개요 필터 칩의 active tone을 강한 블루에서 저채도 회색/블루 계열로 낮춰 차분한 콘솔 톤에 맞췄다.
5. 모바일 종목 카드의 세부 정보는 세로로 길게 쌓이는 영수증 같은 느낌을 줄이고, 좌우 요약형으로 읽히도록 정리했다.
6. 관리자 화면은 `최신 데이터 가져오기`만 primary로 유지하고, 이메일 관리/캘린더 보기/로그아웃은 더 조용한 secondary tone으로 낮췄다.
7. 관리자/수신자/로그 패널의 긴 key, 이메일, 로그 문구가 좁은 폭에서 넘치지 않도록 줄바꿈 방어를 보강했다.

### Verification In This Detail Pass

- 인앱 브라우저 점검
  - 홈 상단
  - 종목 개요 / 정렬 select
  - 상세 페이지 quick facts
  - 관리자 콘솔 상단 / 스케줄러 카드
- `npm run lint`
- `npm run build`

## 2026-04-24

### Follow-up: Calm IPO Desk UI Refinement / Responsive Visual QA

이번 후속에서는 기존 Toss 참고 기반 스타일이 다소 초보적인 카드/그라데이션 느낌으로 보인다는 피드백을 기준으로, 프로젝트 성격에 맞는 `Calm IPO Desk` 방향의 차분한 금융 대시보드 톤으로 전체 공개/관리자 화면 스타일을 재정리했다. 핵심 목표는 과한 장식보다 정보 밀도, 읽기 쉬운 표면, 낮은 radius, 안정적인 반응형 흐름을 우선하는 것이었다.

### What Changed In This UI Follow-up

1. 공통 디자인 토큰을 중립 회색 배경, 흰색 surface, 낮은 그림자, 낮은 radius 중심으로 재정리했다.
2. `surface`, `softSurface`, reset/common 스타일에서 강한 그라데이션, 큰 blur, 둥근 pill 위주의 인상을 줄이고 더 담백한 카드형 UI로 맞췄다.
3. 홈, 캘린더, 종목 개요, 상세, 로그인, 관리자, 수신자 관리, 운영 로그 패널의 SCSS를 같은 시각 언어로 정돈했다.
4. 모바일 기준은 `1024px` breakpoint를 유지하고, 모바일에서는 캘린더를 숨긴 뒤 종목 개요 중심으로 보이도록 기존 정책을 보존했다.
5. 데스크톱 캘린더는 청약 일정과 무관한 토요일/일요일 열을 숨긴 평일 중심 표시를 유지했다.
6. 좁은 폭에서 긴 한글 문장이 잘려 보일 수 있는 경우를 줄이기 위해 공통 타이포그래피에 `overflow-wrap` / `word-break` 방어를 추가했다.
7. 검증용 Chrome CLI 캡처에서 390px 화면이 잘려 보이는 현상이 있었으나, Playwright의 실제 CSS viewport 캡처로 재검증한 결과 도구 캡처 방식의 한계로 판단했다.

### Main Code Changes In This UI Follow-up

- 공통 스타일 토큰 / mixin / reset
  - `src/styles/_tokens.scss`
  - `src/styles/_mixins.scss`
  - `src/styles/reset.scss`
  - `src/styles/common.scss`
- 공개 홈 / 캘린더 / 종목 개요
  - `src/app/page.module.scss`
  - `src/app/home-content.module.scss`
- 공개 상세
  - `src/app/ipos/[slug]/page.module.scss`
- 관리자 / 로그인 / 운영 화면
  - `src/app/admin/page.module.scss`
  - `src/app/admin/recipients/page.module.scss`
  - `src/app/admin-log-panel.module.scss`
  - `src/app/login/page.module.scss`

### Verification In This UI Follow-up

- `npm run lint`
- `npm run build`
- `curl -I http://localhost:3000`
  - `200 OK`
- Playwright + Chrome channel screenshot QA
  - 홈 `390px`, `1024px`, `1440px`
  - 로그인 `390px`
  - 상세 `390px`

### Current Decisions To Remember In This UI Follow-up

- 현재 시각 방향은 `Calm IPO Desk`: 과한 앱 프로모션형 장식보다 차분한 금융 업무 화면을 우선한다.
- 모바일/좁은 화면의 기준 breakpoint는 `1024px`이며, 이 구간에서는 캘린더보다 종목 개요를 우선 노출한다.
- 캘린더의 주말 열은 현재 숨김이 기본값이며, 필요 시 `home-content.tsx`의 렌더링 토글로 복구할 수 있다.
- 스타일은 공통 token/reset/common과 페이지별 `*.module.scss` 분리 구조를 유지한다.

### Follow-up: AI Development Reflection / Midpoint Review

이번 후속에서는 코드 변경 없이, AI와 함께 이 프로젝트를 진행하는 방식에 대한 중간 회고를 문서화했다. 프로젝트 난이도, 프론트/백엔드/운영 경계, 목표 중심 프롬프트 작성, AI가 빠진 전제와 리스크를 질문하게 하는 개인화 설정 방향, 이력서/면접용 설명 언어의 필요성을 [docs/context/ai-development-reflection.md](/Users/shs/Desktop/Study/ipo/docs/context/ai-development-reflection.md)에 정리했다.

### Thread Summary

이번 스레드에서는 프로젝트 전체 코드를 둘러보고 개선점, 리팩토링, 보안 미비점을 점검한 뒤, 기존 서비스 정상 구동을 최우선 조건으로 `1차 저위험 보안 패치`와 `2차 운영 안정화/구조 개선`을 분리해 적용했다. 작업은 `codex/ipo-security-phase-1`, `codex/ipo-security-phase-2` 브랜치에서 단계별로 진행했고, 각 단계마다 QA gate를 통과한 뒤 다음 단계로 넘어갔다.

### Follow-up: Phase 1 Security Patch / Low-Risk Hardening

1차에서는 기능 동작을 크게 건드리지 않는 범위에서 보안 패치와 로그 민감정보 보호를 적용했다.

### What Changed In Phase 1

1. `next` / `eslint-config-next`를 `16.2.4`, `nodemailer`를 `8.0.5`, `prisma` / `@prisma/client`를 `6.19.3`으로 올렸다.
2. `npm audit fix`로 lockfile의 transitive 취약 패키지를 정리해 `npm audit --audit-level=moderate` 기준 취약점 0건을 확인했다.
3. 상세 페이지의 기존 unused `ReactNode` import를 제거해 lint warning을 없앴다.
4. 공통 secret redaction helper를 추가해 운영 로그 DB 저장과 콘솔 출력에서 `secret`, `password`, `token`, `crtfc_key`, `DATABASE_URL` 성격의 값을 가리도록 했다.
5. OpenDART health check와 `source:check:opendart` 출력에서 `crtfc_key`가 노출되지 않도록 redacted endpoint만 반환하게 했다.
6. production 환경에서 `IPO_SOURCE_URL`은 `https:`만 허용하고, development/test에서는 기존 로컬 URL 사용성을 유지하도록 했다.

### Follow-up: Phase 2 Operational Hardening / Scoped Refactor

2차에서는 1차 QA 통과 후, 공개 데이터 경계와 운영 안정성을 높이되 알림 idempotency, daily-sync 순차 처리, 점수/closing-soon pause 상태는 유지했다.

### What Changed In Phase 2

1. 공개 홈 snapshot의 `ipos`를 full `IpoRecord` 대신 홈에 필요한 공개 요약 타입으로 축소해 public cache 객체 안에 `latestSourceKey`, `sourceFetchedAt`, `latestAnalysis`, co-manager 등 상세/admin 성격 필드가 남지 않도록 했다.
2. 관리자 로그인 throttle을 DB-backed 공유 저장소 우선으로 보강하되, DB 장애 시 기존 process memory throttle로 fallback하고 `throttle_degraded` 운영 로그만 남기도록 했다.
3. 외부 fetch 공통 helper를 추가해 timeout과 retry를 중앙화하고, 우선 OpenDART health check와 `IPO_SOURCE_URL` fetch 경로에 적용했다.
4. source record 검증을 skip-mode로 추가해 필수 필드가 깨진 외부 레코드는 전체 동기화 hard fail 대신 WARN 로그와 함께 건너뛰도록 했다.
5. pause 상태인 closing-soon job route는 이제 disabled no-op 응답도 job 인증을 통과한 호출에만 반환한다. 무인증 호출은 기존 job API와 동일하게 `401`로 차단한다.
6. 테스트가 이미 붙은 순수 helper부터 `alert-delivery`, `ipo-sync-persistence` 모듈로 분리하고, 기존 service 파일의 export 호환은 유지했다.

### Main Code Changes

- 패키지 보안 업데이트
  - `package.json`
  - `package-lock.json`
- secret redaction / env guard / OpenDART health check
  - `src/lib/secret-redaction.ts`
  - `src/lib/env.ts`
  - `src/lib/ops-log.ts`
  - `src/lib/sources/opendart.ts`
- public home projection hardening
  - `src/lib/public-home-snapshot.ts`
  - `src/lib/page-data-revival.ts`
  - `src/lib/types.ts`
- admin login throttle
  - `src/lib/admin-login-throttle.ts`
  - `src/app/login/actions.ts`
- source fetch / validation
  - `src/lib/fetch-with-retry.ts`
  - `src/lib/source-record-validation.ts`
  - `src/lib/server/ipo-sync-service.ts`
- scoped helper refactor
  - `src/lib/server/alert-delivery.ts`
  - `src/lib/server/ipo-sync-persistence.ts`
- paused closing job auth order
  - `src/app/api/jobs/prepare-closing-alerts/route.ts`
  - `src/app/api/jobs/dispatch-closing-alerts/route.ts`
- 테스트
  - `tests/env.test.ts`
  - `tests/secret-redaction.test.ts`
  - `tests/opendart-health.test.ts`
  - `tests/admin-login-throttle.test.ts`
  - `tests/public-home-snapshot.test.ts`
  - `tests/page-data-revival.test.ts`
  - `tests/fetch-with-retry.test.ts`
  - `tests/source-record-validation.test.ts`

### Live Service Impact Assessment

- 영향도: 중간, 보수적/긍정적
- 이유:
  - Next/Nodemailer/Prisma patch update와 `npm audit fix`가 포함돼 dependency 레벨 영향은 있지만, major upgrade와 DB migration은 하지 않았다.
  - 공개 홈은 렌더링에 필요한 필드는 유지하고 cache payload만 축소했으므로 공개 UI 동작은 유지하면서 노출 경계를 좁혔다.
  - 로그인 throttle은 DB 공유 저장소를 우선 사용하지만 DB가 실패해도 memory fallback으로 로그인 자체가 막히지 않게 했다.
  - 외부 source 검증은 hard fail이 아니라 skip-mode라, 일부 깨진 레코드가 전체 `daily-sync`를 깨뜨릴 가능성을 낮춘다.
  - closing-soon 알림은 계속 pause 상태이며, 자동/수동 발송 재개는 하지 않았다.
  - 공개 점수 rollout도 계속 pause 상태로 유지했다.

### Verification

- 1차 QA
  - `npm test`
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm run build`
  - `npm audit --audit-level=moderate`
  - production server smoke: `/`, `/login`, job route unauthorized/wrong secret, paused closing route no-op, `source:check:opendart` redaction 확인
- 2차 QA
  - `npm test`
    - 전체 `97개` 테스트 통과
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm run build`
  - `npm audit --audit-level=moderate`
    - 취약점 `0건`
  - production server smoke:
    - `/` 200
    - `/login` 200
    - `/api/jobs/daily-sync` 무인증/잘못된 secret `401`
    - `/api/jobs/prepare-closing-alerts` 무인증 `401`
    - `/api/jobs/prepare-closing-alerts` 유효 `x-job-secret` header 기준 disabled no-op `200`
    - `source:check:opendart` 출력의 `crtfc_key` redaction 확인

### Current Decisions To Remember

- 기존 기능 보장을 위해 major dependency upgrade, DB migration, 점수 공개 재오픈, closing-soon 재오픈은 하지 않았다.
- `PublicHomeSnapshot`은 이제 공개 홈 요약 타입만 담아야 하며, admin/source metadata를 nested IPO payload에 다시 넣지 않는다.
- 관리자 로그인 제한은 DB-backed 공유 저장소 우선, 장애 시 memory fallback이다.
- source record validation은 운영 안정성을 위해 skip-mode이며, invalid record가 있어도 전체 동기화를 바로 실패시키지 않는다.
- pause 상태인 closing-soon job API도 인증 없는 호출에는 disabled no-op을 반환하지 않는다.

## Archived Logs

- [2026-03-21 to 2026-04-21](/Users/shs/Desktop/Study/ipo/docs/archive/issues-2026-03-to-04.md)
