// 샘플 데이터 5: LP ERP 연동 데모 (D45, LP ERP `vc-erp/lp` 의 데모 기관)
//
// LP ERP의 데모 기관 2곳을 GP의 출자자로 등록하고, GP 조합에 참여시킨다.
// LP ERP가 GP 연동 API로 받아볼 데이터(제안·약정·캐피탈콜·분배·보고)가 생기게 하는 것이 목적이다.
//
//   ① 출자자 2곳: 하늘연금(연기금·공제회), 바다성장출자(정책 출자기관)
//   ② 새 조합 'LP연동 데모 벤처투자조합' (2025 결성, 운용 중)
//      조합원: GP + 하늘연금 + 바다성장출자 + 미래 연금기금 + 가온 캐피탈
//      최초 납입 → 캐피탈콜 2회 → 투자 2건 → 회수 1건 → 분배 1회 → 3차 캐피탈콜
//      바다성장출자는 3차 캐피탈콜을 절반만 납입 (기한 경과, LP ERP 대사·주의 목록 시연용)
//      4차 캐피탈콜은 발송만 한다 (LP ERP R4 시연: 납입 기안 → 결재 → 송금 → GP 입금 기록 → 대사 "일치", LP L30)
//      2026년 2분기 정기 보고 발행 (LP ERP R5 시연: 보고 수집·검토·조건 점검, LP L38)
//      정기총회 소집 (안건 2개, 투표 가능 — LP ERP R5 시연: 투표 결재 → GP에 직접 투표, LP L38)
//      2차 분배 확정 (지급 전 — LP ERP R6 시연: 수령 대기 → GP 지급 → LP 수령 기록 → 분배 대사, LP L43)
//   ③ 모집 중인 '딥테크 스케일업 투자조합': 두 기관에 출자 제안 발송 (LP ERP의 제안 접수·심사 시연용)
//
// · 기존 조합의 숫자는 건드리지 않는다. 기존 조합에 조합원을 더하면 이미 발송한 캐피탈콜·분배의 비율이 어긋나기 때문이다
// · 화면·API와 같은 서비스 함수를 거친다 (업무 규칙 검사 + 자동 분개 + 통지·연동 이벤트)
// · 이미 있는 출자자·조합·제안은 건너뛴다 (다시 실행해도 중복되지 않음)
// · ⚠️ 원장·분개는 지울 수 없는 기록이다 (개발 DB에서만 실행)
//
// 사용법: npm run db:seed-lp-demo

import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve('.') } });
const { sql } = await jiti.import('@/lib/db.ts');
const lps = await jiti.import('@/lib/services/lps.ts');
const funds = await jiti.import('@/lib/services/funds.ts');
const managers = await jiti.import('@/lib/services/fund-managers.ts');
const proposals = await jiti.import('@/lib/services/proposals.ts');
const transitions = await jiti.import('@/lib/services/fund-transitions.ts');
const roster = await jiti.import('@/lib/services/roster.ts');
const meetings = await jiti.import('@/lib/services/meetings.ts');
const calls = await jiti.import('@/lib/services/capital-calls.ts');
const institutions = await jiti.import('@/lib/services/institutions.ts');
const fees = await jiti.import('@/lib/services/management-fees.ts');
const investments = await jiti.import('@/lib/services/investments.ts');
const exits = await jiti.import('@/lib/services/exits.ts');
const dist = await jiti.import('@/lib/services/distributions.ts');
const reports = await jiti.import('@/lib/services/reports.ts');

const 억 = 100_000_000;
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const log = (msg) => console.log(`  ${msg}`);

// LP ERP 데모 기관 (vc-erp/lp scripts/seed-demo.mjs 의 기관과 짝)
const LP_DEMO = [
  { name: '하늘연금', lp_type: 'pension', contact_name: '이지원', contact_email: 'officer@a.demo.lp-erp.dev', memo: 'LP ERP 데모 기관 A (vc-erp/lp)' },
  { name: '바다성장출자', lp_type: 'policy', contact_name: '정민재', contact_email: 'officer@b.demo.lp-erp.dev', memo: 'LP ERP 데모 기관 B (vc-erp/lp)' },
];

