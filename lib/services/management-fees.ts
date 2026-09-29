import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound, statusNotAllowed } from "@/lib/api/errors";
import { formatDate } from "@/lib/format";
import type { FundStatus } from "@/lib/labels";
import { journalForManagementFee } from "@/lib/services/accounting";
import { assertCashAvailable } from "@/lib/services/finance";

// 관리보수 서비스 (BR-FEE-01~07, D16 ⚠️)
// · 분기 단위로 청구한다. 결성일·만기일(해산했으면 해산일)에 걸친 분기는 그 날짜로 자른다
// · 투자 기간 중: 약정 총액 × 투자 기간 요율 / 투자 기간 후: 투자 잔액 × 투자 기간 후 요율
//   청구 기간이 투자 기간 종료일에 걸치면 두 행으로 나눈다 (BR-FEE-04)
// · 보수 = 기준 금액 × 요율 × 일수 ÷ 365, 원 미만 버림. 기준 금액·요율은 각 구간 시작일 시점 값 (BR-FEE-03, 05, 07)
// · 관리보수는 조합 → GP로 나가는 돈이라 조합원 원장이 아니라 청구 테이블에 둔다. 현금 잔액이 줄어든다

export type FeeSegment = {
  period_start: string;
  period_end: string;
  days: number;
  fee_basis: "commitment" | "invested";
  basis_amount: number;
  fee_rate: number;
  terms_version: number;
  fee_amount: number;
};

export type FeePreview = {
  year: number;
  quarter: number;
  segments: FeeSegment[];
  total_fee_amount: number;
  cash_amount: number; // 청구 전 현금 잔액
  enough_cash: boolean;
};

export type FeeCharge = {
  id: string;
  period_start: string;
  period_end: string;
  fee_basis: "commitment" | "invested";
  basis_amount: number;
  fee_rate: number;
  fee_amount: number;
  charged_date: string;
};

const CHARGEABLE: FundStatus[] = ["formed", "operating", "dissolved"]; // 04 업무 규칙 2-2 (해산 후 ⚠️ 실무 확인 9번)
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

