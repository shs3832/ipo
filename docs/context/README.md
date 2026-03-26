# AI Context Index

이 디렉터리는 AI 작업자가 프로젝트 맥락을 빠르게 복원하도록 역할별로 분리한 문서 모음입니다.

## Read This First

- [AGENTS.md](/Users/shs/Desktop/Study/ipo/AGENTS.md)

## Reading Order

1. [project-overview.md](/Users/shs/Desktop/Study/ipo/docs/context/project-overview.md)
2. [runtime-and-ops.md](/Users/shs/Desktop/Study/ipo/docs/context/runtime-and-ops.md)
3. [data-and-scoring.md](/Users/shs/Desktop/Study/ipo/docs/context/data-and-scoring.md)
4. [score-rollout-status.md](/Users/shs/Desktop/Study/ipo/docs/context/score-rollout-status.md)
5. [product-surface.md](/Users/shs/Desktop/Study/ipo/docs/context/product-surface.md)
6. 현재 스레드 맥락은 [issue.md](/Users/shs/Desktop/Study/ipo/issue.md)

## Which Doc To Read For Which Task

- 기능 구현 시작 전:
  - [project-overview.md](/Users/shs/Desktop/Study/ipo/docs/context/project-overview.md)
- 잡, 크론, 환경 변수, 운영 로그:
  - [runtime-and-ops.md](/Users/shs/Desktop/Study/ipo/docs/context/runtime-and-ops.md)
- 수집기, DB fact table, 점수 계산:
  - [data-and-scoring.md](/Users/shs/Desktop/Study/ipo/docs/context/data-and-scoring.md)
  - [docs/ipo-score-architecture.md](/Users/shs/Desktop/Study/ipo/docs/ipo-score-architecture.md)
- 점수 공개 상태, 비공개 이유, 재오픈 절차:
  - [score-rollout-status.md](/Users/shs/Desktop/Study/ipo/docs/context/score-rollout-status.md)
- 홈/상세/UI 배치, 공개/비공개 판단:
  - [product-surface.md](/Users/shs/Desktop/Study/ipo/docs/context/product-surface.md)

## Documentation Rules

- `issue.md`는 스레드별 변경 로그만 기록
- 긴 운영 메모는 `docs/context/`로 이동
- 상위 문서는 요약과 링크만 두고, 세부 내용은 하위 문서에 유지
- 같은 설명을 여러 파일에 반복 복붙하지 않음
