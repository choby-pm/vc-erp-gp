import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound, statusNotAllowed } from "@/lib/api/errors";
import { formatDate, formatKRWFull, formatPercent } from "@/lib/format";
import { DISTRIBUTION_COMPONENTS, DISTRIBUTION_COMPONENT_LABEL, type DistributionComponent, type DistributionStatus, type FundStatus } from "@/lib/labels";
import type { DistributionInput } from "@/lib/schemas/distribution";
import { journalForDistributionPayment, reverseSourceJournal } from "@/lib/services/accounting";
import { recordEvent } from "@/lib/services/events";
import { assertCashAvailable, availableCashOn } from "@/lib/services/finance";
import { addLedgerEntry } from "@/lib/services/ledger";
import { termsEffectiveAt } from "@/lib/services/terms";

// 분배와 성과보수 (04 업무 규칙 10, BR-DIST-01~08) ⚠️ 단순화한 워터폴 (D15)
// · 조합 전체 기준 누적 계산: "처음부터 이번까지 분배한 총액"으로 단계를 다시 나누고, 이미 나간 몫을 뺀 만큼이 이번 분배
//     1단계 원금 반환 (누적 납입액까지) → 2단계 기준수익 (단리) → 3단계 초과수익 (성과보수율만큼 GP, 나머지 조합원)
// · 조합원별 배분: 원금 반환은 조합원별 납입액, 기준수익은 조합원별 기준수익, 초과수익은 약정 비율(지분율)대로.
//   원 미만은 버리고 나머지는 약정액이 가장 큰 조합원에게 (BR-CALL-03, 04와 같은 규칙)
// · 흐름: 초안(계산 결과 저장) → 확정(잠금 + LP 통지) → 지급(조합원 원장 + 분개)
// · 정정 (BR-DIST-12, D39): 확정·지급한 분배는 취소한다 (마지막 분배부터). 지급했던 분배면 원장 취소 행 + 분개 역분개

export type WaterfallTier = { component: DistributionComponent; cap_amount: number | null; previously_amount: number; this_amount: number };
export type WaterfallMember = {
  member_id: string;
  member_name: string;
  member_type: "gp" | "lp";
  lp_id: string | null;
  commitment_amount: number;
  paid_in_amount: number;
  components: Partial<Record<DistributionComponent, number>>;
  total_amount: number;
};
export type Waterfall = {
  distribution_date: string;
  distributable_amount: number;
  is_final: boolean;
  rates: { hurdle_rate: number; carry_rate: number; terms_version: number };
  cumulative: { paid_in_amount: number; hurdle_amount: number; previously_distributed_amount: number; total_after_this_amount: number };
  tiers: WaterfallTier[];
  members: WaterfallMember[];
  available_cash_amount: number;
  simplifications: string[];
};

export type DistributionListItem = {
  id: string;
  distribution_no: number;
  distribution_date: string;
  distributable_amount: number;
  is_final: boolean;
  status: DistributionStatus;
  memo: string | null;
  carried_interest_amount: number;
  confirmed_at: Date | null;
  paid_at: Date | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
};

const DIST_STATUSES: FundStatus[] = ["operating", "dissolved"]; // BR-DIST-01
const OPEN_STATUSES: DistributionStatus[] = ["draft", "confirmed"]; // BR-DIST-08 진행 중
const SIMPLIFICATIONS = ["기준수익은 납입 건별 단리 (납입액 × 기준수익률 × 경과일 ÷ 365)", "GP 캐치업 없음", "클로백(성과보수 반환) 없음", "원천징수 등 세금은 반영하지 않음"];
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));

const fail = (status: number, code: string, message: string, rule: string, field?: string, details: Record<string, unknown> = {}) =>
  new AppError(status, code, message, rule, { ...details, ...(field ? { fields: { [field]: message } } : {}) });

// 금액을 가중치대로 나눈다. 원 미만 버림, 나머지는 첫 번째(약정액이 가장 큰) 조합원에게
function split(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + BigInt(Math.max(0, Math.round(w))), BigInt(0));
  if (total <= 0 || sum === BigInt(0)) return weights.map(() => 0);
  const T = BigInt(total);
  const out = weights.map((w) => Number((T * BigInt(Math.max(0, Math.round(w)))) / sum));
  const left = total - out.reduce((s, v) => s + v, 0);
  const first = weights.findIndex((w) => w > 0);
  out[first] += left;
  return out;
}