const FUND = {
  name: 'LP연동 데모 벤처투자조합',
  fund: { fund_type: 'venture', gp_type: 'venture_capital', target_amount: 150 * 억, term_years: 8, investment_period_years: 4 },
  terms: { primary_purpose: '업력 7년 이내 소프트웨어·AI 창업기업', unit_amount: 10_000_000, primary_purpose_min_ratio: 0.6, gp_commitment_min_ratio: 0.01, management_fee_rate: 0.02, management_fee_rate_after: 0.015, carry_rate: 0.2, hurdle_rate: 0.07, quorum_ratio: 0.5 },
  team: [['백지민', 'lead'], ['김도윤', 'key']],
  teamStart: '2024-12-02',
  lps: [['하늘연금', 50], ['바다성장출자', 40], ['미래 연금기금', 30], ['가온 캐피탈', 25]],
  gp: 5,
  proposed: '2025-01-10',
  decided: '2025-02-10',
  rosterDate: '2025-02-20',
  initialCall: { date: '2025-03-03', amount: 30, paid: '2025-03-07' },
  formationMeeting: '2025-03-14',
  registration: ['2025-03-17', '2025-03-31'],
  institutions: [['custodian', '하나로은행 판교지점'], ['administrator', '바른펀드서비스'], ['auditor', '새길회계법인']],
  secondCall: { date: '2025-09-01', amount: 30, paid: '2025-09-05' },
  feeQuarters: [[2025, 2, '2025-06-30'], [2025, 3, '2025-09-30'], [2025, 4, '2025-12-31'], [2026, 1, '2026-03-31'], [2026, 2, '2026-06-30']],
  companies: [
    // [이름, 업종, 대표, 투자일, 투자액(억), 형태]
    ['코드브릿지', '개발자 협업 SaaS', '윤서진', '2025-04-14', 20, 'rcps'],
    ['메디스캔AI', '의료 영상 AI', '오태경', '2025-10-13', 25, 'rcps'],
  ],
  exit: ['코드브릿지', 'trade_sale', '2026-06-30', 35, '글로벌 SaaS 기업에 구주 매각'],
  distribution: ['2026-07-15', 30, '코드브릿지 매각 대금 분배'],
  // 3차: 바다성장출자만 절반 납입, 나머지는 완납 (기한 2026-09-15 경과)
  thirdCall: { date: '2026-09-01', amount: 30, paid: '2026-09-08', partial: { lp: '바다성장출자', ratio: 0.5 } },
  // 4차: 발송만 (아무도 납입하지 않음)
  fourthCall: { date: '2026-10-03', due: '2026-10-31', amount: 15, purpose: '제4차 출자 (투자 재원)' },
  // 2차 분배: 확정만 (지급하지 않음)
  secondDistribution: { date: '2026-10-20', amount: 20, confirmedAt: '2026-10-02', memo: '메디스캔AI 일부 구주 매각 대금 분배' },
  // 2026년 2분기 보고: 발행 시각을 7월 말로 맞춘다
  // 정기총회: 소집만 해 둔다 (개최 처리 전이라 LP가 직접 투표할 수 있다)
  regularMeeting: {
    date: '2026-10-30',
    convenedAt: '2026-10-02',
    location: 'VC ERP 데모 운용사 본사 대회의실',
    agendas: [
      { agenda_type: 'report_approval', title: '2026년 상반기 운용 보고 승인', description: '2026년 6월 30일 기준 운용 현황(투자 2건, 회수 1건, 분배 1회)과 2분기 보고 내용을 승인합니다.' },
      { agenda_type: 'terms_amendment', title: '규약 변경: 후속 투자 한도 상향', description: '기존 투자 기업 후속 투자 한도를 조합 약정 총액의 20%에서 30%로 올립니다. 메디스캔AI 후속 투자 대비.' },
    ],
  },
  report: { year: 2026, quarter: 2, publishedAt: '2026-07-28', comment: '2분기 중 코드브릿지 구주 매각 계약 체결(6/30). 메디스캔AI는 후속 투자 유치 협의 중입니다.' },
};

// 모집 중인 조합에 보낼 출자 제안 (LP ERP 제안 접수 시연)
const DEEPTECH = { name: '딥테크 스케일업 투자조합', proposed: '2026-09-22', offers: [['하늘연금', 30], ['바다성장출자', 20]] };

