import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import type { DistributionComponent, FundStatus, FundType, InstitutionType, LpType, ManagerRole, NoticeType } from "@/lib/labels";
import { termsEffectiveAt } from "@/lib/services/terms";

// LP 연동 API가 돌려주는 데이터 (05 API 설계 5장, 03 DB 설계 7장 LP 공개 등급)
// · 🟢 본인 것만: 이 LP의 조합원 행·원장·요청액·분배액·투표·통지
// · 🔵 조합 단위: 이 LP가 조합원인 조합만 (아니면 403 FORBIDDEN)
// · 🟡 요약만: 투자·평가·회수·기업은 발행된 정기 보고 스냅샷으로만
// · 🔴 비공개: 딜·투심위·다른 LP 정보·메모·created_by·내부 문서 ID는 어떤 응답에도 넣지 않는다
// GP 화면의 "LP 공개 데이터 미리보기"도 이 함수들을 그대로 쓴다 (LP 시스템이 보는 것과 같게)

const forbidden = () => new AppError(403, "FORBIDDEN", "이 출자자가 조합원인 조합이 아닙니다");

async function loadLp(lpId: string) {
  assertUuid(lpId, "출자자를");
  const [lp] = await sql<{ id: string; name: string; lp_type: LpType }[]>`select id, name, lp_type from limited_partners where id = ${lpId}`;
  if (!lp) throw notFound("출자자를");
  return lp;
}

// 🔵 이 LP가 조합원인 조합인지. 조합원 행(들)을 돌려준다
async function memberIds(lpId: string, fundId: string) {
  await loadLp(lpId);
  assertUuid(fundId, "조합을");
  const rows = await sql<{ id: string }[]>`select id from fund_members where lp_id = ${lpId} and fund_id = ${fundId}`;
  if (rows.length === 0) throw forbidden();
  return rows.map((r) => r.id);
}

export async function lpProfile(lpId: string) {
  return loadLp(lpId); // 🟢 이름·유형만 (연락처·메모는 GP 내부)
}

export type LpFundSummary = {
  fund_id: string;
  fund_name: string;
  fund_type: FundType;
  status: FundStatus;
  formation_date: string | null;
  my: { commitment_amount: number; contribution_amount: number; distribution_amount: number; unfunded_amount: number; ownership_ratio: number | null };
};

export async function lpFunds(lpId: string) {
  await loadLp(lpId);
  return sql<LpFundSummary[]>`
    select f.id as fund_id, f.name as fund_name, f.fund_type, f.status, f.formation_date,
           json_build_object(
             'commitment_amount', b.commitment_amount, 'contribution_amount', b.paid_amount, 'distribution_amount', b.distributed_amount,
             'unfunded_amount', b.unfunded_amount, 'ownership_ratio', b.ownership_ratio::float8
           ) as my
    from v_member_balances b join funds f on f.id = b.fund_id
    where b.lp_id = ${lpId}
    order by f.formation_date desc nulls last, f.name
  `;
}

export async function lpFund(lpId: string, fundId: string) {
  await memberIds(lpId, fundId);
  const [fund] = await sql<{ id: string; name: string; fund_type: FundType; status: FundStatus; formation_date: string | null; dissolution_date: string | null; liquidation_date: string | null; term_years: number; investment_period_years: number }[]>`
    select id, name, fund_type, status, formation_date, dissolution_date, liquidation_date, term_years, investment_period_years from funds where id = ${fundId}
  `;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const t = await termsEffectiveAt(fundId, today);
  const institutions = await sql<{ institution_type: InstitutionType; name: string }[]>`
    select institution_type, name from related_institutions where fund_id = ${fundId} order by institution_type
  `;
  // 운용 인력은 구성원 이름·직위·역할·기간만 (🔵)
  const managers = await sql<{ name: string; position: string | null; role: ManagerRole; start_date: string; end_date: string | null }[]>`
    select s.name, s.position, m.role, m.start_date, m.end_date
    from fund_managers m join staff s on s.id = m.staff_id
    where m.fund_id = ${fundId} and m.end_date is null
    order by m.role, s.name
  `;
  const [my] = (await lpFunds(lpId)).filter((f) => f.fund_id === fundId);
  return {
    fund,
    terms: {
      version: t.version,
      effective_date: t.effective_date,
      primary_purpose: t.primary_purpose,
      unit_amount: t.unit_amount,
      management_fee_rate: t.management_fee_rate,
      management_fee_rate_after: t.management_fee_rate_after,
      carry_rate: t.carry_rate,
      hurdle_rate: t.hurdle_rate,
      quorum_ratio: t.quorum_ratio,
    },
    institutions,
    managers,
    my: my.my,
  };
}

