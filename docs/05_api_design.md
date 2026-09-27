# 05. API 설계

> 기준 문서: [03 DB 설계](03_db_design.md), [04 비즈니스 규칙](04_business_rules.md), [99 결정 기록](99_decisions.md)
>
> API는 **화면(또는 다른 시스템)이 서버에 일을 시키는 창구**다.
> 이 문서는 창구 목록, 주고받는 데이터 형식, 실패했을 때의 응답을 정한다.

---

## 1. API의 세 종류

```
┌──────────────┐   ① GP 내부 API    ┌──────────────┐  ② LP 연동 API   ┌──────────────┐
│  GP 화면     │ ─────────────────→ │              │ ←──────────────── │              │
│ (Next.js)    │   /api/v1/...      │  GP 서버     │  /api/lp/v1/...   │  LP 시스템   │
└──────────────┘                    │  + GP DB     │                   │  + LP DB     │
                                    │              │ ────────────────→ │              │
                                    └──────────────┘  ③ 웹훅(이벤트)   └──────────────┘
```

| 종류 | 누가 호출 | 무엇을 | 인증 |
|---|---|---|---|
| ① GP 내부 API | GP 화면 | 펀드 운영의 모든 작업 | GP 사용자 로그인 세션 |
| ② LP 연동 API | LP 시스템 | LP 공개 등급 데이터 조회, 통지 확인 | 시스템 간 API 키 |
| ③ 웹훅 | GP 서버 → LP 시스템 | "데이터가 바뀌었다"는 알림 전송 | 서명(위조 방지 표시) |

> **웹훅이란?** 평소처럼 LP 시스템이 "바뀐 거 있어?"라고 계속 묻는 대신,
> GP 서버가 변경이 생기는 즉시 LP 시스템에 먼저 알려주는 방식이다.

---

## 2. 공통 규칙

### 2-1. 주소와 형식

| 항목 | 규칙 | 예시 |
|---|---|---|
| 기본 주소 | GP 내부 `/api/v1`, LP 연동 `/api/lp/v1` | `/api/v1/funds` |
| 버전 | 주소에 `v1` 을 넣는다. 호환이 깨지는 변경은 `v2` 로 | |
| 자원 이름 | 영어 소문자, 여러 단어는 하이픈, 복수형 | `/capital-calls` |
| 데이터 형식 | JSON | |
| 필드 이름 | DB·용어 정의와 같은 **snake_case** (D21 제안) | `commitment_amount` |
| 금액 | 원 단위 정수 | `150000000` |
| 비율 | 소수 | `0.02` |
| 날짜 / 일시 | `YYYY-MM-DD` / ISO 8601 | `2026-09-27` / `2026-09-27T14:30:00+09:00` |
| ID | UUID 문자열 | |

> **금액이 JSON 숫자로 안전한가?** 자바스크립트는 약 9,007조까지 정수를 정확히 다룬다. 펀드 금액 범위에서는 문제없다.

### 2-2. HTTP 메서드의 쓰임

| 메서드 | 쓰임 | 예시 |
|---|---|---|
| `GET` | 조회 (데이터를 바꾸지 않음) | 펀드 목록 조회 |
| `POST` | 생성, 또는 **상태를 바꾸는 동작** | 캐피탈콜 생성, 캐피탈콜 발송 |
| `PATCH` | 일부 수정 (초안·기본 정보만) | 펀드 이름 수정 |
| `PUT` | 통째로 교체 | 규약 버전 1 저장, 투표 기록 |
| `DELETE` | 삭제 (초안만) | 캐피탈콜 초안 삭제 |

**상태는 `PATCH` 로 바꾸지 않는다** (D23 제안).
`PATCH /capital-calls/{id} { "status": "issued" }` 대신 `POST /capital-calls/{id}/issue` 처럼 **동작 이름이 있는 API** 를 쓴다.

> **왜?** 상태 변경에는 조건 검사와 부수 작업(통지 생성, 원장 기록, 이벤트)이 따라온다.
> 일반 수정 API에 섞으면 "이름만 고치려 했는데 상태도 같이 바뀌는" 사고가 생기고, 조건 검사를 빠뜨리기 쉽다.
> 동작 API로 분리하면 API 이름만 봐도 무슨 일이 일어나는지 알 수 있다.

### 2-3. 응답 형식

**성공 (단건)**
```json
{ "data": { "id": "…", "name": "그로스 1호 펀드" } }
```

**성공 (목록)**
```json
{
  "data": [ { … }, { … } ],
  "meta": { "page": 1, "page_size": 20, "total": 57 }
}
```
목록은 `?page=1&page_size=20` 으로 나눠 받는다. `page_size` 최대 100.

**실패**
```json
{
  "error": {
    "code": "EXCEEDS_INVESTABLE_AMOUNT",
    "message": "투자 가능 잔액을 넘습니다",
    "rule": "BR-INV-03",
    "details": { "requested_amount": 3000000000, "investable_amount": 2100000000 }
  }
}
```
- `code`: 04 13장의 오류 코드. 화면은 이 값으로 안내 문구를 고른다
- `rule`: 위반한 비즈니스 규칙 ID. 개발·테스트 중 원인 추적용
- `details`: 사용자에게 보여줄 숫자 등 추가 정보

