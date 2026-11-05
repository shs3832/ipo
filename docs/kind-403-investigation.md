# KIND 403 Investigation

## Scope

2026-11-05 KST 기준, KIND 수집이 로컬에서는 성공하지만 Vercel에서는 Akamai Access Denied 응답을 반환하는 원인을 조사한다. 진단 성공과 수집 복구는 구분한다.

## Current Status

- 사용자 결정으로 KIND 자동 수집을 임시 중단한다. `KIND_COLLECTION_PAUSED=true`가 목록/일정, 상세, 시초가 보강 진입점에서 외부 호출 전에 반환하며 강제 새로고침에도 적용된다.
- `kind-collection-paused`를 불완전 수집 사유로 기록해 누락 종목의 자동 철회를 방지한다. 명시적 비IPO 제외와 유효 데이터 0건 보호는 유지한다.
- DB의 기존 종목을 삭제/초기화하지 않는다. 기존 정상 동기화의 값 갱신/빈값 처리와 알림 품질/최신성 검증은 그대로이며 모든 과거 필드가 영구 보존된다는 뜻은 아니다.
- 수동 진단 API는 인증 후에만 실행 가능하며 자동 실행하지 않는다. 아래 차단 원인 조사와 재개 QA는 재개를 별도로 승인할 때 참고할 기록이다.
- 회귀 QA: 전체 149개 테스트, 타입 검사, 린트 통과. 일반/강제 보강의 fetch 0회와 입력 유지, 누락 종목 철회 방지를 확인했다.

## Alternatives

대체 출처는 아직 연동하지 않았다. 제공 문서/공식 화면에서 확인한 후보이며 API 키, 이용 조건, 실제 응답/반영 시각 검증이 추가로 필요하다. 한 출처로 KIND 전체를 대체한다고 가정하지 않는다.

| Priority | Candidate | Coverage And Limit |
| --- | --- | --- |
| 1 | OpenDART 구조화 API + 공시 원문 | 기존 기본 수집을 유지하고 정정 공시 원문에서 확정 공모가, 일정, 유통물량 등 추출 범위를 보강한다. 문서마다 항목 구조가 달라 추출 가능성은 종목별 실증 필요. 상장예정일과 유통물량의 최신 확정 여부를 따로 판정한다. |
| 1 | 주관 증권사 공식 공지/청약 페이지 | 청약/환불 일정, 확정 공모가, 일반청약 경쟁률의 교차 검증 후보. 한국투자증권 공식 화면에서 해당 항목 제공을 확인했다. 증권사마다 형식이 다르고 자기 주관 종목 범위이므로 전체 시장을 단독으로 커버하지 않는다. 자동 조회/재게시 허용 범위도 확인한다. |
| 2 | 금융위원회 주식발행정보 API | 종목 식별, 발행주식 수, 상장/폐지 일자의 검증 후보. 상장 전 예정 일정 전체를 제공한다고 가정하지 않는다. 제공 안내상 실시간이 아니며 상업 이용은 원천 기관과 계약 확인이 필요하다. |
| 3 | 금융위원회 주식시세정보 API | 일자별 시가 등 상장 후 성과의 후보. 당일 오전 10시 시초가 캡처의 즉시 대체로 보지 않는다. 반영 지연 및 원천 데이터의 이용/제3자 제공 제한을 먼저 확인한다. |

공식 근거:

- [OpenDART 소개](https://opendart.fss.or.kr/intro/main.do): 공시 원문 XML과 증권신고서 종합정보 제공.
- [한국투자증권](https://truefriend.com/main/Main.jsp): 청약/환불 예정일, 공모가, 당사 청약 경쟁률을 공식 화면에서 제공.
- [금융위원회 주식발행정보](https://www.data.go.kr/data/15043423/openapi.do): 상장/발행 정보, 갱신 지연 및 상업 이용 계약 안내. 실시간 아님, 기준일 다음 영업일 오후 1시 이후 갱신 안내를 확인했다.
- [금융위원회 주식시세정보](https://www.data.go.kr/data/15094808/openapi.do), [공식 카탈로그](https://www.data.go.kr/catalog/15094808/openapi.json): 일별 시가 등 제공. 카탈로그의 실시간 설명과 실제 제공 안내/반영 시각은 구분해 추가 확인한다. 비상업/제3자 권리 조건을 공개 웹앱의 재게시 허가로 해석하지 않는다.

다음 제안은 알림 필수값인 실제 환불일과 확정 공모가의 DART/주관사 교차 검증부터 진행하는 것이다. 기존 `납입일 -> refundDate` 매핑의 정확성은 별도 수정 과제이며 이번 중단 작업에서 조용히 변경하지 않는다. 시초가/유통물량 대체는 후순위로 분리한다.

## Verified Before Comparison

- 같은 운영 코드를 미국 iad1에서 서울 icn1로 재배포해도 두 KIND 조회의 403이 지속됐다.
- 차단 응답에는 Access Denied, Reference #18, errors.edgesuite.net 형식이 있다. 정확한 보안 규칙은 응답에 없다.
- KIND 장애 분리 후 기본 출처 26건 동기화와 알림 준비 1건 생성이 성공했다. 로컬의 동일 발송 코드로 전송한 테스트 푸시는 사용자가 실제 수신했다.
- Vercel Cron은 활성화돼 있고 수동 Run은 vercel-cron-secret 인증으로 26건 수집에 성공했다. 예약 시각의 자연 실행 검증은 별도다.

## Controlled Comparison

운영 잡 인증이 필요한 `POST /api/jobs/diagnose-kind`에서 고정 KIND 경로 5건만 조회한다. 로컬에서도 동일한 `runKindAccessProbes` 함수를 실행한다. 진단은 공모주/알림 데이터와 캐시를 갱신하지 않고 운영 로그만 남긴다.

| Probe | Local / Node 24.14.0 | Local / Node 24.22.2 | Vercel icn1 / Node 24.22.2 |
| --- | --- | --- | --- |
| Homepage GET | 200 | 200 | 403, Access Denied |
| Listing GET | 200, listing rows present | 200, listing rows present | 403, Access Denied |
| Listing POST | 200, listing rows present | 200, listing rows present | 403, Access Denied |
| Schedule GET | 200, calendar present | 200, calendar present | 403, Access Denied |
| Schedule POST | 200, calendar present | 200, calendar present | 403, Access Denied |

실행 시각은 2026-11-05 KST이며 같은 날 수분 간격으로 비교했다. 동시 실행 실험은 아니다.

| Environment | Started At KST | Run ID |
| --- | --- | --- |
| Local / Node 24.14.0 | 21:18:44.950 | `e753c04b-b6da-4da7-b02e-d2d78e24fc69` |
| Vercel icn1 / Node 24.22.2 | 21:22:59.544 | `8203bfc0-aab8-44b5-8d72-35dd221d6e18` |
| Local / Node 24.22.2 | 21:25:47.643 | `51909b9c-3ba3-4385-b4f2-9ea3f0544b75` |

- GET/POST 쌍은 같은 파라미터를 query/body로 전달한다. 세 실행 모두 parametersHash가 홈페이지 `e3b0c44298fc1c14`, 목록 `4306d9c5ff0e855f`, 일정 `3ffff7b045acc5e7`로 일치했다.
- 운영 코드 commit은 `9126d12`, 배포는 `7Y9svp3F88K687WPdUE4NkRHdvFH`다. Vercel build가 성공했고, 인증 없는 호출은 401을 반환했다.
- 운영 진단의 5개 응답은 모두 `edgeProviderHint=akamai`, `accessDenied=true`, `requestError=null`이었다. 진단 API 자체의 HTTP 200은 이 비교가 완료됐다는 뜻이며, KIND 조회 성공을 뜻하지 않는다.
- 같은 runId가 DB `OperationLog`의 `diagnostic:kind / access_probe_completed`에 저장된 것을 읽기 전용으로 재확인했다.
- Node 버전 비교는 공식 Node 24.22.2 macOS ARM64 배포 파일을 임시 경로에서 실행했다. 공식 SHA256 검증을 통과했으며 프로젝트 `.nvmrc`, 의존성, 기본 Node 설정은 변경하지 않았다.
- 쿠키/인증 헤더 및 브라우저 위장 헤더는 보내지 않는다. 리다이렉트와 자동 재시도도 하지 않는다.
- 요청별 15초 timeout, 128 KiB 읽기 상한, 마스킹된 1,200자 본문 발췌만 허용한다.
- 상태 코드만으로 성공을 판단하지 않고 Access Denied 여부와 목록/달력 표식을 함께 본다.
- QA: 인증 없는 요청의 upstream 호출 차단, 파라미터 일치, 스트림 취소/크기 제한, 일부 network error 후 진단 지속, 민감값 제외, 200 차단 응답 판별을 포함한 전체 148개 테스트와 타입 검사/린트 통과.

## Findings And Limits

- 확인된 실패 지점은 Vercel에서 KIND로 나가는 요청에 대한 Akamai Access Denied 응답이다. JSON/HTML 파싱 이전에 차단 페이지를 받으므로 이 재현의 직접 원인은 파서가 아니다.
- 홈페이지 GET도 실패하므로 특정 목록 파라미터나 POST body만의 오류라는 설명과 맞지 않는다. Node 버전을 맞춘 로컬도 성공해 Node 버전 차이만으로도 설명되지 않는다.
- 같은 함수와 파라미터를 사용했지만 OS/아키텍처, DNS/edge 경로, 송신 IP/ASN/평판, 실제 전송 헤더, TLS/HTTP 특성까지 동일하게 통제한 것은 아니다. 특정 IP 차단이나 특정 WAF/Bot 규칙이라고 확정하지 않는다.
- 미국과 서울에서 모두 실패했다는 기존 결과도 특정 국가만의 제한이라는 설명을 약화할 뿐, 모든 Vercel IP가 차단됐다는 증거는 아니다.
- KIND 자체 수집 복구는 아직 완료되지 않았다. 기본 출처를 통한 부분 복구와 실제 예약 발송 검증은 별개다.

## Revised QA Plan

### 1. Resolve The Edge Rejection

- 우선순위는 아래 참조번호의 보안 로그를 KIND 운영자에게 확인하는 것이다. 문의는 사용자 승인 후 별도로 보내며 자동 전송하지 않는다.
- 요청할 근거는 당시 `reasonForFailure`, 적용 보안 정책/규칙 또는 Bot 판정, 송신 IP/ASN 조건, 허용된 자동 조회 방식이다. 보안 예외를 임의로 가정하거나 프록시 우회로 해결하지 않는다.
- Akamai의 [Translate Error String 안내](https://techdocs.akamai.com/edge-diagnostics/docs/translate-error-string)에 따르면 참조번호로 실패 사유와 WAF 정보를 조회할 수 있으며, 로그는 서버/트래픽 조건에 따라 최근 6시간 또는 24시간 범위다. 실제 조회에는 해당 서비스의 운영 권한이 필요하다.
- 로그 보존 시간이 지났다면 담당자가 조회 가능한 시각에만 진단을 한 번 재실행해 새 참조번호를 전달한다. 같은 결과를 얻기 위한 무한 재시도는 중단한다.
- 완료 기준: 담당 로그에 근거한 차단 사유를 확보하거나, 해당 HTML 조회가 지원되지 않는다는 공식 운영 방침을 확인한다. 단순 HTTP 200 한 번으로 원인이 해결됐다고 판정하지 않는다.

운영 실행 시작: `2026-11-05 21:22:59.544 KST` / `2026-11-05 12:22:59.544 UTC`.

| Probe | Endpoint | Akamai Reference |
| --- | --- | --- |
| Homepage GET | `/` | `18.54023517.1793881379.ee1f070` |
| Listing GET | `/listinvstg/listingcompany.do` | `18.6f023517.1793881379.c378645` |
| Listing POST | `/listinvstg/listingcompany.do` | `18.77023517.1793881379.36d9ba` |
| Schedule GET | `/listinvstg/pubofrschdl.do` | `18.46023517.1793881379.d47c673` |
| Schedule POST | `/listinvstg/pubofrschdl.do` | `18.6d023517.1793881379.1355ae7a` |

### 2. Run Only Hypothesis-Driven Comparisons

- 운영자 답변으로 남은 가설이 정해지면 한 번에 한 변수만 바꾸고 대조군/예상 결과/중단 기준부터 정한다. 환경을 통째로 바꾼 성공은 IP 또는 TLS 원인의 확정 증거로 쓰지 않는다.
- 추가 배포나 수집 구조 변경은 별도 수정 승인 후 진행한다. 임의 User-Agent 위장, 리전/IP/프록시 순회, 성공할 때까지 반복 호출은 하지 않는다.
- 접근이 재개돼도 상태 코드와 본문 표식뿐 아니라 실제 수집 파서 결과의 종목명, 일정, 확정가 출처를 확인한다. 빈 목록이나 차단 페이지를 정상 수집으로 저장하지 않는다.
- HTML 조회가 지원되지 않으면 KIND 보강이 없는 상태의 데이터 누락을 목록화하고, 허용된 대체 출처로 보완할지 결정한다. 확정 공모가를 희망밴드에서 임의 추정하지 않는다.

### 3. Verify Service Recovery Independently

- 기존 기본 출처 수집, 불완전 수집 시 자동 철회 방지, 종목별 90분 최신성 및 필수값 게이트는 유지한다.
- 11월 6일 11:15 KST에 확인하도록 이미 설정된 1회 후속 점검에서 자연 Cron 호출, 수집, 후보/품질 보류, READY, 발송/중복 방지 로그를 연결한다. Vercel 수동 Run이나 로컬 테스트 푸시를 자연 실행의 성공으로 세지 않는다.
- 자동 실행 미관찰, 대상 종목 없음, 데이터 품질 보류, 실제 처리 실패를 구분한다. 적합한 당일 대상이 없으면 실제 정기 푸시 수신은 미검증으로 남기며, 검증 목적으로 오래된 알림을 발송하지 않는다.
- 수집/준비 성공은 부분 복구의 근거다. 자연 실행의 적합한 대상에 대해 발송 결과와 사용자 수신을 확인하기 전까지 정기 알림 전체 복구로 선언하지 않는다.

## Next Thread Handoff

- 완료: 제한된 인증 진단 배포, 세 환경 비교, 운영 로그 저장 확인, 기본 출처 부분 복구 및 로컬 테스트 푸시 수신 확인.
- 결정: 서비스 장애 분리와 최신성/품질 게이트 유지. 현재 증거로 IP 차단을 확정하거나 우회하지 않는다.
- 미확인: Akamai의 정확한 거절 규칙, 자연 Cron과 운영 정기 푸시의 종단간 성공.
- 현재 상태: 코드 `9126d12`가 운영 배포됐고 KIND 403은 지속된다. 진단 데이터는 공모주/알림 데이터를 변경하지 않았다.
- 다음 첫 행동: 위 참조번호와 시각으로 KIND 운영자에게 로그 확인을 요청할지 승인받는다. 별도로 11월 6일 자연 실행 결과를 점검한다.