async function holdMeetingAllFor(F, input, U) {
  const m = await meetings.createMeeting(F, input, U);
  await meetings.conveneMeeting(F, m.id, U);
  const detail = await meetings.getMeeting(F, m.id);
  for (const a of detail.agendas) for (const v of detail.voters) await meetings.recordVote(F, m.id, a.id, v.member_id, 'for', U);
  await meetings.holdMeeting(F, m.id);
}

// 캐피탈콜 발송 후 납입. partial 이면 그 LP는 비율만큼만 납입한다
async function payCall(F, input, paidDate, U, partial) {
  const call = await calls.createCapitalCall(F, { call_all_unfunded: false, ...input }, U);
  await calls.issueCapitalCall(F, call.id, U);
  for (const it of (await calls.getCapitalCall(F, call.id)).items) {
    const isPartial = partial && it.member_name === partial.lp;
    const amount = isPartial ? Math.floor(it.call_amount * partial.ratio) : it.call_amount;
    await calls.recordPayment(F, call.id, it.id, { paid_amount: amount, paid_date: paidDate, memo: isPartial ? '자금 집행 일정으로 일부만 납입' : null }, U);
  }
  return call.id;
}

async function ensureLps(U) {
  const ids = {};
  for (const lp of LP_DEMO) {
    const [found] = await sql`select id from limited_partners where name = ${lp.name}`;
    if (found) {
      ids[lp.name] = found.id;
      console.log(`• 출자자 ${lp.name}: 이미 있음`);
      continue;
    }
    const created = await lps.createLp({ registration_no: null, contact_phone: null, ...lp }, U);
    ids[lp.name] = created.id;
    console.log(`• 출자자 ${lp.name}: 등록`);
  }
  return ids;
}