// ─── 워터폴 계산 ───────────────────────────────────────────────────────────

async function computeWaterfall(tx: typeof sql, fundId: string, status: FundStatus, input: DistributionInput, exceptId?: string): Promise<Waterfall> {
  // BR-DIST-01: 운용·해산 중. 최종 분배는 해산 후에만
  if (!DIST_STATUSES.includes(status)) throw statusNotAllowed("BR-DIST-01", "분배는 운용·해산 중인 조합에서 합니다");
  if (input.is_final && status !== "dissolved") throw statusNotAllowed("BR-DIST-01", "최종 분배는 해산한 뒤에 할 수 있습니다");

  const [fund] = await tx<{ formation_date: string; cash_amount: number }[]>`
    select f.formation_date, s.cash_amount from funds f join v_fund_summary s on s.fund_id = f.id where f.id = ${fundId}
  `;
  if (input.distribution_date < fund.formation_date) {
    throw fail(422, "INVALID_DATE", `분배일은 결성일(${formatDate(fund.formation_date)}) 이후여야 합니다`, "BR-DIST-01", "distribution_date");
  }

  // BR-DIST-02 + BR-FIN-02: 분배일 기준 사용 가능 현금 이하. BR-DIST-03: 최종 분배는 현금 잔액 전부
  const available = await availableCashOn(tx, fundId, input.distribution_date);
  if (input.is_final && input.distributable_amount !== fund.cash_amount) {
    throw fail(422, "FINAL_DISTRIBUTION_MISMATCH", `최종 분배 금액은 현금 잔액(${formatKRWFull(fund.cash_amount)})과 같아야 합니다`, "BR-DIST-03", "distributable_amount", {
      cash_amount: fund.cash_amount,
    });
  }
  if (input.distributable_amount > available) {
    throw fail(422, "INSUFFICIENT_CASH", `${formatDate(input.distribution_date)} 기준으로 분배할 수 있는 현금은 ${formatKRWFull(Math.max(0, available))}입니다`, "BR-DIST-02", "distributable_amount", {
      available_amount: available,
    });
  }

  const terms = await termsEffectiveAt(fundId, input.distribution_date);
  const members = await tx<{ member_id: string; member_name: string; member_type: "gp" | "lp"; lp_id: string | null; commitment_amount: number }[]>`
    select b.member_id, coalesce(lp.name, 'GP') as member_name, b.member_type, b.lp_id, b.commitment_amount
    from v_member_balances b
    join fund_members m on m.id = b.member_id
    left join limited_partners lp on lp.id = b.lp_id
    where b.fund_id = ${fundId} and b.commitment_amount > 0
    order by b.commitment_amount desc, m.joined_date, m.created_at, b.member_type = 'lp', m.id
  `;
  // 분배일까지의 납입 (취소 행은 음수로 함께 들어와 상쇄된다)
  const contributions = await tx<{ member_id: string; entry_date: string; amount: number }[]>`
    select member_id, entry_date, amount from ledger_entries
    where fund_id = ${fundId} and entry_type = 'contribution' and entry_date <= ${input.distribution_date}
  `;
  const paidIn = new Map<string, number>();
  const hurdle = new Map<string, number>();
  for (const c of contributions) {
    paidIn.set(c.member_id, (paidIn.get(c.member_id) ?? 0) + c.amount);
    hurdle.set(c.member_id, (hurdle.get(c.member_id) ?? 0) + (c.amount * terms.hurdle_rate * daysBetween(c.entry_date, input.distribution_date)) / 365);
  }
  for (const [k, v] of hurdle) hurdle.set(k, Math.max(0, Math.floor(v)));
  const P = members.reduce((s, m) => s + (paidIn.get(m.member_id) ?? 0), 0);
  const H = members.reduce((s, m) => s + (hurdle.get(m.member_id) ?? 0), 0);

  // 이전 분배(확정·지급)에서 단계별로 이미 나간 몫
  const prevRows = await tx<{ component: DistributionComponent; amount: number }[]>`
    select i.component, sum(i.amount)::bigint as amount
    from distribution_items i join distributions d on d.id = i.distribution_id
    where d.fund_id = ${fundId} and d.status in ('confirmed', 'paid') and d.id <> ${exceptId ?? "00000000-0000-0000-0000-000000000000"}
    group by i.component
  `;
  const prev = Object.fromEntries(DISTRIBUTION_COMPONENTS.map((c) => [c, prevRows.find((r) => r.component === c)?.amount ?? 0])) as Record<DistributionComponent, number>;
  const prevTotal = DISTRIBUTION_COMPONENTS.reduce((s, c) => s + prev[c], 0);
  const A = input.distributable_amount;
  const T = prevTotal + A;

  // 앞 단계부터 채운다. 이전 분배가 이미 앞 단계 몫을 넘었으면 그 단계는 이번에 0 (BR-DIST-07)
  const rocTarget = Math.min(T, P);
  const rocThis = Math.min(A, Math.max(0, rocTarget - prev.return_of_capital));
  let rem = A - rocThis;
  const hurdleTarget = Math.min(Math.max(0, T - rocTarget), H);
  const hurdleThis = Math.min(rem, Math.max(0, hurdleTarget - prev.hurdle_return));
  rem -= hurdleThis;
  const gp = members.find((m) => m.member_type === "gp");
  const carryThis = gp ? Math.floor(rem * terms.carry_rate) : 0;
  const profitThis = rem - carryThis;

  const roc = split(rocThis, members.map((m) => paidIn.get(m.member_id) ?? 0));
  const hur = split(hurdleThis, members.map((m) => hurdle.get(m.member_id) ?? 0));
  const pro = split(profitThis, members.map((m) => m.commitment_amount));
  const result: WaterfallMember[] = members.map((m, i) => {
    const components: Partial<Record<DistributionComponent, number>> = {};
    if (roc[i]) components.return_of_capital = roc[i];
    if (hur[i]) components.hurdle_return = hur[i];
    if (pro[i]) components.profit = pro[i];
    if (gp && m.member_id === gp.member_id && carryThis) components.carried_interest = carryThis;
    return {
      member_id: m.member_id,
      member_name: m.member_name,
      member_type: m.member_type,
      lp_id: m.lp_id,
      commitment_amount: m.commitment_amount,
      paid_in_amount: paidIn.get(m.member_id) ?? 0,
      components,
      total_amount: Object.values(components).reduce((s, v) => s + (v ?? 0), 0),
    };
  });

  return {
    distribution_date: input.distribution_date,
    distributable_amount: A,
    is_final: input.is_final,
    rates: { hurdle_rate: terms.hurdle_rate, carry_rate: terms.carry_rate, terms_version: terms.version },
    cumulative: { paid_in_amount: P, hurdle_amount: H, previously_distributed_amount: prevTotal, total_after_this_amount: T },
    tiers: [
      { component: "return_of_capital", cap_amount: P, previously_amount: prev.return_of_capital, this_amount: rocThis },
      { component: "hurdle_return", cap_amount: H, previously_amount: prev.hurdle_return, this_amount: hurdleThis },
      { component: "profit", cap_amount: null, previously_amount: prev.profit, this_amount: profitThis },
      { component: "carried_interest", cap_amount: null, previously_amount: prev.carried_interest, this_amount: carryThis },
    ],
    members: result,
    available_cash_amount: available,
    simplifications: SIMPLIFICATIONS,
  };
}

