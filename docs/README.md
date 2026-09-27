# VC ERP (GP) — 기획 문서 모음

VC 운용사(GP)가 펀드를 기획·모집·결성·운용·보고·청산하는 전 과정을 다루는 ERP MVP.
추후 별도의 LP 시스템과 API로 연동한다.
똑똑 PM 지원용 개인 작업물이며, 실제 서비스와 무관한 연구 목적 프로젝트다.

## 문서 목록

| 번호 | 문서 | 내용 | 상태 |
|---|---|---|---|
| 01 | [MVP 범위](01_mvp_scope.md) | 펀드 생애주기 6단계 범위, LP 연동 원칙, 개발 순서 | v3 확정 |
| 02 | [용어 정의](02_glossary.md) | VC 도메인 용어와 코드상 이름 매핑, 이름 규칙 | 확정 |
| 03 | [DB 설계](03_db_design.md) | 테이블 28개, ERD, 뷰, LP 공개 등급, 설계 의도 | 확정 |
| 04 | [비즈니스 규칙](04_business_rules.md) | 상태 이동, 금액 검증, 워터폴·관리보수 계산, 오류 코드 | 확정 |
| 05 | [API 설계](05_api_design.md) | GP 내부 API, LP 연동 API, 웹훅, 오류·멱등성 규칙 | 확정 |
| 99 | [결정 기록](99_decisions.md) | 설계 중 내린 결정과 이유 (D1~D26) | 진행 중 |

## 기술 스택

- 프론트엔드·서버: Next.js (API 라우트, Server Actions)
- 스타일: Tailwind CSS
- DB: PostgreSQL (Neon), SQL 직접 작성
- 배포: Vercel