// 🟢 내 원장: 내부 문서 ID(source_id) 대신 LP가 알아볼 수 있는 정보로 바꾼다 (05 API 설계 5-3)
export async function lpLedger(lpId: string, fundId: string) {
  const members = await memberIds(lpId, fundId);
  const rows = await sql<{ id: string; entry_type: string; amount: number; entry_date: string; source: Record<string, unknown>; reversal_of_id: string | null }[]>`
    select e.id, e.entry_type, e.amount, e.entry_date, e.reversal_of_id,
           case e.source_type
             when 'capital_call_item' then json_build_object('type', 'capital_call', 'call_no', c.call_no, 'is_initial', c.is_initial)
             when 'distribution_item' then json_build_object('type', 'distribution', 'distribution_no', d.distribution_no, 'is_final', d.is_final)
             else json_build_object('type', e.source_type)
           end as source
    from ledger_entries e
    left join capital_call_items ci on e.source_type = 'capital_call_item' and ci.id = e.source_id
    left join capital_calls c on c.id = ci.capital_call_id
    left join distribution_items di on e.source_type = 'distribution_item' and di.id = e.source_id
    left join distributions d on d.id = di.distribution_id
    where e.member_id = any(${members}::uuid[])
    order by e.entry_date, e.created_at
  `;
  const sum = (type: string) => rows.filter((r) => r.entry_type === type).reduce((s, r) => s + r.amount, 0);
  return { entries: rows, totals: { commitment_amount: sum("commitment"), contribution_amount: sum("contribution"), distribution_amount: sum("distribution") } };
}

// 🔵🟢 발송된 캐피탈콜 + 내 요청액·납입 상태
export type LpCapitalCall = { call_no: number; is_initial: boolean; call_date: string; due_date: string; purpose: string | null; status: string; total_call_amount: number; my_call_amount: number; my_paid_amount: number; my_payment_status: string | null };

export async function lpCapitalCalls(lpId: string, fundId: string) {
  const members = await memberIds(lpId, fundId);
  return sql<LpCapitalCall[]>`
    select c.call_no, c.is_initial, c.call_date, c.due_date, c.purpose, c.status, c.total_call_amount,
           coalesce(sum(s.call_amount), 0)::bigint as my_call_amount, coalesce(sum(s.paid_amount), 0)::bigint as my_paid_amount,
           min(s.payment_status) as my_payment_status
    from capital_calls c
    left join v_capital_call_item_status s on s.capital_call_id = c.id and s.member_id = any(${members}::uuid[])
    where c.fund_id = ${fundId} and c.status in ('issued', 'closed')
    group by c.id order by c.call_no desc
  `;
}

// 🔵🟢 확정·지급된 분배 + 내 분배액(단계별)
export async function lpDistributions(lpId: string, fundId: string) {
  const members = await memberIds(lpId, fundId);
  return sql<{ distribution_no: number; is_final: boolean; distribution_date: string; status: string; distributable_amount: number; my_components: Partial<Record<DistributionComponent, number>>; my_amount: number }[]>`
    select d.distribution_no, d.is_final, d.distribution_date, d.status, d.distributable_amount,
           coalesce(json_object_agg(i.component, i.amount) filter (where i.id is not null), '{}') as my_components,
           coalesce(sum(i.amount), 0)::bigint as my_amount
    from distributions d
    left join distribution_items i on i.distribution_id = d.id and i.member_id = any(${members}::uuid[])
    where d.fund_id = ${fundId} and d.status in ('confirmed', 'paid')
    group by d.id order by d.distribution_no desc
  `;
}

