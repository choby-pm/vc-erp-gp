import { sql } from "@/lib/db";
import { formatDate, formatKRW } from "@/lib/format";
import { FUND_STATUSES, type FundStatus } from "@/lib/labels";
import { getInvestmentSummary } from "@/lib/services/investments";
import { SUPPORTED_NEXT, checkTransition } from "@/lib/services/fund-transitions";

// 전체 대시보드 (05 API 설계 3-13 GET /dashboard, 성공 기준 6)
// · 숫자는 조합 화면과 같은 원본(v_fund_summary, v_portfolio)에서 계산한다 → 조합 화면과 늘 일치
// · 경고는 각 업무 화면의 규칙을 한곳에 모은다 (의무투자, 캐피탈콜 미납, 만기 경과, 총회·보고·분배 할 일, 연동 실패)

export type DashboardFund = {
  fund_id: string;
  name: string;
  status: FundStatus;
  formation_date: string | null;
  maturity_date: string | null;
  target_amount: number;
  commitment_amount: number;
  paid_amount: number;
  invested_amount: number;
  proceeds_amount: number;
  distributed_amount: number;
  cash_amount: number;
  fair_value_amount: number;
  nav_amount: number; // 현금 + 보유 기업 공정가치 (부채 없음 가정)
  tvpi: number | null; // (분배 + NAV) ÷ 납입
};

