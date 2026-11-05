# KIND 403 Investigation

## Scope

2026-11-05 KST 기준, KIND 수집이 로컬에서는 성공하지만 Vercel에서는 Akamai Access Denied 응답을 반환하는 원인을 조사한다. 진단 성공과 수집 복구는 구분한다.

## Verified Before Comparison

- 같은 운영 코드를 미국 iad1에서 서울 icn1로 재배포해도 두 KIND 조회의 403이 지속됐다.
- 차단 응답에는 Access Denied, Reference #18, errors.edgesuite.net 형식이 있다. 정확한 보안 규칙은 응답에 없다.
- KIND 장애 분리 후 기본 출처 26건 동기화와 알림 준비 1건 생성이 성공했다. 로컬의 동일 발송 코드로 전송한 테스트 푸시는 사용자가 실제 수신했다.
- Vercel Cron은 활성화돼 있고 수동 Run은 vercel-cron-secret 인증으로 26건 수집에 성공했다. 예약 시각의 자연 실행 검증은 별도다.

## Controlled Comparison

운영 잡 인증이 필요한 `POST /api/jobs/diagnose-kind`에서 고정 KIND 경로 5건만 조회한다. 로컬에서도 동일한 `runKindAccessProbes` 함수를 실행한다. 진단은 공모주/알림 데이터와 캐시를 갱신하지 않고 운영 로그만 남긴다.

| Probe | Local | Vercel |
| --- | --- | --- |
| Homepage GET | 200 | Pending |
| Listing GET | 200, listing rows present | Pending |
| Listing POST | 200, listing rows present | Pending |
| Schedule GET | 200, calendar present | Pending |
| Schedule POST | 200, calendar present | Pending |

- GET/POST 쌍은 같은 파라미터를 query/body로 전달하며, 환경 간 parametersHash가 같은지 확인한다.
- 쿠키/인증 헤더 및 브라우저 위장 헤더는 보내지 않는다. 리다이렉트와 자동 재시도도 하지 않는다.
- 요청별 15초 timeout, 128 KiB 읽기 상한, 마스킹된 1,200자 본문 발췌만 허용한다.
- 상태 코드만으로 성공을 판단하지 않고 Access Denied 여부와 목록/달력 표식을 함께 본다.
- QA: 인증 없는 요청의 upstream 호출 차단, 파라미터 일치, 스트림 취소/크기 제한, 일부 network error 후 진단 지속, 민감값 제외, 200 차단 응답 판별을 포함한 전체 148개 테스트와 타입 검사/린트 통과.

## Interpretation Limits And Next QA

- 홈페이지까지 같은 환경에서 거절되면 POST body만의 문제라는 설명은 약해진다. 하지만 IP, IP 대역/평판, TLS/HTTP 특성, 특정 보안 정책 중 무엇인지는 그것만으로 확정하지 않는다.
- 홈페이지는 허용되고 같은 endpoint의 POST만 거절되면 method/body 조건을 우선 조사한다. GET 성공이 장기적 수집 허용이나 공식 API 지원을 의미하지는 않는다.
- 원인 규칙이 끝내 드러나지 않으면 참조번호, KST/UTC 시각, endpoint, region, GET/POST 결과로 KIND 운영자에게 보안 로그 조회를 요청하는 자료를 정리한다. 자동으로 문의를 보내지 않는다.
- 이후 추가 QA는 필요할 때 단일 변수만 바꾸며 한 번에 한 쌍만 실행한다. 무분별한 헤더 변경, 반복 요청, IP/프록시 순회로 차단을 우회하지 않는다.
- 기존 기본 출처 수집과 알림 품질/최신성 게이트는 유지한다. KIND 부재 상태의 데이터 범위와 다음 예약 Cron 결과는 별도 검증한다.