// 🔵🟢 소집된 총회, 안건, 결과, 내 투표
export async function lpMeetings(lpId: string, fundId: string) {
  const members = await memberIds(lpId, fundId);
  return sql`
    select g.meeting_type, g.meeting_date, g.location, g.status,
           coalesce(json_agg(json_build_object(
             'agenda_no', a.agenda_no, 'agenda_type', a.agenda_type, 'title', a.title, 'description', a.description,
             'quorum_ratio', a.quorum_ratio::float8, 'result', a.result,
             'my_vote', (select v.choice from votes v where v.agenda_id = a.id and v.member_id = any(${members}::uuid[]) limit 1)
           ) order by a.agenda_no) filter (where a.id is not null), '[]') as agendas
    from general_meetings g
    left join agendas a on a.meeting_id = g.id
    where g.fund_id = ${fundId}
      and exists (select 1 from notices n where n.source_type = 'general_meeting' and n.source_id = g.id and n.status = 'sent')
    group by g.id order by g.meeting_date desc
  `;
}

// 🔵🟡 발행된 정기 보고 (스냅샷). 투자·평가·회수 정보는 이 스냅샷으로만 공개한다
export async function lpReports(lpId: string, fundId: string) {
  await memberIds(lpId, fundId);
  return sql`
    select r.period_type, r.period_start, r.period_end, r.gp_comment, r.snapshot,
           (select min(n.sent_at) from notices n where n.source_type = 'report' and n.source_id = r.id) as published_at
    from reports r where r.fund_id = ${fundId} and r.status = 'published'
    order by r.period_end desc, published_at desc
  `;
}

// 🟢 받은 통지 전체 (조합원이 되기 전 출자 제안 포함)
export async function lpNotices(lpId: string) {
  await loadLp(lpId);
  return sql<{ id: string; fund_id: string; fund_name: string; notice_type: NoticeType; title: string; body: string; sent_at: Date; acknowledged_at: Date | null }[]>`
    select n.id, n.fund_id, f.name as fund_name, n.notice_type, n.title, n.body, n.sent_at, r.acknowledged_at
    from notice_recipients r join notices n on n.id = r.notice_id join funds f on f.id = n.fund_id
    where r.lp_id = ${lpId} and n.status = 'sent'
    order by n.sent_at desc
  `;
}

// 🟢 통지 확인 (BR-NTC-02: LP 시스템이 알려줄 때만 기록. 이미 확인했으면 처음 시각 유지)
export async function acknowledgeNotice(lpId: string, noticeId: string) {
  await loadLp(lpId);
  assertUuid(noticeId, "통지를");
  const [r] = await sql<{ acknowledged_at: Date }[]>`
    update notice_recipients r set acknowledged_at = coalesce(r.acknowledged_at, now())
    from notices n
    where r.notice_id = n.id and n.id = ${noticeId} and r.lp_id = ${lpId} and n.status = 'sent'
    returning r.acknowledged_at
  `;
  if (!r) throw notFound("통지를");
  return { notice_id: noticeId, acknowledged_at: r.acknowledged_at };
}

// 웹훅을 놓쳤을 때 이벤트를 순서대로 다시 받기 (05 API 설계 6-3)
export async function eventsAfter(afterId: string | null, limit: number) {
  if (afterId) assertUuid(afterId, "이벤트를");
  return sql`
    select e.id, e.event_type, e.created_at as occurred_at, e.lp_id, e.payload->>'fund_id' as fund_id, e.payload - 'fund_id' as data
    from integration_events e
    where ${afterId}::uuid is null
       or (e.created_at, e.id) > (select created_at, id from integration_events where id = ${afterId}::uuid)
    order by e.created_at, e.id
    limit ${Math.min(Math.max(limit, 1), 500)}
  `;
}
