# 02. 용어 정의

## 이 문서의 목적

VC 업무 용어는 같은 뜻을 여러 말로 부른다 (펀드 = 조합, 출자자 = LP = 유한책임조합원).
기획서, DB, API, 화면이 서로 다른 말을 쓰면 버그와 오해가 생긴다.
그래서 **용어 하나당 한국어 표준어 하나, 코드 이름 하나**로 고정한다.
이후 모든 문서와 코드는 이 표의 이름만 쓴다.

> ⚠️ 표시는 실무 확인이 필요한 정의다.

---

## 0. 이름 규칙

| 대상 | 규칙 | 예시 |
|---|---|---|
| 테이블 | 영어 소문자 + 밑줄, 복수형 | `funds`, `capital_calls` |
| 컬럼 | 영어 소문자 + 밑줄, 단수형 | `fund_id`, `commitment_amount` |
| 금액 | `_amount` 로 끝남. **원 단위 정수**로 저장 (소수점 없음) | `call_amount` = 150000000 |
| 비율 | `_rate` 또는 `_ratio` 로 끝남. **소수**로 저장 | 2% → `0.02` |
| 날짜 | `_date` 로 끝남 (날짜만) | `formation_date` |
| 일시 | `_at` 으로 끝남 (날짜 + 시각) | `sent_at` |
| 상태 | `status` 컬럼, 값은 영어 소문자 | `status = 'committed'` |
| 구분값 | `_type` 으로 끝남 | `exit_type = 'ipo'` |

**금액을 정수로 저장하는 이유**: 소수(실수)로 저장하면 계산 과정에서 1원 단위 오차가 생길 수 있다.
분배처럼 여러 LP에게 나누는 계산에서 오차가 쌓이면 합계가 맞지 않는다.

**비율은 `_rate` / `_ratio` 로 구분한다**
- `_rate`: 약정된 요율 (관리보수율, 성과보수율, 기준수익률)
- `_ratio`: 계산 결과로 나오는 비중 (지분율, 의무투자 비율)

---

## 1. 주체

| 표준어 | 다른 표현 | 코드 이름 | 정의 |
|---|---|---|---|
| 운용사 | GP, 업무집행조합원 | `gp` | 펀드를 만들고 운용하는 회사. 이 시스템의 사용자 |
| 출자자 | LP, 유한책임조합원 | `lp` / `limited_partners` | 펀드에 돈을 넣기로 약속한 기관 또는 개인 |
| 조합원 | 파트너 | `fund_members` | 특정 펀드에 참여한 GP와 LP 전체. GP도 출자하므로 조합원에 포함 |
| 조합원 구분 | | `member_type` | `gp` / `lp` |
| 출자자 유형 | | `lp_type` | `policy`(정책 출자기관) / `pension`(연기금·공제회) / `financial`(금융기관) / `corporate`(일반 기업) / `individual`(개인) / `other` |
| 관계 기관 | | `related_institutions` | 펀드 운영에 필요한 외부 기관 |
| 관계 기관 구분 | | `institution_type` | `custodian`(수탁은행) / `administrator`(사무관리사) / `auditor`(회계감사인) |
| 사용자 | 담당자 | `users` | GP 소속으로 시스템에 로그인하는 사람 |

## 2. 펀드

| 표준어 | 다른 표현 | 코드 이름 | 정의 |
|---|---|---|---|
| 펀드 | 조합, 투자조합 | `fund` / `funds` | GP와 LP가 돈을 모아 만든 투자 단위 |
| 펀드 유형 | | `fund_type` | `venture`(벤처투자조합) / `new_tech`(신기술사업투자조합) ⚠️ 유형별 법·등록 절차 차이 |
| 목표 결성액 | 목표 규모 | `target_amount` | 기획 단계에서 모으려는 금액 |
| 약정 총액 | 결성액, 펀드 규모 | `total_commitment_amount` | 결성 시 확정된 조합원 약정액의 합계 (계산값) |
| 결성일 | | `formation_date` | 결성총회에서 결성이 승인된 날 |
| 존속 기간 | 만기 | `term_years` | 결성일부터 해산까지의 기간 (년) |
| 투자 기간 | | `investment_period_years` | 신규 투자가 가능한 기간 (년). 이후에는 후속 투자·관리만 |
| 만기일 | | `maturity_date` | 결성일 + 존속 기간 (계산값) |
| 규약 | 조합 규약, LPA | `fund_terms` | 펀드 운영 조건. MVP에서는 원문 대신 **핵심 조건 값**만 저장 |
| 주목적 투자 분야 | 주목적 | `primary_purpose` | 펀드가 반드시 일정 비율 이상 투자해야 하는 분야 (예: 초기 창업기업) |
| 주목적 의무 비율 | 의무투자 비율 | `primary_purpose_min_ratio` | 약정 총액 대비 주목적 분야에 투자해야 하는 최소 비율 ⚠️ 산정 기준 |
| GP 의무 출자 비율 | | `gp_commitment_min_ratio` | 약정 총액 중 GP가 최소한 출자해야 하는 비율 ⚠️ |
| 펀드 상태 | | `fund_status` | 아래 참고 |

