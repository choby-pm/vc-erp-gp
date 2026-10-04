import { cache } from "react";
import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound, statusNotAllowed } from "@/lib/api/errors";
import { formatKRW } from "@/lib/format";
import { EDITABLE_FUND_STATUSES, type FundStatus, type FundStrategy, type FundType, type GpType } from "@/lib/labels";
import { getFundMinimum, type FundMinimum } from "@/lib/rules/fund-minimums";
import type { FundBasicInput, FundTermsInput } from "@/lib/schemas/fund";
import { assertNoActiveRoster } from "@/lib/services/roster";

// 조합 서비스: SQL을 직접 작성해 조합·규약을 조회·저장한다.
// API(쓰기)와 화면(읽기)이 모두 이 함수들을 쓴다.

export type FundListItem = {
  id: string;
  name: string;
  fund_type: FundType;
  strategy: FundStrategy; // 조합 분야 (D47)
  gp_type: GpType;
  status: FundStatus;
  target_amount: number;
  total_commitment_amount: number;
  total_paid_amount: number;
  created_at: Date;
};

export type FundTerms = {
  version: number;
  primary_purpose: string;
  unit_amount: number;
  primary_purpose_min_ratio: number;
  gp_commitment_min_ratio: number;
  management_fee_rate: number;
  management_fee_rate_after: number;
  carry_rate: number;
  hurdle_rate: number;
  quorum_ratio: number;
  effective_date: string;
};

export type FundDetail = FundListItem & {
  term_years: number;
  investment_period_years: number;
  formation_date: string | null;
  maturity_date: string | null;
  investment_period_end_date: string | null;
  registration_applied_date: string | null;
  registration_completed_date: string | null;
  terms: FundTerms; // 오늘 적용되는 버전 (BR-TERM-04)
  scheduled_terms: { version: number; effective_date: string } | null; // 적용일이 아직 오지 않은 새 버전
  minimum: FundMinimum;
  editable: boolean;
};

// numeric 컬럼은 DB에서 문자열로 오므로 숫자로 바꾼다
const RATIO_KEYS = [
  "primary_purpose_min_ratio",
  "gp_commitment_min_ratio",
  "management_fee_rate",
  "management_fee_rate_after",
  "carry_rate",
  "hurdle_rate",
  "quorum_ratio",
] as const;

function parseTerms(row: Record<string, unknown>): FundTerms {
  const terms = { ...row } as Record<string, unknown>;
  for (const key of RATIO_KEYS) terms[key] = Number(terms[key]);
  return terms as unknown as FundTerms;
}

// ─── 최소 결성 기준 검사 (D29) ─────────────────────────────────────────────

// BR-FUND-09: 목표 결성액이 최소 결성액보다 작으면 처음부터 결성할 수 없는 조합이다
function assertTargetMeetsMinimum(fund: Pick<FundBasicInput, "fund_type" | "gp_type" | "target_amount">, fieldPrefix: string) {
  const { minFundAmount, basis } = getFundMinimum(fund.fund_type, fund.gp_type);
  if (minFundAmount !== null && fund.target_amount < minFundAmount) {
    throw new AppError(422, "BELOW_MIN_FUND_SIZE", `목표 결성액은 최소 ${formatKRW(minFundAmount)} 이상이어야 합니다 (${basis})`, "BR-FUND-09", {
      min_fund_amount: minFundAmount,
      fields: { [`${fieldPrefix}target_amount`]: `최소 ${formatKRW(minFundAmount)} 이상 (${basis})` },
    });
  }
}

// BR-TERM-05: 개인투자조합은 1좌 금액 100만 원 이상
function assertUnitAmount(fund: Pick<FundBasicInput, "fund_type" | "gp_type">, unitAmount: number, fieldPrefix: string) {
  const { minUnitAmount, basis } = getFundMinimum(fund.fund_type, fund.gp_type);
  if (minUnitAmount !== null && unitAmount < minUnitAmount) {
    throw new AppError(422, "INVALID_UNIT_AMOUNT", `1좌 금액은 최소 ${formatKRW(minUnitAmount)} 이상이어야 합니다 (${basis})`, "BR-TERM-05", {
      min_unit_amount: minUnitAmount,
      fields: { [`${fieldPrefix}unit_amount`]: `최소 ${formatKRW(minUnitAmount)} 이상 (${basis})` },
    });
  }
}