// "2026-09-30" 형식 날짜 계산 (시간대 영향을 받지 않도록 UTC 기준)
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
const addDays = (d: string, n: number) => new Date(toTime(d) + n * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (start: string, end: string) => Math.round((toTime(end) - toTime(start)) / 86_400_000) + 1; // 양 끝 포함
const maxDate = (a: string, b: string) => (a > b ? a : b);
const minDate = (a: string, b: string) => (a < b ? a : b);

function quarterRange(year: number, quarter: number) {
  const startMonth = (quarter - 1) * 3 + 1;
  const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const nextStart = quarter === 4 ? `${year + 1}-01-01` : `${year}-${String(startMonth + 3).padStart(2, "0")}-01`;
  return { start, end: addDays(nextStart, -1) };
}

type FundRow = {
  status: FundStatus;
  formation_date: string | null;
  maturity_date: string | null;
  investment_period_end_date: string | null;
  dissolution_date: string | null;
  cash_amount: number;
};

async function loadFund(tx: typeof sql, fundId: string, lock: boolean) {
  assertUuid(fundId, "조합을");
  if (lock) await tx`select 1 from funds where id = ${fundId} for update`; // BR-COM-02
  const [fund] = await tx<FundRow[]>`
    select f.status, f.formation_date, s.maturity_date, s.investment_period_end_date, f.dissolution_date, s.cash_amount
    from funds f join v_fund_summary s on s.fund_id = f.id
    where f.id = ${fundId}
  `;
  if (!fund) throw notFound("조합을");
  return fund;
}

const periodError = (message: string) => new AppError(422, "INVALID_PERIOD", message, "BR-FEE-02", { fields: { quarter: message } });

// 기준 금액 (구간 시작일 시점)
async function basisAmount(tx: typeof sql, fundId: string, basis: "commitment" | "invested", date: string) {
  if (basis === "commitment") {
    const [row] = await tx<{ amount: number }[]>`
      select coalesce(sum(amount), 0)::bigint as amount from ledger_entries
      where fund_id = ${fundId} and entry_type = 'commitment' and entry_date <= ${date}
    `;
    return row.amount;
  }
  // 투자 잔액 = 누적 투자액 − 회수된 원금
  const [row] = await tx<{ amount: number }[]>`
    select (coalesce((select sum(investment_amount) from investments where fund_id = ${fundId} and investment_date <= ${date}), 0)
          - coalesce((select sum(cost_basis_amount) from exits where fund_id = ${fundId} and exit_date <= ${date} and cancelled_at is null), 0))::bigint as amount
  `;
  return row.amount;
}

// BR-TERM-04: 그 날짜에 적용되는 규약 = 적용일이 그 날짜 이전인 버전 중 최신
async function termsAt(tx: typeof sql, fundId: string, date: string) {
  const [terms] = await tx<{ version: number; management_fee_rate: string; management_fee_rate_after: string }[]>`
    select version, management_fee_rate, management_fee_rate_after from fund_terms
    where fund_id = ${fundId} and effective_date <= ${date}
    order by version desc limit 1
  `;
  if (!terms) throw periodError("이 기간에 적용되는 규약이 없습니다");
  return terms;
}

async function calculate(tx: typeof sql, fundId: string, fund: FundRow, year: number, quarter: number): Promise<FeePreview> {
  if (!CHARGEABLE.includes(fund.status)) throw statusNotAllowed("BR-FUND-08", "관리보수는 결성 이후에 청구할 수 있습니다");
  const q = quarterRange(year, quarter);
  // BR-FEE-02: 결성일 ≤ 시작, 끝 ≤ 해산일(해산 전이면 만기일)
  const limit = fund.dissolution_date ?? addDays(fund.maturity_date!, -1);
  const start = maxDate(q.start, fund.formation_date!);
  const end = minDate(q.end, limit);
  if (start > end) throw periodError(`${year}년 ${quarter}분기는 청구할 수 있는 기간(${formatDate(fund.formation_date)} ~ ${formatDate(limit)}) 밖입니다`);
  if (start > today()) throw periodError("아직 시작하지 않은 분기는 청구할 수 없습니다");

  // BR-FEE-04: 투자 기간 종료일에 걸치면 나눈다. 투자 기간 = 결성일 ~ 종료일 전날
  const ipEnd = fund.investment_period_end_date!;
  const parts: { start: string; end: string; basis: "commitment" | "invested" }[] = [];
  if (start < ipEnd) parts.push({ start, end: minDate(end, addDays(ipEnd, -1)), basis: "commitment" });
  if (end >= ipEnd) parts.push({ start: maxDate(start, ipEnd), end, basis: "invested" });

  const segments: FeeSegment[] = [];
  for (const p of parts) {
    const terms = await termsAt(tx, fundId, p.start);
    const rate = Number(p.basis === "commitment" ? terms.management_fee_rate : terms.management_fee_rate_after);
    const basis = await basisAmount(tx, fundId, p.basis, p.start);
    const days = daysBetween(p.start, p.end);
    // BR-FEE-05: 원 미만 버림. 요율(소수 6자리)을 정수로 바꿔 BigInt 로 정확히 계산한다
    const rateMicro = BigInt(Math.round(rate * 1_000_000));
    const fee = Number((BigInt(basis) * rateMicro * BigInt(days)) / (BigInt(1_000_000) * BigInt(365)));
    segments.push({ period_start: p.start, period_end: p.end, days, fee_basis: p.basis, basis_amount: basis, fee_rate: rate, terms_version: terms.version, fee_amount: fee });
  }
  const total = segments.reduce((s, x) => s + x.fee_amount, 0);
  return { year, quarter, segments, total_fee_amount: total, cash_amount: fund.cash_amount, enough_cash: total <= fund.cash_amount };
}

export async function previewManagementFee(fundId: string, year: number, quarter: number) {
  return calculate(sql, fundId, await loadFund(sql, fundId, false), year, quarter);
}

export async function listManagementFees(fundId: string) {
  const fund = await loadFund(sql, fundId, false);
  const charges = await sql<FeeCharge[]>`
    select id, period_start, period_end, fee_basis, basis_amount, fee_rate::float8 as fee_rate, fee_amount, charged_date
    from management_fee_charges where fund_id = ${fundId}
    order by period_start desc
  `;
  return {
    fund_status: fund.status,
    can_charge: CHARGEABLE.includes(fund.status),
    formation_date: fund.formation_date,
    investment_period_end_date: fund.investment_period_end_date,
    cash_amount: fund.cash_amount,
    total_fee_amount: charges.reduce((s, c) => s + c.fee_amount, 0),
    charges,
  };
}

export async function chargeManagementFee(fundId: string, year: number, quarter: number, chargedDate: string, userId: string) {
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const fund = await loadFund(t, fundId, true);
    const preview = await calculate(t, fundId, fund, year, quarter);

    // BR-FEE-01: 이미 청구한 기간과 겹치면 안 된다 (DB 제약도 막지만 어느 기간인지 알려준다)
    const first = preview.segments[0].period_start;
    const last = preview.segments.at(-1)!.period_end;
    const [overlap] = await tx<{ period_start: string; period_end: string }[]>`
      select period_start, period_end from management_fee_charges
      where fund_id = ${fundId} and daterange(period_start, period_end, '[]') && daterange(${first}::date, ${last}::date, '[]')
      limit 1
    `;
    if (overlap) {
      throw new AppError(409, "FEE_PERIOD_OVERLAP", `이미 청구된 기간(${formatDate(overlap.period_start)} ~ ${formatDate(overlap.period_end)})과 겹칩니다`, "BR-FEE-01", {
        fields: { quarter: "이미 청구한 분기입니다" },
      });
    }
    if (chargedDate < first || chargedDate > today()) {
      const message = `청구일은 기간 시작일(${formatDate(first)})부터 오늘 사이여야 합니다`;
      throw new AppError(422, "INVALID_DATE", message, "BR-FEE-02", { fields: { charged_date: message } });
    }
    // BR-FEE-06: 현금이 부족하면 캐피탈콜로 먼저 자금을 확보해야 한다
    // BR-FEE-06 + BR-FIN-02: 청구일 기준 현금 (그 뒤 어느 날의 잔액도 음수가 되면 안 된다)
    await assertCashAvailable(t, fundId, chargedDate, preview.total_fee_amount, "BR-FEE-06");
    if (preview.total_fee_amount === 0) throw new AppError(422, "ZERO_FEE", "청구할 관리보수가 0원입니다 (기준 금액이 없습니다)", "BR-FEE-05");

    for (const s of preview.segments) {
      const [charge] = await tx<{ id: string }[]>`
        insert into management_fee_charges (fund_id, period_start, period_end, fee_basis, basis_amount, fee_rate, fee_amount, charged_date, created_by)
        values (${fundId}, ${s.period_start}, ${s.period_end}, ${s.fee_basis}, ${s.basis_amount}, ${s.fee_rate.toFixed(6)}, ${s.fee_amount}, ${chargedDate}, ${userId})
        returning id
      `;
      // 회계 (D35): 관리보수 / 현금 (0원 구간은 분개하지 않는다)
      if (s.fee_amount > 0) {
        await journalForManagementFee(t, { fund_id: fundId, charge_id: charge.id, amount: s.fee_amount, date: chargedDate, period: `${formatDate(s.period_start)} ~ ${formatDate(s.period_end)}`, created_by: userId });
      }
    }
    return preview;
  });
}