**펀드 상태 (`fund_status`)**

```
planning(기획) → fundraising(모집 중) → formed(결성 완료) → operating(운용 중)
  → dissolved(해산) → liquidated(청산 완료)
```

- `formed` → `operating`: 등록 완료 후 운용 시작
- `dissolved`: 해산 결의 후 청산 절차 진행 중. 신규 투자·캐피탈콜 불가
- 상태는 앞으로만 이동한다 (되돌리기 없음). 되돌려야 할 상황은 04 비즈니스 규칙에서 다룬다

## 3. 모집·결성

| 표준어 | 다른 표현 | 코드 이름 | 정의 |
|---|---|---|---|
| 출자 제안 | LP 영업, 펀드레이징 | `lp_proposals` | GP가 LP 후보에게 출자를 요청하는 건. 펀드 × LP 단위 |
| 제안 상태 | | `proposal_status` | `proposed`(제안) → `reviewing`(검토 중) → `committed`(확약) / `declined`(거절) |
| 출자확약 | LOC, 출자확약서 | `loc_amount` | LP가 출자하겠다고 확약한 금액. 결성 전 기준 |
| 약정 | 출자 약정 | `commitment` | 조합원이 펀드에 넣기로 최종 확정한 금액. 결성 시 확정 |
| 약정액 | 출자 약정액 | `commitment_amount` | 조합원 한 명의 약정 금액 |
| 지분율 | 출자 비율 | `ownership_ratio` | 조합원 약정액 ÷ 약정 총액 (계산값). 캐피탈콜 배분·의결권·분배의 기준 ⚠️ 분배를 납입 기준으로 하는 경우도 있음 |
| 모집 달성률 | | `fundraising_ratio` | 확약액 합계 ÷ 목표 결성액 (계산값) |
| 등록 | 조합 등록 | `registration` | 결성 후 관계 기관에 펀드를 등록하는 절차. `registration_applied_date`, `registration_completed_date` ⚠️ |

## 4. 출자금 (캐피탈콜)

| 표준어 | 다른 표현 | 코드 이름 | 정의 |
|---|---|---|---|
| 출자 요청 | 캐피탈콜, 수시 납입 요청 | `capital_call` / `capital_calls` | GP가 약정액 중 일부를 실제로 넣어달라고 요청하는 건. 펀드 단위 1건 |
| 조합원별 요청 | | `capital_call_items` | 한 번의 캐피탈콜을 조합원별로 나눈 요청. 조합원 × 캐피탈콜 단위 |
| 요청액 | | `call_amount` | 납입해달라고 요청한 금액. 조합원별 = 전체 요청액 × 지분율 |
| 납입 기한 | | `due_date` | 이 날까지 납입해야 함 |
| 납입 | 출자금 납입 | `contribution` | 조합원이 실제로 돈을 넣은 것 |
| 납입액 | | `paid_amount` | 실제 납입된 금액 |
| 납입일 | | `paid_date` | 실제 납입된 날 |
| 최초 납입 | 결성 납입 | `is_initial` | 결성 시점에 하는 첫 번째 캐피탈콜 여부 (`true` / `false`) |
| 누적 납입액 | 납입 총액 | `total_paid_amount` | 지금까지 납입된 금액의 합 (계산값) |
| 잔여 약정액 | 미요청 약정 | `unfunded_amount` | 약정액 − 누적 요청액 (계산값). 앞으로 요청할 수 있는 한도 |
| 납입 상태 | | `payment_status` | `pending`(대기) / `paid`(완납) / `partial`(일부 납입) / `overdue`(기한 경과 미납) |