async function createDemoFund(U) {
  const s = FUND;
  const [exists] = await sql`select 1 from funds where name = ${s.name}`;
  if (exists) return console.log(`• ${s.name}: 이미 있어 건너뜁니다`);
  console.log(`• ${s.name}`);

  const { id: F } = await funds.createFund({ name: s.name, ...s.fund }, s.terms, U);
  for (const [name, role] of s.team) {
    const [st] = await sql`select id from staff where name = ${name}`;
    await managers.appointManager(F, { staff_id: st.id, role, start_date: s.teamStart, replaces_id: null, agenda_id: null }, U);
  }

  // 모집: 제안 → 발송 → 확약 → 명부 확정
  const lpIds = {};
  for (const [name, amount] of s.lps) {
    const [lp] = await sql`select id from limited_partners where name = ${name}`;
    lpIds[name] = lp.id;
    await proposals.createProposal(F, { lp_id: lp.id, proposed_amount: amount * 억, proposed_date: s.proposed, memo: null }, U);
  }
  await transitions.transitionFund(F, 'fundraising');
  const items = (await proposals.listProposals(F)).items;
  for (const [name, amount] of s.lps) {
    const p = items.find((x) => x.lp_id === lpIds[name]);
    await proposals.sendProposal(F, p.id, U);
    await proposals.transitionProposal(F, p.id, { to_status: 'committed', loc_amount: amount * 억, decided_date: s.decided });
  }
  await roster.confirmRoster(F, {
    confirmed_date: s.rosterDate,
    gp_commitment_amount: s.gp * 억,
    members: s.lps.map(([name, amount]) => ({ proposal_id: items.find((x) => x.lp_id === lpIds[name]).id, commitment_amount: amount * 억 })),
  }, U);
  log(`명부 확정: ${s.lps.map(([n, a]) => `${n} ${a}억`).join(', ')}, GP ${s.gp}억`);

  // 최초 납입 → 결성총회 → 결성 → 등록 → 운용
  await payCall(F, { total_call_amount: s.initialCall.amount * 억, call_date: s.initialCall.date, due_date: addDays(s.initialCall.date, 14), purpose: '최초 납입 (결성 시 출자)' }, s.initialCall.paid, U);
  await holdMeetingAllFor(F, { meeting_type: 'formation', meeting_date: s.formationMeeting, location: '본사 대회의실', agendas: [{ agenda_type: 'other', title: '수탁은행 선정의 건', description: null }] }, U);
  await transitions.transitionFund(F, 'formed');
  await institutions.updateRegistration(F, { registration_applied_date: s.registration[0], registration_completed_date: s.registration[1] });
  for (const [type, name] of s.institutions) await institutions.createInstitution(F, { institution_type: type, name, contact_name: null, contact_email: null, contact_phone: null }, U);
  await transitions.transitionFund(F, 'operating');
  log(`결성 ${s.formationMeeting} → 운용`);

  // 운용 (날짜순: 거래일 기준 현금 검사를 통과하도록)
  const companyIds = {};
  const timeline = [
    { date: s.secondCall.date, run: () => payCall(F, { total_call_amount: s.secondCall.amount * 억, call_date: s.secondCall.date, due_date: addDays(s.secondCall.date, 14), purpose: '제2차 출자 (투자 재원)' }, s.secondCall.paid, U) },
    ...s.feeQuarters.map(([y, q, date]) => ({ date, run: () => fees.chargeManagementFee(F, y, q, date, U) })),
    ...s.companies.map(([name, sector, ceo, date, amount, security]) => ({
      date,
      run: async () => {
        const [c] = await sql`insert into companies (name, sector, ceo_name, created_by) values (${name}, ${sector}, ${ceo}, ${U}) returning id`;
        companyIds[name] = c.id;
        const sourced = addDays(date, -90);
        const [deal] = await sql`
          insert into deals (company_id, target_fund_id, stage, expected_amount, owner_id, sourced_date, created_by, created_at)
          values (${c.id}, ${F}, 'approved', ${amount * 억}, ${U}, ${sourced}, ${U}, ${`${sourced}T10:00:00+09:00`}) returning id
        `;
        let prev = null;
        for (const [j, st] of ['sourcing', 'reviewing', 'ic', 'approved'].entries()) {
          await sql`insert into deal_stage_history (deal_id, from_stage, to_stage, changed_by, changed_at) values (${deal.id}, ${prev}, ${st}, ${U}, ${`${addDays(sourced, j * 25)}T10:00:00+09:00`})`;
          prev = st;
        }
        await investments.executeInvestment(F, { is_follow_on: false, deal_id: deal.id, company_id: null, investment_date: date, investment_amount: amount * 억, security_type: security, shares: null, price_per_share: null, is_primary_purpose: true }, U);
      },
    })),
    {
      date: s.exit[2],
      run: () => {
        const [name, type, date, proceeds, memo] = s.exit;
        return exits.recordExit(F, { company_id: companyIds[name], exit_type: type, exit_date: date, proceeds_amount: proceeds * 억, full_exit: true, cost_basis_amount: null, memo }, U);
      },
    },
    {
      date: s.distribution[0],
      run: async () => {
        const [date, amount, memo] = s.distribution;
        const d = await dist.createDistribution(F, { distribution_date: date, distributable_amount: amount * 억, is_final: false, memo }, U);
        await dist.confirmDistribution(F, d.id, U);
        await dist.payDistribution(F, d.id, U);
      },
    },
    { date: s.thirdCall.date, run: () => payCall(F, { total_call_amount: s.thirdCall.amount * 억, call_date: s.thirdCall.date, due_date: addDays(s.thirdCall.date, 14), purpose: '제3차 출자 (후속 투자 재원)' }, s.thirdCall.paid, U, s.thirdCall.partial) },
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const t of timeline) await t.run();
  log(`캐피탈콜 3회(3차는 ${s.thirdCall.partial.lp} 일부 납입) · 관리보수 ${s.feeQuarters.length}분기 · 투자 ${s.companies.length}건 · 회수 1건 · 분배 1회`);

  // 과거 날짜로 만든 기록의 발송·확정 시각을 업무 날짜에 맞춘다 (seed-sample-lifecycle 과 같은 방식)
  await sql`
    update notices n set sent_at = (p.proposed_date::timestamp + interval '10 hours') at time zone 'Asia/Seoul'
    from lp_proposals p where n.fund_id = ${F} and n.source_type = 'lp_proposal' and n.source_id = p.id
  `;
  await sql`
    update notices n set sent_at = (c.call_date::timestamp + interval '10 hours') at time zone 'Asia/Seoul'
    from capital_call_items i join capital_calls c on c.id = i.capital_call_id
    where n.fund_id = ${F} and n.source_type = 'capital_call_item' and n.source_id = i.id
  `;
  await sql`
    update notices n set sent_at = ((g.meeting_date - 14)::timestamp + interval '10 hours') at time zone 'Asia/Seoul'
    from general_meetings g where n.fund_id = ${F} and n.source_type = 'general_meeting' and n.source_id = g.id
  `;
  await sql`
    update distributions set confirmed_at = ((distribution_date - 3)::timestamp + interval '10 hours') at time zone 'Asia/Seoul',
      paid_at = case when status = 'paid' then (distribution_date::timestamp + interval '14 hours') at time zone 'Asia/Seoul' end
    where fund_id = ${F}
  `;
  await sql`update notices n set sent_at = d.confirmed_at from distributions d where n.source_id = d.id and n.notice_type = 'distribution' and d.fund_id = ${F}`;
  // 통지 확인: LP ERP 데모 기관은 LP ERP에서 직접 확인하도록 비워 두고, 나머지 LP만 확인한 것으로 (발송 3일 뒤)
  await sql`
    update notice_recipients r set acknowledged_at = n.sent_at + interval '3 days'
    from notices n, limited_partners l
    where r.notice_id = n.id and l.id = r.lp_id and n.fund_id = ${F} and n.status = 'sent'
      and l.name not in ${sql(LP_DEMO.map((x) => x.name))}
  `;
}