### 2-4. HTTP 상태 코드

| 코드 | 의미 | 이 프로젝트에서 쓰는 경우 |
|---|---|---|
| 200 | 성공 | 조회, 수정, 동작 성공 |
| 201 | 생성됨 | 새 데이터 생성 |
| 400 | 요청 형식 오류 | 필수 값 누락, 날짜 형식 오류 (`VALIDATION_ERROR`) |
| 401 | 로그인 필요 | 세션 없음, API 키 없음 (`UNAUTHORIZED`) |
| 403 | 권한 없음 | LP 연동 API가 다른 LP의 데이터를 요청 (`FORBIDDEN`) |
| 404 | 없음 | 없는 ID (`NOT_FOUND`) |
| 409 | 상태 충돌 | 지금 상태에서 할 수 없는 작업: `FUND_STATUS_NOT_ALLOWED`, `DOCUMENT_LOCKED`, `INVALID_STAGE_TRANSITION`, `ALREADY_REVERSED`, `IDEMPOTENCY_KEY_REUSED` |
| 422 | 규칙 위반 | 형식은 맞지만 비즈니스 규칙 위반: 금액 초과, 현금 부족, 기간 밖 등 |
| 500 | 서버 오류 | 예상하지 못한 오류. 상세 내용은 응답에 넣지 않고 서버 로그에만 남긴다 |

> **400과 422를 나누는 이유**: 400은 "입력을 잘못 적었다"(화면에서 고치면 됨),
> 422는 "입력은 맞는데 지금은 안 된다"(업무 상황을 바꿔야 함, 예: 캐피탈콜 먼저)라서 사용자 안내가 다르다.

### 2-5. 중복 요청 방지 (멱등성 키) (D22 제안)

돈이 움직이는 `POST` 요청은 헤더에 `Idempotency-Key`(요청마다 화면이 만든 고유 값)를 반드시 보낸다.

```
POST /api/v1/funds/{fund_id}/investments
Idempotency-Key: 7f3c9a2e-…
```

- 같은 키로 다시 요청이 오면 **다시 처리하지 않고 처음 결과를 그대로** 돌려준다
- 같은 키인데 요청 내용이 다르면 `409 IDEMPOTENCY_KEY_REUSED`
- 키는 24시간 보관한다

> **왜?** 네트워크가 느려 사용자가 "투자 집행" 버튼을 두 번 누르거나, 응답이 유실돼 화면이 자동 재시도하면
> 같은 투자가 두 번 기록될 수 있다. 돈이 걸린 작업에서는 치명적이다.
> 이를 위해 03 DB 설계에 `idempotency_keys` 테이블을 추가한다 (8장).

**적용 대상**: 투자 집행, 납입 기록, 관리보수 청구, 회수 기록, 분배 지급, 원장 취소, 캐피탈콜 발송, 분배 확정

### 2-6. 미리보기 API (D26 제안)

금액을 계산해서 저장하는 작업은 **계산만 하고 저장하지 않는 미리보기 API** 를 따로 둔다.

| 미리보기 | 보여주는 것 |
|---|---|
| 캐피탈콜 미리보기 | 조합원별 요청액, 1원 나머지가 붙은 조합원 |
| 관리보수 미리보기 | 기간 분할 여부, 기준 금액, 요율, 보수액 |
| 분배 미리보기 | 워터폴 단계별 금액, 조합원별 분배액, GP 성과보수 |
| 상태 이동 점검 | 다음 단계로 가기 위해 **아직 충족되지 않은 조건 목록** |

> **왜?** 사용자가 "저장" 전에 계산 결과를 확인할 수 있다. 저장 API는 미리보기와 **같은 계산 함수**를 쓰므로 결과가 항상 같다.

---

## 3. GP 내부 API 목록

> 표기: 💰 멱등성 키 필수 · 👁 미리보기(저장 안 함) · 🔄 상태를 바꾸는 동작
> 주소의 `/api/v1` 은 생략했다.

### 3-1. 인증

| 메서드 | 주소 | 설명 |
|---|---|---|
| POST | `/auth/login` | 이메일·비밀번호 로그인. 성공 시 세션 쿠키 발급 |
| POST | `/auth/demo-login` | 비밀번호 없이 데모 계정으로 로그인 (D28) |
| POST | `/auth/logout` | 로그아웃 |
| GET | `/auth/me` | 현재 로그인 사용자 |

> 세션 쿠키는 `HttpOnly`(자바스크립트가 읽을 수 없음), `Secure`(HTTPS에서만 전송)로 발급한다.
> 세션은 `sessions` 테이블에 저장한다 (D27). 로그인 실패 시에는 이메일이 없는 경우와 비밀번호가 틀린 경우를 같은 문구로 답해, 가입된 이메일을 알아낼 수 없게 한다.

### 3-2. 기준 정보

| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET | `/lps` | 출자자 목록 (검색: `?q=`, `?lp_type=`) | |
| POST | `/lps` | 출자자 등록 | |
| GET | `/lps/{lp_id}` | 출자자 상세 + **전체 펀드 출자 현황** | |
| PATCH | `/lps/{lp_id}` | 출자자 정보 수정 | |
| GET | `/companies` | 기업 목록 | |
| POST | `/companies` | 기업 등록 | |
| GET | `/companies/{company_id}` | 기업 상세 + 딜 이력 + 펀드별 투자 현황 | |
| PATCH | `/companies/{company_id}` | 기업 정보 수정 | |

### 3-3. 펀드

| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET | `/funds` | 펀드 목록 + 요약 숫자 (`?status=`) | |
| POST | `/funds` | 펀드 생성 (`planning`, 규약 버전 1 함께 생성) | |
| GET | `/funds/{fund_id}` | 펀드 상세 + 대시보드 숫자 + 경고 | BR-FUND-07, BR-INV-06 |
| PATCH | `/funds/{fund_id}` | 기본 정보 수정 (기획·모집 중만) | BR-FUND-08 |
| GET 👁 | `/funds/{fund_id}/transition-check?to={status}` | 상태 이동 가능 여부 + 부족한 조건 목록 | BR-FUND-01~05 |
| POST 🔄 | `/funds/{fund_id}/transitions` | 상태 이동 `{ "to_status": "formed" }` | BR-FUND-01~06 |
| PUT | `/funds/{fund_id}/registration` | 등록 신청일·완료일 입력 | |
| GET | `/funds/{fund_id}/terms` | 규약 버전 전체 이력 | |
| GET | `/funds/{fund_id}/terms/effective?date=` | 특정 날짜에 적용되는 규약 | BR-TERM-04 |
| PUT | `/funds/{fund_id}/terms/1` | 규약 버전 1 저장 (결성 전만) | BR-TERM-01 |
| POST | `/funds/{fund_id}/terms` | 규약 새 버전 (가결 안건 필수) | BR-TERM-02, 03 |
| GET / POST | `/funds/{fund_id}/institutions` | 관계 기관 목록 / 등록 | |
| PATCH / DELETE | `/funds/{fund_id}/institutions/{id}` | 관계 기관 수정 / 삭제 | |

### 3-4. 모집·조합원

| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET | `/funds/{fund_id}/proposals` | 출자 제안 목록 + 모집 달성률 | BR-PROP-04 |
| POST | `/funds/{fund_id}/proposals` | 출자 제안 작성 | |
| PATCH | `/funds/{fund_id}/proposals/{id}` | 금액·메모 수정 | |
| POST 🔄 | `/funds/{fund_id}/proposals/{id}/send` | 제안 발송 (통지 생성) | BR-PROP-03 |
| POST 🔄 | `/funds/{fund_id}/proposals/{id}/transitions` | 단계 이동 `{ "to_status": "committed", "loc_amount": … }` | BR-PROP-01, 02 |
| POST 🔄 | `/funds/{fund_id}/roster` | **조합원 명부 확정** (조합원 + 약정 원장 생성) | BR-MEM-01~04 |
| DELETE 🔄 | `/funds/{fund_id}/roster` | 명부 취소 (결성총회 가결 전만, 원장은 취소 행으로) | BR-MEM-05 |
| GET | `/funds/{fund_id}/members` | 조합원 목록 + 조합원별 현황(약정·납입·잔여·분배) | |
| POST 💰 | `/funds/{fund_id}/members/{member_id}/commitment-increases` | 약정 증액 (가결 안건 필수) | BR-MEM-06 |

### 3-5. 원장

| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET | `/funds/{fund_id}/ledger` | 원장 조회 (`?member_id=`, `?entry_type=`) | |
| POST 💰 | `/funds/{fund_id}/ledger/{entry_id}/reversal` | 원장 행 취소 `{ "memo": "…" }` | BR-LED-02 |

### 3-6. 캐피탈콜

| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET | `/funds/{fund_id}/capital-calls` | 목록 + 회차별 납입률 | |
| POST 👁 | `/funds/{fund_id}/capital-calls/preview` | 조합원별 배분 미리보기 | BR-CALL-02~05 |
| POST | `/funds/{fund_id}/capital-calls` | 초안 생성 (조합원별 항목 자동 계산·저장) | BR-CALL-01~06 |
| GET | `/funds/{fund_id}/capital-calls/{call_id}` | 상세 + 조합원별 납입 상태 | BR-CALL-11 |
| PATCH / DELETE | `/funds/{fund_id}/capital-calls/{call_id}` | 초안 수정 / 삭제 | BR-COM-03 |
| POST 🔄💰 | `/funds/{fund_id}/capital-calls/{call_id}/issue` | 발송 (잠금 + 통지) | BR-CALL-07 |
| POST 💰 | `/funds/{fund_id}/capital-calls/{call_id}/items/{item_id}/payments` | 납입 기록 | BR-CALL-08~10 |
| POST 🔄 | `/funds/{fund_id}/capital-calls/{call_id}/close` | 수동 마감 | BR-CALL-12 |

### 3-7. 딜 파이프라인

| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET | `/deals` | 딜 목록 (`?stage=`, `?owner_id=`, `?fund_id=`) | |
| GET | `/deals/board` | 단계별로 묶은 칸반 보드용 데이터 | |
| GET | `/deals/stats` | 단계별 건수, 단계별 평균 소요일, 드롭 사유 분포 | |
| POST | `/deals` | 딜 등록 (`sourcing`) | |
| GET | `/deals/{deal_id}` | 상세 + 단계 이력 + 메모 | |
| PATCH | `/deals/{deal_id}` | 단계 외 정보 수정 (종료 전만) | BR-DEAL-02 |
| POST 🔄 | `/deals/{deal_id}/transitions` | 단계 이동 `{ "to_stage": "dropped", "drop_reason": "…" }` | BR-DEAL-01~05 |
| GET / POST | `/deals/{deal_id}/notes` | 메모 목록 / 작성 | |

### 3-8. 투자·포트폴리오

| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET | `/funds/{fund_id}/investments` | 투자 집행 목록 | |
| POST 💰 | `/funds/{fund_id}/investments` | 투자 집행 (신규·후속) | BR-INV-01~05 |
| GET | `/funds/{fund_id}/portfolio` | 포트폴리오 (기업별 투자·평가·회수·상태) | |
| GET / POST | `/funds/{fund_id}/valuations` | 평가 목록 / 기록 | BR-VAL-01~03 |
| GET | `/funds/{fund_id}/exits` | 회수 목록 | |
| POST 💰 | `/funds/{fund_id}/exits` | 회수 기록 | BR-EXIT-01~06 |

### 3-9. 관리보수

| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET | `/funds/{fund_id}/management-fees` | 청구 이력 | |
| POST 👁 | `/funds/{fund_id}/management-fees/preview` | 기간을 넣으면 분할·계산 결과 | BR-FEE-01~07 |
| POST 💰 | `/funds/{fund_id}/management-fees` | 청구 저장 (미리보기와 같은 계산) | BR-FEE-01~07 |

### 3-10. 총회

| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET / POST | `/funds/{fund_id}/meetings` | 총회 목록 / 생성 | BR-MTG-01, 02 |
| GET / PATCH | `/funds/{fund_id}/meetings/{meeting_id}` | 상세(안건·투표 현황) / 수정(예정 상태만) | |
| POST 🔄 | `/funds/{fund_id}/meetings/{meeting_id}/convene` | 소집 (통지 생성) | BR-MTG-03 |
| POST | `/funds/{fund_id}/meetings/{meeting_id}/agendas` | 안건 추가 (가결 기준 복사) | BR-VOTE-04 |
| PUT | `/funds/{fund_id}/meetings/{meeting_id}/agendas/{agenda_id}/votes/{member_id}` | 투표 기록 `{ "choice": "for" }` | BR-VOTE-01, 02 |
| POST 🔄 | `/funds/{fund_id}/meetings/{meeting_id}/hold` | 개최 처리 + 모든 안건 결과 확정 | BR-VOTE-03, 05, 06 |
| POST 🔄 | `/funds/{fund_id}/meetings/{meeting_id}/cancel` | 취소 | |

### 3-11. 정기 보고

| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET / POST | `/funds/{fund_id}/reports` | 목록 / 초안 생성 | BR-RPT-01 |
| GET | `/funds/{fund_id}/reports/{report_id}` | 초안이면 최신 숫자, 발행본이면 스냅샷 | BR-RPT-02 |
| PATCH | `/funds/{fund_id}/reports/{report_id}` | GP 코멘트 수정 (초안만) | |
| POST 🔄 | `/funds/{fund_id}/reports/{report_id}/publish` | 발행 (스냅샷 저장 + 통지) | BR-RPT-03, 05 |

### 3-12. 분배

| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET | `/funds/{fund_id}/distributions` | 분배 이력 | |
| POST 👁 | `/funds/{fund_id}/distributions/preview` | 워터폴 계산 미리보기 | BR-DIST-01~04 |
| POST | `/funds/{fund_id}/distributions` | 초안 생성 (계산 결과 저장) | BR-DIST-01~04 |
| GET / DELETE | `/funds/{fund_id}/distributions/{id}` | 상세 / 초안 삭제 | |
| POST 🔄💰 | `/funds/{fund_id}/distributions/{id}/confirm` | 확정 (잠금 + 통지) | BR-DIST-05 |
| POST 🔄💰 | `/funds/{fund_id}/distributions/{id}/pay` | 지급 (원장 기록) | BR-DIST-06 |

### 3-13. 통지·대시보드·연동 관리

| 메서드 | 주소 | 설명 | 규칙 |
|---|---|---|---|
| GET | `/funds/{fund_id}/notices` | 통지 목록 + LP별 확인 현황 | |
| POST | `/funds/{fund_id}/notices` | 일반 공지 초안 작성 | |
| POST 🔄 | `/funds/{fund_id}/notices/{notice_id}/send` | 일반 공지 발송 | BR-NTC-01 |
| GET | `/dashboard` | 전체 펀드 요약 + 모든 경고 모음 | |
| GET | `/integration-events` | 연동 이벤트 목록 (`?status=failed`) | |
| POST | `/integration-events/{event_id}/retry` | 실패 이벤트 재전송 | BR-EVT-03 |