// ─── 조회 ──────────────────────────────────────────────────────────────────

// 목록에는 결성 전 조합의 모집 진행을 보여주려고 확약 금액 합(BR-PROP-04)을 함께 준다
export async function listFunds() {
  return sql<(FundListItem & { committed_loc_amount: number })[]>`
    select f.id, f.name, f.fund_type, f.strategy, f.gp_type, f.status, f.target_amount, f.created_at,
           s.total_commitment_amount, s.total_paid_amount,
           coalesce((select sum(p.loc_amount) from lp_proposals p where p.fund_id = f.id and p.status = 'committed'), 0)::bigint
             as committed_loc_amount
    from funds f
    join v_fund_summary s on s.fund_id = f.id
    order by f.created_at desc
  `;
}

// 조합 화면 공통 틀(이름·상태·탭)에 필요한 것만 한 번에. 같은 요청 안에서는 한 번만 조회한다 (layout + page)
export const getFundHeader = cache(async (fundId: string) => {
  assertUuid(fundId, "조합을");
  const [fund] = await sql<{ id: string; name: string; fund_type: FundType; strategy: FundStrategy; status: FundStatus; formation_date: string | null }[]>`
    select id, name, fund_type, strategy, status, formation_date from funds where id = ${fundId}
  `;
  if (!fund) throw notFound("조합을");
  return { ...fund, editable: EDITABLE_FUND_STATUSES.includes(fund.status) };
});

export async function getFund(fundId: string): Promise<FundDetail> {
  assertUuid(fundId, "조합을");

  // BR-TERM-04: 오늘 적용되는 규약 = 적용일이 오늘 이전인 버전 중 최신. 적용일이 아직 오지 않은 새 버전은 따로 알려준다
  // 세 조회는 서로 기다릴 필요가 없어 한꺼번에 보낸다 (DB 왕복 시간 절약)
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const [[fund], [terms], [scheduled]] = await Promise.all([
    sql`
      select f.id, f.name, f.fund_type, f.strategy, f.gp_type, f.status, f.target_amount, f.term_years, f.investment_period_years,
             f.formation_date, f.registration_applied_date, f.registration_completed_date, f.created_at,
             s.total_commitment_amount, s.total_paid_amount, s.maturity_date, s.investment_period_end_date
      from funds f
      join v_fund_summary s on s.fund_id = f.id
      where f.id = ${fundId}
    `,
    sql`
      select version, primary_purpose, unit_amount, primary_purpose_min_ratio, gp_commitment_min_ratio,
             management_fee_rate, management_fee_rate_after, carry_rate, hurdle_rate, quorum_ratio, effective_date
      from fund_terms
      where fund_id = ${fundId}
      order by (effective_date <= ${today}) desc, version desc
      limit 1
    `,
    sql<{ version: number; effective_date: string }[]>`
      select version, effective_date from fund_terms where fund_id = ${fundId} and effective_date > ${today} and version > 1
      order by version desc limit 1
    `,
  ]);
  if (!fund) throw notFound("조합을");

  return {
    ...(fund as unknown as FundListItem),
    term_years: fund.term_years,
    investment_period_years: fund.investment_period_years,
    formation_date: fund.formation_date,
    maturity_date: fund.maturity_date,
    investment_period_end_date: fund.investment_period_end_date,
    registration_applied_date: fund.registration_applied_date,
    registration_completed_date: fund.registration_completed_date,
    terms: parseTerms(terms),
    scheduled_terms: scheduled ?? null,
    minimum: getFundMinimum(fund.fund_type, fund.gp_type),
    editable: EDITABLE_FUND_STATUSES.includes(fund.status),
  };
}