// 4차 캐피탈콜: 발송만 해 둔다. 조합이 있고 4회가 아직 없을 때만 (이미 있으면 건너뜀)
async function issueFourthCall(U) {
  const s = FUND.fourthCall;
  const [fund] = await sql`select id from funds where name = ${FUND.name}`;
  if (!fund) return;
  const [dup] = await sql`select 1 from capital_calls where fund_id = ${fund.id} and call_no = 4`;
  if (dup) return console.log(`• ${FUND.name} 4차 캐피탈콜: 이미 있어 건너뜁니다`);
  const c = await calls.createCapitalCall(fund.id, { total_call_amount: s.amount * 억, call_all_unfunded: false, call_date: s.date, due_date: s.due, purpose: s.purpose }, U);
  await calls.issueCapitalCall(fund.id, c.id, U);
  await sql`
    update notices n set sent_at = (${s.date}::date::timestamp + interval '10 hours') at time zone 'Asia/Seoul'
    from capital_call_items i where n.fund_id = ${fund.id} and n.source_type = 'capital_call_item' and n.source_id = i.id and i.capital_call_id = ${c.id}
  `;
  console.log(`• ${FUND.name} 4차 캐피탈콜 ${s.amount}억 발송 (납입 없음, 기한 ${s.due})`);
}

// 2026년 2분기 정기 보고 발행 (이미 있으면 건너뜀)
async function publishQuarterReport(U) {
  const s = FUND.report;
  const [fund] = await sql`select id from funds where name = ${FUND.name}`;
  if (!fund) return;
  const start = `${s.year}-${String((s.quarter - 1) * 3 + 1).padStart(2, '0')}-01`;
  const [dup] = await sql`select 1 from reports where fund_id = ${fund.id} and period_type = 'quarterly' and period_start = ${start}`;
  if (dup) return console.log(`• ${FUND.name} ${s.year}년 ${s.quarter}분기 보고: 이미 있어 건너뜁니다`);
  const r = await reports.createReport(fund.id, { period_type: 'quarterly', year: s.year, period_no: s.quarter, gp_comment: s.comment }, U);
  await reports.publishReport(fund.id, r.id, U);
  await sql`
    update notices set sent_at = (${s.publishedAt}::date::timestamp + interval '10 hours') at time zone 'Asia/Seoul'
    where fund_id = ${fund.id} and source_type = 'report' and source_id = ${r.id}
  `;
  console.log(`• ${FUND.name} ${s.year}년 ${s.quarter}분기 보고 발행`);
}