async function lockFund(tx: typeof sql, fundId: string) {
  assertUuid(fundId, "조합을");
  const [fund] = await tx<{ status: FundStatus; name: string }[]>`select status, name from funds where id = ${fundId} for update`; // BR-COM-02
  if (!fund) throw notFound("조합을");
  return fund;
}

export async function previewDistribution(fundId: string, input: DistributionInput) {
  assertUuid(fundId, "조합을");
  const [fund] = await sql<{ status: FundStatus }[]>`select status from funds where id = ${fundId}`;
  if (!fund) throw notFound("조합을");
  return computeWaterfall(sql, fundId, fund.status, input);
}

// ─── 조회 ──────────────────────────────────────────────────────────────────

export async function listDistributions(fundId: string) {
  assertUuid(fundId, "조합을");
  const [fund] = await sql<{ status: FundStatus; cash_amount: number }[]>`
    select f.status, s.cash_amount from funds f join v_fund_summary s on s.fund_id = f.id where f.id = ${fundId}
  `;
  if (!fund) throw notFound("조합을");
  const items = await sql<DistributionListItem[]>`
    select d.id, d.distribution_no, d.distribution_date, d.distributable_amount, d.is_final, d.status, d.memo, d.confirmed_at, d.paid_at, d.cancelled_at, d.cancel_reason,
           coalesce((select sum(amount) from distribution_items i where i.distribution_id = d.id and i.component = 'carried_interest'), 0)::bigint as carried_interest_amount
    from distributions d where d.fund_id = ${fundId}
    order by d.distribution_no desc
  `;
  const paid = items.filter((d) => d.status === "paid");
  return {
    fund_status: fund.status,
    cash_amount: fund.cash_amount,
    can_create: DIST_STATUSES.includes(fund.status) && !items.some((d) => OPEN_STATUSES.includes(d.status)),
    open_distribution_id: items.find((d) => OPEN_STATUSES.includes(d.status))?.id ?? null,
    can_final: fund.status === "dissolved" && !items.some((d) => d.is_final && d.status !== "cancelled"),
    totals: {
      paid_amount: paid.reduce((s, d) => s + d.distributable_amount, 0),
      carried_interest_amount: paid.reduce((s, d) => s + d.carried_interest_amount, 0),
    },
    items,
  };
}

