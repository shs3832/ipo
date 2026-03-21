<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before making framework-level assumptions.
<!-- END:nextjs-agent-rules -->

# Agent Notes

이 파일은 다음 작업자가 빠르게 프로젝트 맥락을 복원하기 위한 메모입니다.

## Project Identity

- 개인용 공모주 일정/분석/알림 서비스
- 현재 목표는 `캘린더 + 10시 분석 메일 + 관리자 운영`
- 서비스 특성상 `정확한 일정`, `중복 없는 알림`, `운영 로그`가 중요

## Current Stack

- Next.js 16 App Router
- React 19
- Prisma + PostgreSQL
- Neon DB
- Vercel deployment + Cron
- Nodemailer + Gmail SMTP
- OpenDART as the primary live data source

## Must-Know Runtime Notes

- Always run `nvm use` before build or scripts
- Project Node version is `v24.14.0`
- Running with old Node versions breaks `tsx` and `next build`

## Current Data Flow

1. `fetchSourceRecords()`
2. source priority:
   - `IPO_SOURCE_URL`
   - `OPENDART_API_KEY`
   - sample data
3. `daily-sync` normalizes records and upserts DB
4. `prepare-daily-alerts` creates payloads for closing-day emails
5. `dispatch-alerts` sends deliveries and logs status

## OpenDART Scope Right Now

Currently implemented in:

- [src/lib/sources/opendart-ipo.ts](/Users/shs/Desktop/Study/ipo/src/lib/sources/opendart-ipo.ts)
- [src/lib/sources/opendart-financials.ts](/Users/shs/Desktop/Study/ipo/src/lib/sources/opendart-financials.ts)

Behavior:

- Display range is `current month + next month`
- Disclosure lookup range is `previous month + current month`
- Records are filtered by `subscriptionStart` / `subscriptionEnd` being within display range

OpenDART currently provides:

- name
- market
- lead/co managers
- subscription start/end
- offer price
- insider sales ratio (partial)
- financial metrics (if available)

OpenDART still does not reliably provide:

- demand competition rate
- lockup rate
- float ratio
- minimum subscription shares
- deposit rate
- reliable refund date
- reliable listing date
- price band in a stable way

## Scoring Reality

Scoring logic lives in:

- [src/lib/analysis.ts](/Users/shs/Desktop/Study/ipo/src/lib/analysis.ts)

Important:

- Base score starts at `50`
- Many live records still stay near neutral if data is missing
- Financial enrichment now affects:
  - revenue growth
  - operating income
  - net income
  - debt ratio
  - equity risk

This is still not a production-grade IPO recommendation engine.
Treat it as a structured heuristic.

## UI / Product Decisions Already Made

- Calendar is above, IPO overview is below
- Weekend colors are subtle, not dominant
- Subscription events are shown by `closing date`, not start date
- Event labels use badges:
  - `청약마감`
  - `환불`
  - `상장`
- Calendar has checkbox filters for those event types
- Detail page hides source metadata unless admin
- Admin page is protected by login

## Admin / Security

- Admin auth is simple password + signed cookie
- Relevant files:
  - [src/lib/admin-auth.ts](/Users/shs/Desktop/Study/ipo/src/lib/admin-auth.ts)
  - [src/app/login/page.tsx](/Users/shs/Desktop/Study/ipo/src/app/login/page.tsx)
  - [src/app/login/actions.ts](/Users/shs/Desktop/Study/ipo/src/app/login/actions.ts)
- Required env for proper prod setup:
  - `ADMIN_ACCESS_PASSWORD`
  - `ADMIN_SESSION_SECRET`
- Never commit `.env`

## Logging / Debugging

Operational logs are important in this project.

Relevant files:

- [src/lib/ops-log.ts](/Users/shs/Desktop/Study/ipo/src/lib/ops-log.ts)
- [src/app/admin/page.tsx](/Users/shs/Desktop/Study/ipo/src/app/admin/page.tsx)
- [src/app/admin-log-panel.tsx](/Users/shs/Desktop/Study/ipo/src/app/admin-log-panel.tsx)

Current behavior:

- `daily-sync`, `prepare-daily-alerts`, `dispatch-alerts` log `started/completed/failed`
- Admin UI can filter `전체 / ERROR / WARN / INFO`

When debugging:

1. Check `/admin`
2. Check Vercel function logs
3. Check `notification_job` and `notification_delivery`
4. Check `OperationLog`

## Email Notes

- Message payload includes tags, quick summary, schedule, analysis, and `웹에서 보기`
- `APP_BASE_URL` controls the link target
- If `APP_BASE_URL` is localhost, emails will include localhost links
- Sample email command:

```bash
npm run mail:sample
```

## Known Product Gaps

- Data quality is still uneven
- Some IPOs have financial data, some do not
- Many score inputs are missing and should not be overinterpreted
- No public multi-recipient UI yet
- Telegram adapter data model exists, but sending is not implemented

## Best Next Steps

If continuing feature work, highest-impact next tasks are:

1. add demand competition / lockup / float data source
2. add minimum subscription shares and deposit rate source
3. split score into sub-scores
4. add confidence/data-completeness indicator
5. improve detail page to explain score basis more explicitly

## Safe Working Rules

- Prefer additive changes over rewrites
- Do not remove sample mode fallback unless replacing it with another safe fallback
- Keep admin-only metadata hidden from general users
- Preserve idempotency in notification jobs
- Be careful with schedules: timezone is `Asia/Seoul`