// 정기총회 소집 (이미 있으면 건너뜀). 개최 처리는 하지 않는다 → LP가 투표할 수 있다
async function conveneRegularMeeting(U) {
  const s = FUND.regularMeeting;
  const [fund] = await sql`select id from funds where name = ${FUND.name}`;
  if (!fund) return;
  const [dup] = await sql`select 1 from general_meetings where fund_id = ${fund.id} and meeting_type = 'regular' and meeting_date = ${s.date}`;
  if (dup) return console.log(`• ${FUND.name} 정기총회(${s.date}): 이미 있어 건너뜁니다`);
  const m = await meetings.createMeeting(fund.id, { meeting_type: 'regular', meeting_date: s.date, location: s.location, agendas: s.agendas }, U);
  await meetings.conveneMeeting(fund.id, m.id, U);
  await sql`
    update notices set sent_at = (${s.convenedAt}::date::timestamp + interval '10 hours') at time zone 'Asia/Seoul'
    where fund_id = ${fund.id} and source_type = 'general_meeting' and source_id = ${m.id}
  `;
  console.log(`• ${FUND.name} 정기총회 소집 (${s.date}, 안건 ${s.agendas.length}건, 투표 가능)`);
}

// 2차 분배 확정 (이미 있으면 건너뜀). 지급은 하지 않는다 → LP "수령 대기"
async function confirmSecondDistribution(U) {
  const s = FUND.secondDistribution;
  const [fund] = await sql`select id from funds where name = ${FUND.name}`;
  if (!fund) return;
  const [dup] = await sql`select 1 from distributions where fund_id = ${fund.id} and distribution_no = 2`;
  if (dup) return console.log(`• ${FUND.name} 2차 분배: 이미 있어 건너뜁니다`);
  const d = await dist.createDistribution(fund.id, { distribution_date: s.date, distributable_amount: s.amount * 억, is_final: false, memo: s.memo }, U);
  await dist.confirmDistribution(fund.id, d.id, U);
  await sql`update distributions set confirmed_at = (${s.confirmedAt}::date::timestamp + interval '10 hours') at time zone 'Asia/Seoul' where id = ${d.id}`;
  await sql`update notices n set sent_at = d.confirmed_at from distributions d where n.source_id = d.id and n.notice_type = 'distribution' and d.id = ${d.id}`;
  console.log(`• ${FUND.name} 2차 분배 ${s.amount}억 확정 (지급 전, 분배일 ${s.date})`);
}

async function sendDeeptechOffers(lpIds, U) {
  const [fund] = await sql`select id, status from funds where name = ${DEEPTECH.name}`;
  if (!fund) return console.log(`• ${DEEPTECH.name}: 조합이 없어 건너뜁니다`);
  if (fund.status !== 'fundraising') return console.log(`• ${DEEPTECH.name}: 모집 중이 아니라 건너뜁니다 (${fund.status})`);
  console.log(`• ${DEEPTECH.name}`);
  for (const [name, amount] of DEEPTECH.offers) {
    const [dup] = await sql`select id from lp_proposals where fund_id = ${fund.id} and lp_id = ${lpIds[name]}`;
    if (dup) {
      log(`${name}: 제안이 이미 있음`);
      continue;
    }
    const p = await proposals.createProposal(fund.id, { lp_id: lpIds[name], proposed_amount: amount * 억, proposed_date: DEEPTECH.proposed, memo: null }, U);
    await proposals.sendProposal(fund.id, p.id, U);
    await sql`
      update notices set sent_at = (${DEEPTECH.proposed}::date::timestamp + interval '10 hours') at time zone 'Asia/Seoul'
      where fund_id = ${fund.id} and source_type = 'lp_proposal' and source_id = ${p.id}
    `;
    log(`${name}: ${amount}억 출자 제안 발송`);
  }
}

try {
  const [demo] = await sql`select id from users where email = 'demo@vc-erp.dev'`;
  if (!demo) throw new Error('데모 계정이 없습니다. npm run db:seed-staff 를 먼저 실행하세요');
  const U = demo.id;

  const lpIds = await ensureLps(U);
  await createDemoFund(U);
  await issueFourthCall(U);
  await publishQuarterReport(U);
  await conveneRegularMeeting(U);
  await confirmSecondDistribution(U);
  await sendDeeptechOffers(lpIds, U);

  console.log('\nLP ERP 연결용 GP 출자자 ID (LP ERP R3 gp_lp_links 에 쓴다)');
  for (const [name, id] of Object.entries(lpIds)) console.log(`  ${name}: ${id}`);
} catch (err) {
  console.error('✖ LP 연동 데모 데이터 생성 실패:', err.code ?? '', err.message, err.details ? JSON.stringify(err.details) : '');
  process.exitCode = 1;
} finally {
  await sql.end();
}