## 5. 투자

| 표준어 | 다른 표현 | 코드 이름 | 정의 |
|---|---|---|---|
| 딜 | 투자 검토 건 | `deal` / `deals` | 투자를 검토하는 기업 1건 |
| 딜 단계 | | `deal_stage` | `sourcing`(발굴) → `reviewing`(검토) → `ic`(투심위) → `approved`(투자 확정) / `dropped`(드롭) |
| 투자심의위원회 | 투심위, IC | `ic` | 투자 여부를 최종 결정하는 내부 회의 |
| 기업 | 스타트업 | `companies` | 검토 중이거나 투자한 모든 기업의 기준 정보 |
| 피투자기업 | 포트폴리오사 | `v_portfolio` | 투자가 1건 이상 있는 기업. 별도 테이블이 아니라 계산용 뷰 |
| 투자 | 투자 집행 | `investments` | 펀드가 기업에 돈을 넣은 1건. 같은 기업에 여러 번 가능 |
| 투자 금액 | 취득원가 | `investment_amount` | 투자 1건에 들어간 금액 |
| 투자 형태 | 투자 증권 | `security_type` | `common`(보통주) / `preferred`(우선주) / `rcps`(상환전환우선주) / `cb`(전환사채) / `bw`(신주인수권부사채) / `other` |
| 후속 투자 | 팔로우온 | `is_follow_on` | 이미 투자한 기업에 추가 투자했는지 여부 |
| 주목적 해당 여부 | | `is_primary_purpose` | 이 투자가 주목적 분야에 해당하는지 |
| 평가액 | 공정가치 | `fair_value_amount` | 특정 시점에 평가한 투자 가치. `valuations` 에 기록 ⚠️ 평가 방법 |
| 평가 기준일 | | `valuation_date` | 평가액의 기준 날짜 |
| 투자 가능 잔액 | 드라이파우더 | `investable_amount` | 약정 총액 − 누적 투자액 − 누적 관리보수 (계산값) ⚠️ 재투자·비용 포함 여부 |
| 현금 잔액 | | `cash_amount` | 누적 납입액 + 누적 회수액 − 누적 투자액 − 누적 관리보수 − 누적 분배액 (계산값) |

## 6. 보수

| 표준어 | 다른 표현 | 코드 이름 | 정의 |
|---|---|---|---|
| 관리보수 | 운용보수 | `management_fee` | GP가 펀드 운용 대가로 받는 정기 보수 |
| 관리보수율 | | `management_fee_rate` | 연간 보수율 (예: 0.02 = 연 2%) |
| 관리보수 산정 기준 | | `fee_basis` | `commitment`(약정 총액 기준, 투자 기간 중) / `invested`(투자 잔액 기준, 투자 기간 후) ⚠️ |
| 관리보수 청구 | | `management_fee_charges` | 기간별로 계산해 펀드에서 GP에게 지급한 기록 |
| 성과보수 | 캐리, Carried Interest | `carried_interest` | 펀드 수익이 기준수익률을 넘을 때 GP가 받는 추가 보수 |
| 성과보수율 | | `carry_rate` | 초과 수익 중 GP 몫의 비율 (예: 0.2 = 20%) |
| 기준수익률 | 허들 | `hurdle_rate` | 성과보수를 받기 위해 넘어야 하는 연 수익률 (예: 0.07 = 연 7%) ⚠️ |

## 7. 회수·분배·청산