**합계: GP 내부 API 약 80개**

---

## 4. 대표 API 상세

모든 API를 이 수준으로 쓰는 대신, 핵심 흐름 6개만 상세히 적는다. 나머지는 같은 형식을 따른다.

### 4-1. 캐피탈콜 미리보기 → 생성

**요청** `POST /api/v1/funds/{fund_id}/capital-calls/preview`
```json
{
  "total_call_amount": 1000000000,
  "call_all_unfunded": false,
  "call_date": "2027-03-02",
  "due_date": "2027-03-16"
}
```
- `call_all_unfunded: true` 면 `total_call_amount` 를 무시하고 조합원별 잔여 약정 전액을 요청한다 (BR-CALL-05)

**응답** `200`
```json
{
  "data": {
    "total_call_amount": 1000000000,
    "fund_unfunded_amount": 7000000000,
    "items": [
      { "member_id": "…", "member_name": "그로스벤처스(GP)", "member_type": "gp",
        "ownership_ratio": 0.1, "call_amount": 100000000, "unfunded_after": 600000000 },
      { "member_id": "…", "member_name": "A 연기금", "member_type": "lp",
        "ownership_ratio": 0.6, "call_amount": 600000000, "unfunded_after": 3600000000 },
      { "member_id": "…", "member_name": "B 캐피탈", "member_type": "lp",
        "ownership_ratio": 0.3, "call_amount": 300000000, "unfunded_after": 1800000000 }
    ],
    "remainder": { "amount": 0, "assigned_member_id": null }
  }
}
```

**오류**
| 상황 | 응답 |
|---|---|
| 펀드가 `fundraising` 인데 최초 납입이 아님 | `409 FUND_STATUS_NOT_ALLOWED` |
| 요청액 > 펀드 잔여 약정 | `422 CALL_EXCEEDS_UNFUNDED`, `details.fund_unfunded_amount` |
| 납입 기한 < 요청일 | `400 VALIDATION_ERROR` |

**생성** `POST /api/v1/funds/{fund_id}/capital-calls` 는 같은 요청에 `purpose`, `is_initial` 을 더해 보내고,
미리보기와 같은 계산 결과를 `draft` 로 저장한 뒤 `201` 로 돌려준다.

### 4-2. 납입 기록

**요청** `POST /api/v1/funds/{fund_id}/capital-calls/{call_id}/items/{item_id}/payments`
```
Idempotency-Key: 2b1e…
```
```json
{ "paid_amount": 300000000, "paid_date": "2027-03-10", "memo": "B 캐피탈 1차 납입" }
```

**서버 처리 순서** (하나의 트랜잭션)
1. 펀드 행 잠금 (BR-COM-02)
2. 캐피탈콜이 `issued` 또는 `closed` 인지 확인
3. 누적 납입액 + 이번 납입 ≤ 요청액 확인 (BR-CALL-09)
4. 원장에 `contribution` 행 추가 (`source_type = 'capital_call_item'`)
5. 연동 이벤트 `ledger.entry_created` 추가 (대상: B 캐피탈)
6. 모든 항목이 완납이면 캐피탈콜 자동 마감 (BR-CALL-12)

**응답** `201`
```json
{
  "data": {
    "ledger_entry_id": "…",
    "item": { "call_amount": 300000000, "paid_amount": 300000000, "payment_status": "paid" },
    "capital_call": { "status": "closed", "paid_ratio": 1.0 }
  }
}
```

### 4-3. 투자 집행

**요청** `POST /api/v1/funds/{fund_id}/investments`
```
Idempotency-Key: 9d4a…
```
```json
{
  "company_id": "…",
  "deal_id": "…",
  "investment_date": "2027-04-15",
  "investment_amount": 3000000000,
  "security_type": "rcps",
  "shares": 12000,
  "price_per_share": 250000,
  "is_follow_on": false,
  "is_primary_purpose": true
}
```

**서버 처리 순서** (하나의 트랜잭션)
1. 펀드 행 잠금
2. 펀드 `operating` 확인 → 아니면 `409 FUND_STATUS_NOT_ALLOWED`
3. 신규: 투자 기간 안 + 딜 `approved` + 이 딜의 신규 투자 없음 / 후속: 보유 중인 기업
4. 투자 가능 잔액 확인 → `422 EXCEEDS_INVESTABLE_AMOUNT`
5. 현금 잔액 확인 → `422 INSUFFICIENT_CASH`
6. 투자 저장
7. 주목적 비율 다시 계산, 경고 수준 판정

**응답** `201`
```json
{
  "data": {
    "investment": { "id": "…", "investment_amount": 3000000000 },
    "fund_after": {
      "investable_amount": 12000000000,
      "cash_amount": 1500000000,
      "primary_purpose_ratio": 0.42
    },
    "warnings": [
      { "code": "PRIMARY_PURPOSE_BELOW_MIN", "level": "caution",
        "message": "투자 기간이 1년 이내로 남았는데 주목적 투자 비율이 의무 비율(60%)보다 낮습니다" }
    ]
  }
}
```
> 경고(`warnings`)는 오류가 아니다. 저장은 성공했고, 화면에 주의 안내를 띄운다.