export type DistributionDetail = DistributionListItem & {
  fund_status: FundStatus;
  members: WaterfallMember[];
  tiers: { component: DistributionComponent; amount: number }[];
};

async function loadItems(tx: typeof sql, distributionId: string) {
  return tx<{ id: string; member_id: string; member_name: string; member_type: "gp" | "lp"; lp_id: string | null; commitment_amount: number; component: DistributionComponent; amount: number }[]>`
    select i.id, i.member_id, coalesce(lp.name, 'GP') as member_name, m.member_type, m.lp_id,
           coalesce((select sum(amount) from ledger_entries e where e.member_id = m.id and e.entry_type = 'commitment'), 0)::bigint as commitment_amount,
           i.component, i.amount
    from distribution_items i
    join fund_members m on m.id = i.member_id
    left join limited_partners lp on lp.id = m.lp_id
    where i.distribution_id = ${distributionId}
    order by commitment_amount desc, m.member_type = 'lp', m.id
  `;
}

function groupItems(rows: Awaited<ReturnType<typeof loadItems>>) {
  const byMember = new Map<string, WaterfallMember>();
  for (const r of rows) {
    const m = byMember.get(r.member_id) ?? {
      member_id: r.member_id,
      member_name: r.member_name,
      member_type: r.member_type,
      lp_id: r.lp_id,
      commitment_amount: r.commitment_amount,
      paid_in_amount: 0,
      components: {},
      total_amount: 0,
    };
    m.components[r.component] = r.amount;
    m.total_amount += r.amount;
    byMember.set(r.member_id, m);
  }
  return [...byMember.values()];
}

export async function getDistribution(fundId: string, distributionId: string): Promise<DistributionDetail> {
  assertUuid(fundId, "조합을");
  assertUuid(distributionId, "분배를");
  const [d] = await sql<(DistributionListItem & { fund_status: FundStatus })[]>`
    select d.id, d.distribution_no, d.distribution_date, d.distributable_amount, d.is_final, d.status, d.memo, d.confirmed_at, d.paid_at, d.cancelled_at, d.cancel_reason, f.status as fund_status,
           coalesce((select sum(amount) from distribution_items i where i.distribution_id = d.id and i.component = 'carried_interest'), 0)::bigint as carried_interest_amount
    from distributions d join funds f on f.id = d.fund_id
    where d.id = ${distributionId} and d.fund_id = ${fundId}
  `;
  if (!d) throw notFound("분배를");
  const members = groupItems(await loadItems(sql, distributionId));
  const tiers = DISTRIBUTION_COMPONENTS.map((c) => ({ component: c, amount: members.reduce((s, m) => s + (m.components[c] ?? 0), 0) }));
  return { ...d, members, tiers };
}

// ─── 초안 · 확정 · 지급 ────────────────────────────────────────────────────

async function saveItems(tx: typeof sql, distributionId: string, w: Waterfall) {
  for (const m of w.members) {
    for (const c of DISTRIBUTION_COMPONENTS) {
      const amount = m.components[c] ?? 0;
      if (amount > 0) await tx`insert into distribution_items (distribution_id, member_id, component, amount) values (${distributionId}, ${m.member_id}, ${c}, ${amount})`;
    }
  }
}