// ─── 생성·수정 ─────────────────────────────────────────────────────────────

// 조합 생성: 조합과 규약 버전 1을 하나의 트랜잭션으로 저장한다 (BR-COM-01)
export async function createFund(fund: FundBasicInput, terms: FundTermsInput, userId: string) {
  assertTargetMeetsMinimum(fund, "fund.");
  assertUnitAmount(fund, terms.unit_amount, "terms.");

  return sql.begin(async (tx) => {
    const [created] = await tx<{ id: string }[]>`
      insert into funds (name, fund_type, strategy, gp_type, target_amount, term_years, investment_period_years, created_by)
      values (${fund.name}, ${fund.fund_type}, ${fund.strategy ?? "other"}, ${fund.gp_type}, ${fund.target_amount}, ${fund.term_years},
              ${fund.investment_period_years}, ${userId})
      returning id
    `;
    // 결성 전 규약의 적용일은 작성일로 두고, 결성 시 결성일로 바꾼다 (R2)
    await tx`
      insert into fund_terms ${tx({ ...terms, fund_id: created.id, version: 1, effective_date: new Date(), created_by: userId })}
    `;
    return created;
  });
}

// 기획·모집 중일 때만 수정 가능. 수정하는 동안 조합 행을 잠가 상태가 바뀌는 것을 막는다 (BR-COM-02)
async function lockEditableFund(tx: typeof sql, fundId: string, rule: string) {
  assertUuid(fundId, "조합을");
  const [row] = await tx<{ status: FundStatus; fund_type: FundType; gp_type: GpType }[]>`
    select status, fund_type, gp_type from funds where id = ${fundId} for update
  `;
  if (!row) throw notFound("조합을");
  if (!EDITABLE_FUND_STATUSES.includes(row.status)) {
    throw statusNotAllowed(rule, "결성 이후에는 수정할 수 없습니다. 규약 변경은 총회 가결 안건이 필요합니다");
  }
  return row;
}

export async function updateFundBasic(fundId: string, fund: FundBasicInput) {
  assertTargetMeetsMinimum(fund, "");
  await sql.begin(async (tx) => {
    await lockEditableFund(tx as unknown as typeof sql, fundId, "BR-FUND-08");

    // 조합 유형이 바뀌면 기존 1좌 금액이 새 기준에 맞는지도 다시 확인한다
    const [terms] = await tx<{ unit_amount: number }[]>`
      select unit_amount from fund_terms where fund_id = ${fundId} and version = 1
    `;
    assertUnitAmount(fund, terms.unit_amount, "terms."); // 규약 칸의 오류로 표시

    await tx`
      update funds set ${tx(fund, "name", "fund_type", "strategy", "gp_type", "target_amount", "term_years", "investment_period_years")}
      where id = ${fundId}
    `;
  });
}

export async function updateTermsV1(fundId: string, terms: FundTermsInput) {
  await sql.begin(async (tx) => {
    const fund = await lockEditableFund(tx as unknown as typeof sql, fundId, "BR-TERM-01");

    // 조합 수정 화면은 기본 정보만 고쳐도 규약을 함께 보낸다. 규약이 실제로 바뀔 때만 명부 확정 여부를 검사한다
    const [current] = await tx`
      select primary_purpose, unit_amount, ${sql(RATIO_KEYS as unknown as string[])} from fund_terms where fund_id = ${fundId} and version = 1
    `;
    const before = parseTerms(current);
    const changed =
      before.primary_purpose !== terms.primary_purpose ||
      before.unit_amount !== terms.unit_amount ||
      RATIO_KEYS.some((k) => before[k] !== terms[k]);
    if (!changed) return;

    await assertNoActiveRoster(tx as unknown as typeof sql, fundId);
    assertUnitAmount(fund, terms.unit_amount, "");
    await tx`
      update fund_terms set ${tx(terms, ...RATIO_KEYS, "primary_purpose", "unit_amount")}
      where fund_id = ${fundId} and version = 1
    `;
  });
}