**오류 예시** `422`
```json
{
  "error": {
    "code": "INSUFFICIENT_CASH",
    "message": "현금 잔액이 부족합니다. 캐피탈콜로 먼저 자금을 확보하세요",
    "rule": "BR-INV-04",
    "details": { "requested_amount": 3000000000, "cash_amount": 1200000000, "shortfall_amount": 1800000000 }
  }
}
```

### 4-4. 펀드 상태 이동 점검 → 이동

**요청** `GET /api/v1/funds/{fund_id}/transition-check?to=formed`

**응답** `200`
```json
{
  "data": {
    "from_status": "fundraising",
    "to_status": "formed",
    "ready": false,
    "conditions": [
      { "rule": "BR-FUND-02", "label": "조합원 명부 확정", "met": true },
      { "rule": "BR-FUND-02", "label": "결성총회 결성 안건 가결", "met": false,
        "hint": "결성총회를 개최하고 결성 안건을 가결하세요" },
      { "rule": "BR-FUND-02", "label": "최초 캐피탈콜 발송", "met": true }
    ]
  }
}
```
> 화면은 이 목록을 **체크리스트**로 보여준다. 사용자는 무엇이 남았는지 바로 알 수 있다.

**이동** `POST /api/v1/funds/{fund_id}/transitions` `{ "to_status": "formed" }`
조건이 하나라도 미충족이면 `422 FUND_TRANSITION_NOT_READY` 와 함께 `details.unmet_conditions` 에 위 목록 중 `met: false` 인 항목을 돌려준다.

### 4-5. 분배 미리보기 (워터폴)

**요청** `POST /api/v1/funds/{fund_id}/distributions/preview`
```json
{ "distributable_amount": 5000000000, "distribution_date": "2031-06-30", "is_final": false }
```

**응답** `200`
```json
{
  "data": {
    "cumulative": {
      "paid_in_amount": 10000000000,
      "hurdle_amount": 1000000000,
      "previously_distributed_amount": 10000000000,
      "total_after_this_amount": 15000000000
    },
    "tiers": [
      { "component": "return_of_capital", "cap_amount": 10000000000, "previously_amount": 10000000000, "this_amount": 0 },
      { "component": "hurdle_return",     "cap_amount": 1000000000,  "previously_amount": 0,           "this_amount": 1000000000 },
      { "component": "profit",            "this_amount": 3200000000 },
      { "component": "carried_interest",  "this_amount": 800000000 }
    ],
    "members": [
      { "member_id": "…", "member_name": "A 연기금",
        "components": { "hurdle_return": 600000000, "profit": 1920000000 }, "total_amount": 2520000000 },
      { "member_id": "…", "member_name": "그로스벤처스(GP)",
        "components": { "hurdle_return": 100000000, "profit": 320000000, "carried_interest": 800000000 },
        "total_amount": 1220000000 }
    ],
    "simplifications": ["기준수익 단리 계산", "GP 캐치업 없음", "클로백 없음"]
  }
}
```
> `simplifications` 로 단순화한 규칙을 응답에 함께 담아, 화면이 "이 계산은 단순화된 규칙을 따릅니다"를 표시할 수 있게 한다.

### 4-6. 총회 개최 처리 (결과 확정)

**요청** `POST /api/v1/funds/{fund_id}/meetings/{meeting_id}/hold`

**서버 처리 순서** (하나의 트랜잭션)
1. 총회가 `scheduled` 인지 확인
2. 안건마다 찬성 의결권 합계 ÷ 전체 의결권 ≥ 가결 기준 → `passed` / `rejected` (BR-VOTE-03)
3. 총회 `held`, 결과 잠금
4. 이벤트 `meeting.result_finalized`

**응답** `200`
```json
{
  "data": {
    "meeting_id": "…",
    "status": "held",
    "agendas": [
      { "agenda_no": 1, "title": "조합 결성의 건", "agenda_type": "formation",
        "for_ratio": 0.9, "quorum_ratio": 0.667, "result": "passed",
        "unlocks": ["fund_transition:formed"] }
    ]
  }
}
```
> `unlocks` 로 이 가결 덕분에 **이제 가능해진 작업**을 알려준다. 화면은 "이제 펀드를 결성할 수 있습니다" 버튼을 띄운다.

---

## 5. LP 연동 API

LP 시스템(별도 앱)이 GP 서버에 호출하는 API다. D2, D11, D12를 구현한다.

### 5-1. 인증과 접근 범위 (D24 제안)

```
GET /api/lp/v1/lps/{lp_id}/funds
Authorization: Bearer {LP_SYSTEM_API_KEY}
```