// BR-DIST-04: 초안에 워터폴 계산 결과를 조합원 × 단계별로 저장한다
export async function createDistribution(fundId: string, input: DistributionInput, userId: string) {
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const fund = await lockFund(t, fundId);
    // BR-DIST-08: 진행 중(초안·확정)인 분배는 하나만. 누적 계산이 앞 분배의 결과를 기준으로 하기 때문
    const [open] = await tx`select 1 from distributions where fund_id = ${fundId} and status in ('draft', 'confirmed')`;
    if (open) throw fail(409, "DISTRIBUTION_IN_PROGRESS", "진행 중인 분배가 있습니다. 먼저 지급을 마치거나 초안을 삭제하세요", "BR-DIST-08");
    if (input.is_final) {
      const [final] = await tx`select 1 from distributions where fund_id = ${fundId} and is_final and status <> 'cancelled'`;
      if (final) throw fail(409, "FINAL_DISTRIBUTION_EXISTS", "최종 분배는 한 번만 할 수 있습니다", "BR-DIST-03");
    }
    const w = await computeWaterfall(t, fundId, fund.status, input);
    const [{ next }] = await tx<{ next: number }[]>`select coalesce(max(distribution_no), 0) + 1 as next from distributions where fund_id = ${fundId}`;
    const [created] = await tx<{ id: string }[]>`
      insert into distributions (fund_id, distribution_no, distribution_date, distributable_amount, is_final, memo, created_by)
      values (${fundId}, ${next}, ${input.distribution_date}, ${input.distributable_amount}, ${input.is_final}, ${input.memo}, ${userId})
      returning id
    `;
    await saveItems(t, created.id, w);
    return { id: created.id, distribution_no: next };
  });
}

async function lockDistribution(tx: typeof sql, fundId: string, distributionId: string) {
  assertUuid(distributionId, "분배를");
  const [d] = await tx<{ id: string; distribution_no: number; distribution_date: string; distributable_amount: number; is_final: boolean; status: DistributionStatus; memo: string | null }[]>`
    select id, distribution_no, distribution_date, distributable_amount, is_final, status, memo from distributions
    where id = ${distributionId} and fund_id = ${fundId} for update
  `;
  if (!d) throw notFound("분배를");
  return d;
}

export async function deleteDistribution(fundId: string, distributionId: string) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    await lockFund(t, fundId);
    const d = await lockDistribution(t, fundId, distributionId);
    if (d.status !== "draft") throw fail(409, "DOCUMENT_LOCKED", "확정한 분배는 삭제할 수 없습니다", "BR-COM-03");
    await tx`delete from distribution_items where distribution_id = ${distributionId}`;
    await tx`delete from distributions where id = ${distributionId}`;
  });
}

// BR-DIST-05: 확정하면 잠기고, LP 조합원에게 각자 분배액이 담긴 통지가 간다.
// 초안 이후 납입·다른 분배로 숫자가 바뀌었으면 확정하지 않는다 (초안을 지우고 다시 계산)
export async function confirmDistribution(fundId: string, distributionId: string, userId: string) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const fund = await lockFund(t, fundId);
    const d = await lockDistribution(t, fundId, distributionId);
    if (d.status !== "draft") throw fail(409, "DOCUMENT_LOCKED", "이미 확정한 분배입니다", "BR-COM-03");

    const w = await computeWaterfall(t, fundId, fund.status, { distribution_date: d.distribution_date, distributable_amount: d.distributable_amount, is_final: d.is_final, memo: d.memo }, d.id);
    const saved = groupItems(await loadItems(t, d.id));
    const key = (ms: WaterfallMember[]) =>
      JSON.stringify(ms.flatMap((m) => DISTRIBUTION_COMPONENTS.map((c) => [m.member_id, c, m.components[c] ?? 0])).filter(([, , a]) => a).sort());
    if (key(saved) !== key(w.members)) {
      throw fail(409, "DISTRIBUTION_STALE", "초안을 만든 뒤 납입·분배 기록이 바뀌어 계산 결과가 달라졌습니다. 초안을 삭제하고 다시 만드세요", "BR-DIST-04");
    }

    await tx`update distributions set status = 'confirmed', confirmed_at = now() where id = ${d.id}`;

    const title = `${fund.name} ${d.is_final ? "최종 분배" : `제${d.distribution_no}차 분배`} 안내`;
    for (const m of saved) {
      if (!m.lp_id || m.total_amount === 0) continue;
      const body = [
        `${m.member_name} 귀중`,
        "",
        `${fund.name}의 ${d.is_final ? "최종 분배" : `제${d.distribution_no}차 분배`}를 아래와 같이 안내드립니다.`,
        "",
        `· 분배 금액: ${formatKRWFull(m.total_amount)}`,
        ...DISTRIBUTION_COMPONENTS.filter((c) => m.components[c]).map((c) => `   - ${DISTRIBUTION_COMPONENT_LABEL[c]}: ${formatKRWFull(m.components[c]!)}`),
        `· 지급 예정일: ${formatDate(d.distribution_date)}`,
        `· 적용 조건: 기준수익률 연 ${formatPercent(w.rates.hurdle_rate)}, 성과보수율 ${formatPercent(w.rates.carry_rate)} (규약 버전 ${w.rates.terms_version})`,
      ].join("\n");
      const [notice] = await tx<{ id: string; sent_at: Date }[]>`
        insert into notices (fund_id, notice_type, title, body, source_type, source_id, status, sent_at, created_by)
        values (${fundId}, 'distribution', ${title}, ${body}, 'distribution', ${d.id}, 'sent', now(), ${userId})
        returning id, sent_at
      `;
      await tx`insert into notice_recipients (notice_id, lp_id) values (${notice.id}, ${m.lp_id})`;
      await recordEvent(t, {
        event_type: "notice.sent",
        aggregate_type: "notice",
        aggregate_id: notice.id,
        lp_id: m.lp_id,
        fund_id: fundId,
        data: {
          notice_id: notice.id,
          notice_type: "distribution",
          title,
          sent_at: notice.sent_at,
          distribution: { distribution_no: d.distribution_no, is_final: d.is_final, distribution_date: d.distribution_date, amount: m.total_amount, components: m.components },
        },
      });
    }
  });
}

