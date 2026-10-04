import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import type { DistributionComponent, FundStatus, FundType, InstitutionType, LpType, ManagerRole, NoticeType, ProposalStatus, VoteChoice } from "@/lib/labels";
import { openAttachment, publicAttachments } from "@/lib/services/attachments";
import { recordLpVotes } from "@/lib/services/meetings";
import { respondFromLpSystem, type DecidedVia, type LpProposalDecision } from "@/lib/services/proposals";
import { termsEffectiveAt } from "@/lib/services/terms";

// LP 연동 API가 돌려주는 데이터 (05 API 설계 5장, 03 DB 설계 7장 LP 공개 등급)
// · 🟢 본인 것만: 이 LP의 조합원 행·원장·요청액·분배액·투표·통지
// · 🔵 조합 단위: 이 LP가 조합원인 조합만 (아니면 403 FORBIDDEN)
// · 🟡 요약만: 투자·평가·회수·기업은 발행된 정기 보고 스냅샷으로만
// · 🔴 비공개: 딜·투심위·다른 LP 정보·메모·created_by·내부 문서 ID는 어떤 응답에도 넣지 않는다
//   (LP가 직접 행동하는 대상의 ID는 예외: 통지 확인용 notice id, 직접 투표용 총회·안건 id)
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
  // target_amount·gp_type·total_commitment_amount(결성액 = 조합 전체 약정 합계)는 LP ERP의 조합 정보·결성 확인용 (D45 보완)
  const [fund] = await sql<{ id: string; name: string; fund_type: FundType; gp_type: string; status: FundStatus; target_amount: number; total_commitment_amount: number; formation_date: string | null; dissolution_date: string | null; liquidation_date: string | null; term_years: number; investment_period_years: number }[]>`
    select f.id, f.name, f.fund_type, f.strategy, f.gp_type, f.status, f.target_amount,
           (select coalesce(sum(e.amount), 0) from ledger_entries e where e.fund_id = f.id and e.entry_type = 'commitment')::bigint as total_commitment_amount,
           f.formation_date, f.dissolution_date, f.liquidation_date, f.term_years, f.investment_period_years
    from funds f where f.id = ${fundId}
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
    order by case m.role when 'lead' then 1 when 'key' then 2 else 3 end, s.name
  `;
  const [my] = (await lpFunds(lpId)).filter((f) => f.fund_id === fundId);
  return {
    fund,
    terms: {
      version: t.version,
      effective_date: t.effective_date,
      primary_purpose: t.primary_purpose,
      primary_purpose_min_ratio: t.primary_purpose_min_ratio, // 주목적 의무 투자 비율 → LP 쪽 조건 준수 점검 (D45)
      unit_amount: t.unit_amount,
      management_fee_rate: t.management_fee_rate,
      management_fee_rate_after: t.management_fee_rate_after,
      carry_rate: t.carry_rate,
      hurdle_rate: t.hurdle_rate,
      quorum_ratio: t.quorum_ratio,
      attachments: (await publicAttachments("fund_terms", [t.id])).get(t.id) ?? [], // 규약 원문 PDF (BR-FILE-02)
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
    select g.id, g.meeting_type, g.meeting_date, g.location, g.status,
           (g.status = 'scheduled') as voting_open, -- 소집된 총회는 개최 처리 전까지 직접 투표할 수 있다 (BR-VOTE-07)
           coalesce(json_agg(json_build_object(
             'id', a.id, 'agenda_no', a.agenda_no, 'agenda_type', a.agenda_type, 'title', a.title, 'description', a.description,
             'quorum_ratio', a.quorum_ratio::float8, 'result', a.result,
             'my_vote', (select v.choice from votes v where v.agenda_id = a.id and v.member_id = any(${members}::uuid[]) limit 1),
             'my_vote_channel', (select v.channel from votes v where v.agenda_id = a.id and v.member_id = any(${members}::uuid[]) limit 1)
           ) order by a.agenda_no) filter (where a.id is not null), '[]') as agendas
    from general_meetings g
    left join agendas a on a.meeting_id = g.id
    where g.fund_id = ${fundId}
      and exists (select 1 from notices n where n.source_type = 'general_meeting' and n.source_id = g.id and n.status = 'sent')
    group by g.id order by g.meeting_date desc
  `;
}

// 🔵🟢 LP 직접 투표 (BR-VOTE-07). 제출 후 그 총회의 내 투표 현황을 돌려준다
export async function lpVote(lpId: string, fundId: string, meetingId: string, votes: { agenda_id: string; choice: VoteChoice }[]) {
  await memberIds(lpId, fundId);
  assertUuid(meetingId, "총회를");
  await recordLpVotes(lpId, fundId, meetingId, votes);
  const meetings = (await lpMeetings(lpId, fundId)) as unknown as { id: string }[];
  return meetings.find((m) => m.id === meetingId);
}

// 🔵🟡 발행된 정기 보고 (스냅샷). 투자·평가·회수 정보는 이 스냅샷으로만 공개한다
// · id: LP 시스템이 같은 보고를 두 번 저장하지 않게 식별용으로 준다 (D45)
// · is_correction: 같은 기간에 먼저 발행된 보고가 있는 정정 보고 (D45)
// · my: 기준일(period_end) 현재 내 지분율과 내 몫 평가액 (D45, LP 성과 지표용)
//   내 몫 평가액 = (보유 기업 평가액 + 현금 잔액) × 기준일까지의 내 약정 ÷ 조합 약정 총액, 원 미만 버림.
//   스냅샷 TVPI의 "잔여 가치 = 평가액 + 현금"과 같은 정의이고, 지분율은 약정액 기준이다 (D4)
export async function lpReports(lpId: string, fundId: string) {
  const members = await memberIds(lpId, fundId);
  const reports = await sql<{ id: string; [k: string]: unknown }[]>`
    select r.id, r.period_type, r.period_start, r.period_end, r.gp_comment, r.snapshot,
           (select min(n.sent_at) from notices n where n.source_type = 'report' and n.source_id = r.id) as published_at,
           exists (
             select 1 from reports o where o.fund_id = r.fund_id and o.id <> r.id and o.status = 'published'
               and o.period_start = r.period_start and o.period_end = r.period_end and o.created_at < r.created_at
           ) as is_correction,
           json_build_object(
             'ownership_ratio', case when c.total > 0 then round(c.mine / c.total, 6)::float8 end,
             'nav_amount', case when c.total > 0 then floor(
               ((r.snapshot->'totals'->>'current_value_amount')::numeric + (r.snapshot->'totals'->>'cash_amount')::numeric) * c.mine / c.total
             )::bigint end
           ) as my
    from reports r
    cross join lateral (
      select coalesce(sum(e.amount) filter (where e.member_id = any(${members}::uuid[])), 0)::numeric as mine,
             coalesce(sum(e.amount), 0)::numeric as total
      from ledger_entries e
      where e.fund_id = r.fund_id and e.entry_type = 'commitment' and e.entry_date <= r.period_end
    ) c
    where r.fund_id = ${fundId} and r.status = 'published'
    order by r.period_end desc, published_at desc
  `;
  const files = await publicAttachments("report", reports.map((r) => r.id)); // 보고서 PDF (BR-FILE-02)
  return reports.map((r) => ({ ...r, attachments: files.get(r.id) ?? [] }));
}

// 🔵 첨부 파일 내려받기: 이 LP가 조합원인 조합의 규약 원문, 발행된 보고서 PDF만 (BR-FILE-02)
export async function lpAttachment(lpId: string, fundId: string, attachmentId: string) {
  await memberIds(lpId, fundId);
  return openAttachment(fundId, attachmentId, { lpOnly: true });
}

// 🟢 내 출자 제안 (D45). 조합원이 되기 전에도 조회된다 (제안은 결성 전 일이므로)
// · 발송한 제안만 (발송 전 제안은 LP가 모르는 GP 내부 작업)
// · 결성 전이라 조합 상세 API(🔵 조합원만)를 쓸 수 없으므로, 제안 검토에 필요한 조합 정보만 함께 준다.
//   제안서(통지 본문)에 이미 담긴 수준: 목표 결성액·기간·최신 규약의 보수 조건·주목적·운용 인력. GP 내부 메모는 넣지 않는다
export type LpProposal = {
  id: string;
  status: ProposalStatus;
  proposed_amount: number | null;
  loc_amount: number | null;
  proposed_date: string;
  decided_date: string | null;
  decided_via: DecidedVia | null;
  last_sent_at: Date | null; // 통지로 보낸 마지막 시각. 공고 지원(D47)은 통지 없이도 보인다
  // 공고 지원이면 LP ERP 출자사업 · 부문 (D47). LP ERP는 이것으로 공고 부문에 접수한다
  application: { program_id: string; track_id: string; applied_at: Date } | null;
  fund: Record<string, unknown>;
};

const selectLpProposals = (lpId: string, proposalId: string | null) => sql<LpProposal[]>`
  select p.id, p.status, p.proposed_amount, p.loc_amount, p.proposed_date, p.decided_date, p.decided_via, s.last_sent_at,
         case when p.lp_program_id is null then null
              else json_build_object('program_id', p.lp_program_id, 'track_id', p.lp_track_id, 'applied_at', p.applied_at) end as application,
         json_build_object(
           'id', f.id, 'name', f.name, 'fund_type', f.fund_type, 'strategy', f.strategy, 'gp_type', f.gp_type, 'status', f.status,
           'target_amount', f.target_amount, 'term_years', f.term_years, 'investment_period_years', f.investment_period_years,
           'formation_date', f.formation_date,
           'terms', json_build_object(
             'version', t.version, 'primary_purpose', t.primary_purpose, 'primary_purpose_min_ratio', t.primary_purpose_min_ratio::float8,
             'unit_amount', t.unit_amount, 'management_fee_rate', t.management_fee_rate::float8,
             'management_fee_rate_after', t.management_fee_rate_after::float8, 'carry_rate', t.carry_rate::float8, 'hurdle_rate', t.hurdle_rate::float8
           ),
           'managers', (
             select coalesce(json_agg(json_build_object('name', st.name, 'position', st.position, 'role', m.role) order by case m.role when 'lead' then 1 when 'key' then 2 else 3 end, st.name), '[]')
             from fund_managers m join staff st on st.id = m.staff_id
             where m.fund_id = f.id and m.end_date is null
           )
         ) as fund
  from lp_proposals p
  join funds f on f.id = p.fund_id
  cross join lateral (
    select max(n.sent_at) as last_sent_at from notices n
    where n.source_type = 'lp_proposal' and n.source_id = p.id and n.status = 'sent'
  ) s
  left join lateral (select * from fund_terms ft where ft.fund_id = f.id order by ft.version desc limit 1) t on true
  where p.lp_id = ${lpId} and (s.last_sent_at is not null or p.applied_at is not null)
    and (${proposalId}::uuid is null or p.id = ${proposalId}::uuid)
  order by p.proposed_date desc, s.last_sent_at desc nulls last
`;

export async function lpProposals(lpId: string) {
  await loadLp(lpId);
  return selectLpProposals(lpId, null);
}

// 🟢 출자 제안 응답 (D45): reviewing / committed(확약 금액) / declined. 응답 후 그 제안을 돌려준다
export async function lpRespondProposal(
  lpId: string,
  proposalId: string,
  input: { decision: LpProposalDecision; loc_amount: number | null; decided_date: string | null },
) {
  await loadLp(lpId);
  const { changed } = await respondFromLpSystem(lpId, proposalId, input);
  const [proposal] = await selectLpProposals(lpId, proposalId);
  return { ...proposal, changed };
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