- **시스템 간 인증**: LP 시스템 전체가 API 키 하나를 가진다. 키는 서버 환경 변수에만 저장하고, 화면(브라우저)에는 절대 노출하지 않는다.
- **LP 사용자 로그인은 LP 시스템의 책임**이다. LP 시스템이 로그인한 사용자의 `lp_id` 를 주소에 넣어 호출한다.
- **GP 서버의 검사**: 모든 응답을 LP 공개 등급(03 7장)으로 거른다.
  - 🟢 본인 것만: `lp_id` 가 일치하는 행만
  - 🔵 펀드 단위: 그 LP가 조합원인 펀드만. 아니면 `403 FORBIDDEN`
  - 🟡 요약만: 정기 보고 스냅샷으로만
  - 🔴 비공개: 어떤 LP 연동 API도 반환하지 않는다
- **필드 단위 차단**: 모든 `memo` 컬럼, `created_by` 는 응답에서 제외한다.

### 5-2. 목록

| 메서드 | 주소 (`/api/lp/v1` 생략) | 반환 | 등급 |
|---|---|---|---|
| GET | `/lps/{lp_id}` | LP 기본 정보 | 🟢 |
| GET | `/lps/{lp_id}/funds` | 참여 펀드 목록 + 펀드별 내 약정·납입·분배 요약 | 🔵🟢 |
| GET | `/lps/{lp_id}/funds/{fund_id}` | 펀드 정보 + 현재 규약 + 관계 기관 + 내 현황 | 🔵🟢 |
| GET | `/lps/{lp_id}/funds/{fund_id}/ledger` | 내 원장 (취소 행 포함 전체 이력) | 🟢 |
| GET | `/lps/{lp_id}/funds/{fund_id}/capital-calls` | 발송된 캐피탈콜 + 내 요청액·납입 상태 | 🔵🟢 |
| GET | `/lps/{lp_id}/funds/{fund_id}/distributions` | 확정된 분배 + 내 분배액(단계별) | 🔵🟢 |
| GET | `/lps/{lp_id}/funds/{fund_id}/meetings` | 소집된 총회, 안건, 결과, 내 투표 | 🔵🟢 |
| GET | `/lps/{lp_id}/funds/{fund_id}/reports` | 발행된 정기 보고 (스냅샷) | 🔵🟡 |
| GET | `/lps/{lp_id}/notices` | 받은 통지 전체 (조합원이 되기 전 출자 제안 포함) | 🟢 |
| POST | `/lps/{lp_id}/notices/{notice_id}/acknowledge` | 통지 확인 처리 | 🟢 |
| GET | `/events?after={event_id}&limit=100` | 웹훅을 놓쳤을 때 이벤트를 순서대로 다시 받기 | |

> **LP가 직접 투표하는 기능**(LP 시스템에서 찬반 입력)은 고도화 단계다. MVP에서는 GP가 투표 결과를 입력한다.

### 5-3. 응답 예시: 내 원장

`GET /api/lp/v1/lps/{lp_id}/funds/{fund_id}/ledger`
```json
{
  "data": [
    { "id": "…", "entry_type": "commitment", "amount": 6000000000, "entry_date": "2026-12-15",
      "source": { "type": "formation" }, "reversal_of_id": null },
    { "id": "…", "entry_type": "contribution", "amount": 600000000, "entry_date": "2027-03-10",
      "source": { "type": "capital_call", "call_no": 1 }, "reversal_of_id": null }
  ],
  "meta": {
    "totals": { "commitment_amount": 6000000000, "contribution_amount": 600000000, "distribution_amount": 0 }
  }
}
```
> 원장의 `source_id` 는 GP 내부 문서 ID라 그대로 주지 않고, LP가 이해할 수 있는 정보(캐피탈콜 회차 등)로 바꿔서 준다.

---

## 6. 웹훅 (GP → LP 시스템) (D25 제안)

### 6-1. 전송 형식

```
POST {LP_SYSTEM_URL}/webhooks/gp-events
Content-Type: application/json
X-GP-Event-Id: 5c0e…
X-GP-Timestamp: 2027-03-10T10:15:00+09:00
X-GP-Signature: sha256=8f2a…
```
```json
{
  "id": "5c0e…",
  "event_type": "ledger.entry_created",
  "occurred_at": "2027-03-10T10:15:00+09:00",
  "lp_id": "…",
  "fund_id": "…",
  "data": {
    "entry_type": "contribution",
    "amount": 600000000,
    "entry_date": "2027-03-10"
  }
}
```

### 6-2. 보안: 서명

- GP와 LP 시스템이 **공유 비밀 값**을 하나씩 나눠 가진다
- GP는 `타임스탬프 + 본문` 을 비밀 값으로 계산한 서명(HMAC-SHA256)을 헤더에 넣는다
- LP 시스템은 같은 방식으로 계산해 **서명이 일치할 때만** 받아들인다
- 타임스탬프가 5분 이상 지난 요청은 거부한다 (가로챈 요청을 나중에 다시 보내는 공격 방지)

> **왜 필요한가?** 웹훅 주소는 인터넷에 열려 있다. 서명이 없으면 누구나 "A 연기금이 60억 납입했다"는 가짜 알림을 보낼 수 있다.

### 6-3. 전송 실패와 재시도