// BR-DIST-06: 지급하면 조합원별 합계를 분배 원장 행으로 남기고(성과보수는 GP 조합원 원장), 분배 1건을 한 번에 분개한다
export async function payDistribution(fundId: string, distributionId: string, userId: string) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    await lockFund(t, fundId);
    const d = await lockDistribution(t, fundId, distributionId);
    if (d.status !== "confirmed") throw fail(409, "INVALID_STATE", d.status === "draft" ? "먼저 분배를 확정하세요" : "이미 지급한 분배입니다", "BR-DIST-06");
    if (d.distribution_date > today()) throw fail(422, "INVALID_DATE", `분배일(${formatDate(d.distribution_date)})이 되면 지급할 수 있습니다`, "BR-DIST-06");
    await assertCashAvailable(t, fundId, d.distribution_date, d.distributable_amount, "BR-DIST-02");

    const rows = await loadItems(t, d.id);
    for (const m of groupItems(rows)) {
      if (m.total_amount === 0) continue;
      await addLedgerEntry(
        t,
        {
          fund_id: fundId,
          member_id: m.member_id,
          lp_id: m.lp_id,
          entry_type: "distribution",
          amount: m.total_amount,
          entry_date: d.distribution_date,
          source_type: "distribution_item",
          source_id: rows.find((r) => r.member_id === m.member_id)!.id, // 그 조합원의 첫 분배 항목 (→ 분배 문서)
          memo: `${d.is_final ? "최종 분배" : `제${d.distribution_no}차 분배`}`,
          created_by: userId,
        },
        { journal: false },
      );
    }
    const roc = rows.filter((r) => r.component === "return_of_capital").reduce((s, r) => s + r.amount, 0);
    await journalForDistributionPayment(t, {
      fund_id: fundId,
      distribution_id: d.id,
      distribution_no: d.distribution_no,
      date: d.distribution_date,
      return_of_capital: roc,
      profit: d.distributable_amount - roc,
      created_by: userId,
    });
    await tx`update distributions set status = 'paid', paid_at = now() where id = ${d.id}`;
  });
}