| 표준어 | 다른 표현 | 코드 이름 | 정의 |
|---|---|---|---|
| 회수 | 엑시트 | `exits` | 투자한 지분을 팔거나 돌려받아 현금화한 1건 |
| 회수 형태 | | `exit_type` | `ipo`(상장 후 매각) / `trade_sale`(구주 매각) / `m_and_a`(인수합병) / `redemption`(상환) / `write_off`(상각, 회수 0) |
| 회수 금액 | | `proceeds_amount` | 회수로 들어온 금액 |
| 회수 배수 | 멀티플, MOIC | `moic` | 회수 금액 ÷ 투자 원금 (계산값) |
| 분배 | 배분 | `distributions` | 펀드가 조합원에게 돈을 돌려주는 1건. 펀드 단위 |
| 조합원별 분배 | | `distribution_items` | 한 번의 분배를 조합원별로 나눈 금액 |
| 분배 가능 금액 | | `distributable_amount` | 이번 분배에 쓸 수 있는 금액 |
| 분배 방식 | 워터폴 | `waterfall` | 원금 반환 → 기준수익 → 성과보수 순서로 나누는 규칙 ⚠️ 단순화 적용 |
| 해산 | | `dissolution` | 펀드 종료를 총회에서 결의한 것. 이후 청산 절차 시작 |
| 청산 | | `liquidation` | 남은 자산을 처리하고 최종 분배해 펀드를 완전히 끝내는 것 |

## 8. 총회·보고·통지

| 표준어 | 다른 표현 | 코드 이름 | 정의 |
|---|---|---|---|
| 조합원 총회 | 총회 | `general_meetings` | 조합원이 모여 안건을 의결하는 회의 |
| 총회 구분 | | `meeting_type` | `formation`(결성총회) / `regular`(정기총회) / `extraordinary`(임시총회) / `dissolution`(해산총회) |
| 안건 | | `agendas` | 총회에서 의결할 항목 1건 |
| 안건 구분 | | `agenda_type` | `formation`(결성 승인) / `terms_amendment`(규약 변경) / `report_approval`(결산 승인) / `dissolution`(해산 결의) / `other` |
| 의결 | 투표 | `votes` | 조합원 1명의 안건 1건에 대한 찬성·반대·기권 |
| 의결권 | | `voting_power_ratio` | 의결에서 조합원 1명이 가진 비중. MVP에서는 지분율과 같음 ⚠️ |
| 의결 정족수 | | `quorum_ratio` | 가결에 필요한 찬성 의결권 비율 ⚠️ |
| 의결 결과 | | `agenda_result` | `pending`(진행 중) / `passed`(가결) / `rejected`(부결) |
| 규약 변경 | | `fund_terms.version` | 가결된 안건을 근거로 규약 조건 전체를 새 버전으로 추가하는 것 |
| 정기 보고 | 영업 보고, LP 보고 | `reports` | 기간별 펀드 현황을 LP에게 알리는 보고서 |
| 통지 | 공지, 노티스 | `notices` | GP가 LP에게 보내는 모든 요청·알림 1건. LP 시스템 연동의 기준 단위 |
| 통지 구분 | | `notice_type` | `proposal`(출자 제안) / `capital_call`(출자 요청) / `report`(정기 보고) / `meeting`(총회 소집) / `distribution`(분배) / `general`(일반 공지) |
| 발송 상태 | | `notice_status` | `draft`(작성) → `sent`(발송) → `acknowledged`(LP 확인) |

## 9. 시스템 공통

| 표준어 | 다른 표현 | 코드 이름 | 정의 |
|---|---|---|---|
| 원장 | 거래 기록 | `ledger_entries` | 조합원별로 확정된 돈(약정·납입·분배)을 한 줄씩 쌓은 기록. **수정하지 않고 추가만** 한다. 캐피탈콜 요청은 포함하지 않음 |
| 원장 구분 | | `entry_type` | `commitment`(약정) / `contribution`(납입) / `distribution`(분배) |
| 취소 행 | 정정 | `reversal_of_id` | 잘못된 원장 행을 없던 일로 만드는 반대 금액 행. 취소 대상 행을 가리킴 |
| LP 공개 등급 | | (테이블 단위) | 테이블마다 LP에게 공개하는 범위: 본인 것만 / 펀드 단위 / 요약만 / 비공개. 03 DB 설계 7장 참고 |
| 이벤트 | 연동 알림 | `integration_events` | LP 시스템에 알려야 할 변경 1건 (D2 연동용) |
| 생성 일시 | | `created_at` | 데이터가 처음 만들어진 시각 |
| 수정 일시 | | `updated_at` | 마지막으로 바뀐 시각 |
| 작성자 | | `created_by` | 데이터를 만든 사용자 |