- LP 시스템이 10초 안에 `2xx` 로 답하지 않으면 실패로 본다
- 재시도 간격: 1분 → 5분 → 30분 → 2시간 → 12시간. 5번 실패하면 `failed` 로 멈추고 GP 대시보드에 표시 (BR-EVT-03)
- 같은 LP에게 가는 이벤트는 순서대로 보낸다. 앞 이벤트가 실패 중이면 뒤 이벤트는 기다린다 (BR-EVT-04)
- LP 시스템은 `X-GP-Event-Id` 로 중복을 거른다. 이미 받은 ID면 처리 없이 `200` 을 돌려준다
- 웹훅을 놓쳤을 때를 대비해 `GET /api/lp/v1/events?after=` 로 **빠진 이벤트를 직접 가져가는 길**도 열어둔다

---

## 7. Next.js 구현 위치

API 주소는 Next.js의 폴더 구조와 1:1로 대응한다.

```
app/
└─ api/
   ├─ v1/
   │  ├─ auth/login/route.ts
   │  ├─ funds/route.ts                                  → GET, POST /funds
   │  └─ funds/[fund_id]/
   │     ├─ route.ts                                     → GET, PATCH /funds/{fund_id}
   │     ├─ transitions/route.ts
   │     ├─ capital-calls/route.ts
   │     ├─ capital-calls/preview/route.ts
   │     └─ capital-calls/[call_id]/issue/route.ts
   └─ lp/v1/
      └─ lps/[lp_id]/funds/route.ts
lib/
├─ db/          SQL 실행, 트랜잭션, 잠금
├─ rules/       04 비즈니스 규칙 (캐피탈콜 배분, 워터폴, 관리보수 계산)
└─ api/         공통 응답·오류 형식, 멱등성 키 처리, 인증
```

- **`lib/rules/` 에 계산 규칙을 모은다.** 미리보기 API와 저장 API가 같은 함수를 호출하고, 테스트도 이 함수를 직접 검사한다.
- **`lib/services/` 에 SQL을 모은다.** API와 화면이 같은 서비스 함수를 쓴다.
  - **쓰기**(생성·수정·상태 변경): 화면 → API → 서비스. 검증·오류 형식·멱등성 처리가 한 곳을 거친다
  - **읽기**(목록·상세 화면): 서버에서 그리는 화면이 서비스를 직접 호출한다. 서버가 자기 자신에게 HTTP 요청을 한 번 더 보내는 낭비를 없애기 위해서다. 조회 결과는 API 응답과 같은 형태다

---

## 8. 03 DB 설계에 추가한 테이블

#### `idempotency_keys` — 중복 요청 방지 (D22)
| 컬럼 | 자료형 | 설명 |
|---|---|---|
| 🔑 `key` | text | 화면이 보낸 `Idempotency-Key` |
| ❗🔗 `user_id` | uuid → users | 요청한 사용자. `(key, user_id)` 로 구분 |
| ❗ `endpoint` | text | 요청 주소와 메서드 |
| ❗ `request_hash` | text | 요청 본문의 지문 (같은 키에 다른 내용인지 확인) |
| ❗ `response_status` | integer | 처음 응답의 상태 코드 |
| ❗ `response_body` | jsonb | 처음 응답 본문 |
| ❗ `created_at` | timestamptz | 24시간 지나면 삭제 |

확정되면 03 문서에 추가해 테이블은 28개가 된다. LP 공개 등급은 🔴 비공개.

---

## 9. 이 문서에서 내린 결정 (확정)

아래 결정은 2026-09-27 확정되어 [99 결정 기록](99_decisions.md)에 옮겼다.

- **D20. 모든 API를 REST 방식으로 만든다**: Next.js에는 화면에서 서버 함수를 바로 부르는 방식(Server Actions)도 있다. 코드는 더 짧지만 API 목록이 문서로 드러나지 않고 LP 시스템이 쓸 수 없다. REST로 통일하면 GP 화면·LP 시스템·테스트가 같은 창구를 쓰고, API 기획 산출물로 보여주기 좋다.
- **D21. 필드 이름은 snake_case**: DB·용어 정의와 같은 이름을 써서 변환 실수를 없앤다. 자바스크립트 관례(camelCase)와는 다르지만 일관성을 우선한다.
- **D22. 돈이 움직이는 요청은 멱등성 키 필수**: 중복 클릭·자동 재시도로 같은 돈이 두 번 기록되는 것을 막는다. `idempotency_keys` 테이블 추가.
- **D23. 상태 변경은 동작 API로 분리**: `PATCH status` 대신 `POST /issue`, `/confirm`, `/transitions` 등.
- **D24. LP 연동 인증은 시스템 간 API 키 + 경로의 `lp_id`**: LP 사용자 로그인은 LP 시스템이 책임지고, GP는 공개 등급으로 데이터를 거른다.
- **D25. 웹훅은 서명 + 재시도 + 빠진 이벤트 조회 API**: 위조 방지, 일시 장애 대응, 누락 복구를 모두 갖춘다.
- **D26. 금액 계산은 미리보기 API를 따로 둔다**: 저장 전에 계산 결과를 확인하고, 미리보기와 저장이 같은 계산 함수를 쓴다.