// BR-DIST-12 분배 취소: 확정·지급한 분배를 취소 상태로 남긴다 (초안은 삭제).
// · 누적 워터폴은 앞 분배 결과를 기준으로 계산하므로 마지막 분배부터 거꾸로 취소한다
// · 지급했던 분배면 조합원 원장에 취소 행(음수)을 남기고 분배 분개를 역분개한다. 돈이 돌아오는 날이라 둘 다 오늘 날짜
// · LP 조합원에게 취소 통지를 보낸다
export async function cancelDistribution(fundId: string, distributionId: string, reason: string, userId: string) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const fund = await lockFund(t, fundId);
    if (!DIST_STATUSES.includes(fund.status)) throw statusNotAllowed("BR-DIST-12", "분배 취소는 운용·해산 중인 조합에서 합니다");
    const d = await lockDistribution(t, fundId, distributionId);
    if (d.status === "draft") throw fail(409, "INVALID_STATE", "초안은 취소하지 않고 삭제합니다", "BR-DIST-12");
    if (d.status === "cancelled") throw fail(409, "ALREADY_REVERSED", "이미 취소한 분배입니다", "BR-DIST-12");
    const [later] = await tx<{ distribution_no: number }[]>`
      select distribution_no from distributions
      where fund_id = ${fundId} and distribution_no > ${d.distribution_no} and status in ('confirmed', 'paid')
      order by distribution_no desc limit 1
    `;
    if (later) throw fail(409, "LATER_DISTRIBUTION_EXISTS", `제${later.distribution_no}차 분배를 먼저 취소하세요. 마지막 분배부터 거꾸로 취소합니다`, "BR-DIST-12");

    const label = d.is_final ? "최종 분배" : `제${d.distribution_no}차 분배`;
    const wasPaid = d.status === "paid";
    const date = today();
    if (wasPaid) {
      const entries = await tx<{ id: string; member_id: string; lp_id: string | null; amount: number; source_id: string }[]>`
        select e.id, e.member_id, m.lp_id, e.amount, e.source_id
        from ledger_entries e join fund_members m on m.id = e.member_id
        where e.fund_id = ${fundId} and e.entry_type = 'distribution' and e.source_type = 'distribution_item' and e.reversal_of_id is null
          and e.source_id in (select id from distribution_items where distribution_id = ${d.id})
          and not exists (select 1 from ledger_entries r where r.reversal_of_id = e.id)
      `;
      for (const e of entries) {
        await addLedgerEntry(
          t,
          {
            fund_id: fundId,
            member_id: e.member_id,
            lp_id: e.lp_id,
            entry_type: "distribution",
            amount: -e.amount,
            entry_date: date,
            source_type: "distribution_item",
            source_id: e.source_id,
            reversal_of_id: e.id,
            memo: `${label} 취소: ${reason}`,
            created_by: userId,
          },
          { journal: false },
        );
      }
      await reverseSourceJournal(t, "distribution", d.id, date, `${label} 취소: ${reason}`, userId);
    }
    await tx`update distributions set status = 'cancelled', cancelled_at = now(), cancelled_by = ${userId}, cancel_reason = ${reason} where id = ${d.id}`;

    const title = `${fund.name} ${label} 취소 안내`;
    for (const m of groupItems(await loadItems(t, d.id))) {
      if (!m.lp_id || m.total_amount === 0) continue;
      const body = [
        `${m.member_name} 귀중`,
        "",
        `${fund.name}의 ${label}(분배일 ${formatDate(d.distribution_date)})를 취소합니다.`,
        "",
        `· 취소 사유: ${reason}`,
        wasPaid
          ? `· 지급한 분배금 ${formatKRWFull(m.total_amount)}의 반환 절차는 별도로 안내드립니다.`
          : `· 지급 예정이던 분배금 ${formatKRWFull(m.total_amount)}은 지급하지 않습니다.`,
      ].join("\n");
      const [notice] = await tx<{ id: string; sent_at: Date }[]>`
        insert into notices (fund_id, notice_type, title, body, source_type, source_id, status, sent_at, created_by)
        values (${fundId}, 'distribution', ${title}, ${body}, 'distribution', ${d.id}, 'sent', now(), ${userId})
        returning id, sent_at
      `;
      await tx`insert into notice_recipients (notice_id, lp_id) values (${notice.id}, ${m.lp_id})`;
      await recordEvent(t, {
        event_type: "notice.sent",
        aggregate_type: "notice",
        aggregate_id: notice.id,
        lp_id: m.lp_id,
        fund_id: fundId,
        data: {
          notice_id: notice.id,
          notice_type: "distribution",
          title,
          sent_at: notice.sent_at,
          distribution: { distribution_no: d.distribution_no, is_final: d.is_final, distribution_date: d.distribution_date, amount: m.total_amount, cancelled: true, was_paid: wasPaid },
        },
      });
    }
  });
}