export type DashboardAlert = { level: "danger" | "warning" | "info"; fund_id: string | null; fund_name: string | null; category: string; message: string; href: string };
export type DashboardEvent = { date: string; kind: string; fund_id: string; fund_name: string; title: string; href: string };

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function getDashboard() {
  const asOf = today();
  const funds = await sql<DashboardFund[]>`
    select s.fund_id, s.name, s.status, s.formation_date, s.maturity_date, s.target_amount,
           s.total_commitment_amount as commitment_amount, s.total_paid_amount as paid_amount, s.total_invested_amount as invested_amount,
           s.total_proceeds_amount as proceeds_amount, s.total_distributed_amount as distributed_amount, s.cash_amount,
           s.total_current_value_amount as fair_value_amount,
           (s.cash_amount + s.total_current_value_amount)::bigint as nav_amount,
           case when s.total_paid_amount > 0
                then round((s.total_distributed_amount + s.cash_amount + s.total_current_value_amount)::numeric / s.total_paid_amount, 4)::float8 end as tvpi
    from v_fund_summary s join funds f on f.id = s.fund_id
    order by array_position(${FUND_STATUSES as unknown as string[]}::text[], s.status::text), f.formation_date desc nulls last, s.name
  `;
  const active = funds.filter((f) => ["formed", "operating", "dissolved"].includes(f.status));
  const sum = (key: keyof DashboardFund, list = active) => list.reduce((s, f) => s + (Number(f[key]) || 0), 0);
  const totals = {
    fund_count: funds.length,
    active_count: active.length,
    commitment_amount: sum("commitment_amount"),
    paid_amount: sum("paid_amount"),
    invested_amount: sum("invested_amount"),
    proceeds_amount: sum("proceeds_amount"),
    distributed_amount: sum("distributed_amount"),
    cash_amount: sum("cash_amount"),
    nav_amount: sum("nav_amount"),
    raising_target_amount: sum("target_amount", funds.filter((f) => f.status === "fundraising")),
    raising_committed_amount: 0,
  };
  const [raising] = await sql<{ amount: number }[]>`
    select coalesce(sum(p.loc_amount), 0)::bigint as amount from lp_proposals p join funds f on f.id = p.fund_id
    where f.status = 'fundraising' and p.status = 'committed'
  `;
  totals.raising_committed_amount = raising.amount;
  const byStatus = Object.fromEntries(FUND_STATUSES.map((s) => [s, funds.filter((f) => f.status === s).length])) as Record<FundStatus, number>;

  // ─── 경고·할 일 ───
  const alerts: DashboardAlert[] = [];
  const name = new Map(funds.map((f) => [f.fund_id, f.name]));
  const push = (a: Omit<DashboardAlert, "fund_name">) => alerts.push({ ...a, fund_name: a.fund_id ? (name.get(a.fund_id) ?? null) : null });

  for (const f of funds.filter((x) => x.status === "operating")) {
    const inv = await getInvestmentSummary(f.fund_id);
    for (const w of inv.warnings) push({ level: w.level === "shortfall" ? "danger" : "warning", fund_id: f.fund_id, category: "의무투자", message: w.message, href: `/funds/${f.fund_id}/investments` });
    // BR-FUND-07: 만기 경과
    if (f.maturity_date && f.maturity_date <= asOf) push({ level: "danger", fund_id: f.fund_id, category: "존속 기간", message: `만기일(${formatDate(f.maturity_date)})이 지났습니다. 기간 연장 또는 해산 절차가 필요합니다`, href: `/funds/${f.fund_id}` });
    else if (f.maturity_date && f.maturity_date <= addDays(asOf, 180)) push({ level: "info", fund_id: f.fund_id, category: "존속 기간", message: `만기일 ${formatDate(f.maturity_date)}까지 6개월이 남지 않았습니다`, href: `/funds/${f.fund_id}` });
  }

  const unpaid = await sql<{ fund_id: string; overdue: number; open: number; amount: number }[]>`
    select s.fund_id, count(*) filter (where s.payment_status = 'overdue')::int as overdue, count(*)::int as open,
           sum(s.call_amount - s.paid_amount)::bigint as amount
    from v_capital_call_item_status s join capital_calls c on c.id = s.capital_call_id
    where c.status = 'issued' and s.payment_status in ('pending', 'partial', 'overdue')
    group by s.fund_id
  `;
  for (const u of unpaid) {
    push({
      level: u.overdue ? "danger" : "warning",
      fund_id: u.fund_id,
      category: "캐피탈콜",
      message: `미납 ${u.open}건 · ${formatKRW(u.amount)}${u.overdue ? ` (기한 초과 ${u.overdue}건)` : ""}`,
      href: `/funds/${u.fund_id}/capital-calls`,
    });
  }

  const pendingDist = await sql<{ id: string; fund_id: string; distribution_no: number; is_final: boolean; distribution_date: string; distributable_amount: number }[]>`
    select id, fund_id, distribution_no, is_final, distribution_date, distributable_amount from distributions where status = 'confirmed'
  `;
  for (const d of pendingDist) {
    push({ level: "warning", fund_id: d.fund_id, category: "분배", message: `${d.is_final ? "최종 분배" : `제${d.distribution_no}차 분배`} ${formatKRW(d.distributable_amount)} 확정 · 지급 대기 (${formatDate(d.distribution_date)})`, href: `/funds/${d.fund_id}/distributions/${d.id}` });
  }
  const drafts = await sql<{ fund_id: string; n: number }[]>`select fund_id, count(*)::int as n from reports where status = 'draft' group by fund_id`;
  for (const r of drafts) push({ level: "info", fund_id: r.fund_id, category: "정기 보고", message: `작성 중인 보고 ${r.n}건`, href: `/funds/${r.fund_id}/reports` });

  // 다음 단계로 넘어갈 준비가 된 조합 (운용 → 해산은 해산 안건이 가결됐을 때만 조건이 채워진다)
  for (const f of funds) {
    const next = SUPPORTED_NEXT[f.status];
    if (!next) continue;
    const check = await checkTransition(f.fund_id, next);
    if (check.ready) push({ level: "info", fund_id: f.fund_id, category: "다음 단계", message: `다음 단계로 넘어갈 조건이 모두 준비되었습니다`, href: `/funds/${f.fund_id}` });
  }

  const [events] = await sql<{ failed: number; pending: number }[]>`
    select count(*) filter (where status = 'failed')::int as failed, count(*) filter (where status = 'pending')::int as pending from integration_events
  `;
  if (events.failed) push({ level: "danger", fund_id: null, category: "LP 연동", message: `전송이 멈춘 연동 이벤트 ${events.failed}건 (BR-EVT-03)`, href: "/integrations?status=failed" });

  const order = { danger: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);

  // ─── 다가오는 일정 (오늘부터 30일) ───
  const until = addDays(asOf, 30);
  const schedule = await sql<DashboardEvent[]>`
    select * from (
      select c.due_date as date, 'capital_call' as kind, c.fund_id, f.name as fund_name,
             case when c.is_initial then '최초 납입 기한' else '제' || c.call_no || '차 캐피탈콜 납입 기한' end as title,
             '/funds/' || c.fund_id || '/capital-calls/' || c.id as href
      from capital_calls c join funds f on f.id = c.fund_id where c.status = 'issued' and c.due_date between ${asOf} and ${until}
      union all
      select g.meeting_date, 'meeting', g.fund_id, f.name,
             case g.meeting_type when 'formation' then '결성총회' when 'dissolution' then '해산총회' when 'regular' then '정기총회' else '임시총회' end,
             '/funds/' || g.fund_id || '/meetings/' || g.id
      from general_meetings g join funds f on f.id = g.fund_id where g.status = 'scheduled' and g.meeting_date between ${asOf} and ${until}
      union all
      select d.distribution_date, 'distribution', d.fund_id, f.name, '제' || d.distribution_no || '차 분배 지급',
             '/funds/' || d.fund_id || '/distributions/' || d.id
      from distributions d join funds f on f.id = d.fund_id where d.status in ('draft', 'confirmed') and d.distribution_date between ${asOf} and ${until}
    ) x order by date, fund_name
  `;

  return { as_of: asOf, totals, by_status: byStatus, funds, alerts, schedule, events };
}