// ─── 성과보수 현황 (재무·회계 > 성과보수) ──────────────────────────────────
// 성과보수는 분배 워터폴 안에서만 계산·지급된다. 이 화면은 조건·발생 기준선·지급 내역·예상액을 모아 보여준다

export type CarrySummary = {
  fund_status: FundStatus;
  as_of: string;
  terms: { carry_rate: number; hurdle_rate: number; version: number; effective_date: string };
  paid_in_amount: number; // 누적 납입액 (1단계 원금 반환 한도)
  hurdle_amount: number; // 오늘까지 기준수익 (2단계 한도, 단리)
  threshold_amount: number; // 성과보수 발생 기준선 = 납입액 + 기준수익
  distributed_amount: number; // 확정·지급한 분배 누계
  remaining_to_carry_amount: number; // 기준선까지 남은 분배액 (0이면 이미 초과수익 단계)
  carried_paid_amount: number; // 지급한 성과보수
  carried_confirmed_amount: number; // 확정했지만 아직 지급 전
  estimate: { cash_amount: number; fair_value_amount: number; total_value_amount: number; excess_amount: number; carried_interest_amount: number };
  history: { distribution_id: string; distribution_no: number; is_final: boolean; distribution_date: string; status: DistributionStatus; distributable_amount: number; profit_amount: number; carried_interest_amount: number }[];
};

export async function getCarrySummary(fundId: string): Promise<CarrySummary> {
  assertUuid(fundId, "조합을");
  const [fund] = await sql<{ status: FundStatus; cash_amount: number }[]>`
    select f.status, s.cash_amount from funds f join v_fund_summary s on s.fund_id = f.id where f.id = ${fundId}
  `;
  if (!fund) throw notFound("조합을");
  const asOf = today();
  const terms = await termsEffectiveAt(fundId, asOf);

  const contributions = await sql<{ entry_date: string; amount: number }[]>`
    select entry_date, amount from ledger_entries where fund_id = ${fundId} and entry_type = 'contribution' and entry_date <= ${asOf}
  `;
  const paidIn = contributions.reduce((s, c) => s + c.amount, 0);
  const hurdle = Math.max(0, Math.floor(contributions.reduce((s, c) => s + (c.amount * terms.hurdle_rate * daysBetween(c.entry_date, asOf)) / 365, 0)));

  const history = await sql<CarrySummary["history"]>`
    select d.id as distribution_id, d.distribution_no, d.is_final, d.distribution_date, d.status, d.distributable_amount,
           coalesce(sum(i.amount) filter (where i.component = 'profit'), 0)::bigint as profit_amount,
           coalesce(sum(i.amount) filter (where i.component = 'carried_interest'), 0)::bigint as carried_interest_amount
    from distributions d left join distribution_items i on i.distribution_id = d.id
    where d.fund_id = ${fundId} and d.status in ('confirmed', 'paid')
    group by d.id order by d.distribution_no desc
  `;
  const distributed = history.reduce((s, h) => s + h.distributable_amount, 0);
  const [pf] = await sql<{ fair_value: number }[]>`select coalesce(sum(current_value_amount), 0)::bigint as fair_value from v_portfolio where fund_id = ${fundId}`;

  // 예상: 지금 남은 현금과 보유 기업(공정가치)을 전부 분배한다고 가정 ⚠️ 앞으로의 보수·비용, 기준수익 증가는 반영하지 않음
  const threshold = paidIn + hurdle;
  const totalValue = distributed + fund.cash_amount + pf.fair_value;
  const excess = Math.max(0, totalValue - threshold);
  return {
    fund_status: fund.status,
    as_of: asOf,
    terms: { carry_rate: terms.carry_rate, hurdle_rate: terms.hurdle_rate, version: terms.version, effective_date: terms.effective_date },
    paid_in_amount: paidIn,
    hurdle_amount: hurdle,
    threshold_amount: threshold,
    distributed_amount: distributed,
    remaining_to_carry_amount: Math.max(0, threshold - distributed),
    carried_paid_amount: history.filter((h) => h.status === "paid").reduce((s, h) => s + h.carried_interest_amount, 0),
    carried_confirmed_amount: history.filter((h) => h.status === "confirmed").reduce((s, h) => s + h.carried_interest_amount, 0),
    estimate: { cash_amount: fund.cash_amount, fair_value_amount: pf.fair_value, total_value_amount: totalValue, excess_amount: excess, carried_interest_amount: Math.floor(excess * terms.carry_rate) },
    history,
  };
}
