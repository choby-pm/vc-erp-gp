// 샘플 데이터 4: 조합 생애주기 전 단계 (R7 데모용)
//
// · 대시보드에서 6단계(기획 → 모집 → 결성 → 운용 → 해산 → 청산)가 모두 보이도록 조합을 채운다
//   - 그린에너지 신기술투자조합: 결성 조건이 준비되어 있으면 결성 처리 (결성 완료 단계)
//   - 씨앗 1호 벤처투자조합 (2018 결성): 모집 → 결성 → 운용(캐피탈콜·관리보수·비용·투자·평가) → 회수 5건 → 분배 3회
//     → 해산총회 → 최종 분배(성과보수 발생) → 청산 완료. 2018~2025 사업연도 결산까지
//   - 브릿지 2호 벤처투자조합 (2018 결성): 같은 흐름으로 해산까지. 보유 기업 1곳이 남아 있어 청산 전 단계
// · 화면·API와 같은 서비스 함수를 거친다 (업무 규칙 검사 + 자동 분개 + 통지·이벤트)
// · 과거 날짜로 만든 기록이라, 마지막에 통지 발송 시각·분배 확정 시각을 업무 날짜에 맞춘다
// · 이미 같은 이름의 조합이 있으면 그 조합은 건너뛴다. ⚠️ 원장·분개는 지울 수 없는 기록이다 (개발 DB에서만 실행)
//
// 사용법: npm run db:seed-sample-lifecycle

import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve('.') } });
const { sql } = await jiti.import('@/lib/db.ts');
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
const portfolio = await jiti.import('@/lib/services/portfolio.ts');
const finance = await jiti.import('@/lib/services/finance.ts');
const exits = await jiti.import('@/lib/services/exits.ts');
const dist = await jiti.import('@/lib/services/distributions.ts');
const accounting = await jiti.import('@/lib/services/accounting.ts');

const 억 = 100_000_000;
const 만 = 10_000;
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// ─── 조합 시나리오 ───────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    name: '씨앗 1호 벤처투자조합',
    stopAt: 'liquidated',
    fund: { fund_type: 'venture', gp_type: 'venture_capital', target_amount: 100 * 억, term_years: 8, investment_period_years: 4 },
    terms: { primary_purpose: '업력 7년 이내 기술 기반 창업기업', unit_amount: 10_000_000, primary_purpose_min_ratio: 0.5, gp_commitment_min_ratio: 0.01, management_fee_rate: 0.02, management_fee_rate_after: 0.015, carry_rate: 0.2, hurdle_rate: 0.05, quorum_ratio: 0.5 },
    team: [['김도윤', 'lead'], ['이서준', 'key']],
    teamStart: '2017-11-01',
    lps: [['가온 캐피탈', 30], ['다온 생명보험', 25], ['한빛 성장금융', 20], ['미래 연금기금', 20]],
    gp: 5,
    proposed: '2017-12-01',
    decided: '2018-01-15',
    rosterDate: '2018-02-01',
    initialCall: { date: '2018-02-20', amount: 20, paid: '2018-02-26' },
    formationMeeting: '2018-03-02',
    registration: ['2018-03-05', '2018-03-20'],
    institutions: [['custodian', '하나로은행 강남지점'], ['administrator', '바른펀드서비스'], ['auditor', '새길회계법인']],
    calls: [['2018-06-01', 40, '2018-06-05'], ['2019-06-03', 30, '2019-06-07']],
    feeQuarters: [[2018, 1, '2018-03-30'], [2018, 2, '2018-06-29'], [2018, 3, '2018-09-28'], [2018, 4, '2018-12-31'], [2019, 1, '2019-03-29']],
    expenses: [['audit', '2018 사업연도 회계감사 수수료', '새길회계법인', 2000 * 만, '2019-03-29'], ['audit', '2019 사업연도 회계감사 수수료', '새길회계법인', 2000 * 만, '2020-03-30'], ['custody', '2021년 수탁보수', '하나로은행', 1000 * 만, '2021-12-30']],
    companies: [
      // [이름, 업종, 대표, 투자일, 투자액(억), 형태, 주목적, 평가액(억, 2020-12-31)]
      ['스텔라로보틱스', '협동로봇', '문태양', '2018-06-11', 20, 'rcps', true, 45],
      ['하이브랩', '바이오 소재', '김하늘', '2018-07-16', 15, 'rcps', true, 18],
      ['온다이렉트', 'D2C 커머스', '박온유', '2019-06-10', 15, 'common', false, 8],
      ['페어링스', '데이팅 앱', '이다정', '2019-08-01', 10, 'cb', true, 12],
      ['트리니티메드', '의료기기', '최세영', '2020-02-03', 10, 'rcps', true, 10],
    ],
    exits: [
      // [기업, 형태, 회수일, 처분대가(억), 메모]
      ['스텔라로보틱스', 'ipo', '2021-11-10', 70, '코스닥 상장 후 보호예수 해제분 장내 매각'],
      ['하이브랩', 'trade_sale', '2022-05-20', 25, '전략적 투자자에 구주 매각'],
      ['온다이렉트', 'write_off', '2023-03-31', 0, '폐업에 따른 상각'],
      ['페어링스', 'm_and_a', '2024-09-10', 22, '플랫폼 기업에 인수'],
      ['트리니티메드', 'redemption', '2025-06-30', 12, 'RCPS 상환'],
    ],
    distributions: [['2021-12-15', 60, '스텔라로보틱스 매각 대금 분배'], ['2022-06-30', 25, '하이브랩 매각 대금 분배'], ['2024-10-15', 20, '페어링스 M&A 대금 분배']],
    dissolutionMeeting: '2026-03-10',
    finalDistribution: '2026-04-20',
    closeYears: [2018, 2025],
  },
  {
    name: '브릿지 2호 벤처투자조합',
    stopAt: 'dissolved',
    fund: { fund_type: 'venture', gp_type: 'venture_capital', target_amount: 80 * 억, term_years: 7, investment_period_years: 4 },
    terms: { primary_purpose: '성장 단계 ICT 기업', unit_amount: 10_000_000, primary_purpose_min_ratio: 0.5, gp_commitment_min_ratio: 0.01, management_fee_rate: 0.02, management_fee_rate_after: 0.015, carry_rate: 0.2, hurdle_rate: 0.06, quorum_ratio: 0.5 },
    team: [['이서준', 'lead'], ['백지민', 'key']],
    teamStart: '2018-05-01',
    lps: [['한빛 성장금융', 25], ['미래 연금기금', 20], ['온누리 은행', 15], ['라온 전자', 15]],
    gp: 5,
    proposed: '2018-06-01',
    decided: '2018-07-02',
    rosterDate: '2018-07-20',
    initialCall: { date: '2018-08-01', amount: 20, paid: '2018-08-06' },
    formationMeeting: '2018-08-10',
    registration: ['2018-08-13', '2018-08-31'],
    institutions: [['custodian', '온누리은행 여의도지점'], ['administrator', '한결펀드서비스'], ['auditor', '정도회계법인']],
    calls: [['2019-03-04', 30, '2019-03-06'], ['2020-03-02', 20, '2020-03-06']],
    feeQuarters: [[2018, 3, '2018-09-28'], [2018, 4, '2018-12-31'], [2019, 1, '2019-03-29'], [2019, 2, '2019-06-28'], [2019, 3, '2019-09-30'], [2019, 4, '2019-12-31']],
    expenses: [['audit', '2018 사업연도 회계감사 수수료', '정도회계법인', 1500 * 만, '2019-03-29'], ['audit', '2019 사업연도 회계감사 수수료', '정도회계법인', 1500 * 만, '2020-03-30']],
    companies: [
      ['데이터브릭스랩', '데이터 인프라', '윤지호', '2018-09-10', 15, 'rcps', true, 30],
      ['스마트팩토리원', '제조 SaaS', '정민수', '2019-03-11', 20, 'rcps', true, 26],
      ['퀵배송', '라스트마일 물류', '한결', '2019-10-01', 12, 'common', false, 6],
      ['보이스AI', '음성 인식', '서다은', '2020-05-04', 10, 'rcps', true, 8],
    ],
    exits: [
      ['데이터브릭스랩', 'trade_sale', '2022-04-15', 33, '글로벌 PE에 구주 매각'],
      ['스마트팩토리원', 'm_and_a', '2023-11-20', 30, '대기업 계열사에 인수'],
      ['퀵배송', 'write_off', '2024-06-28', 0, '사업 중단에 따른 상각'],
    ],
    distributions: [['2022-05-31', 30, '데이터브릭스랩 매각 대금 분배'], ['2024-01-15', 25, '스마트팩토리원 M&A 대금 분배']],
    dissolutionMeeting: '2026-06-15',
    closeYears: [2018, 2025],
  },
];

// ─── 실행 ──────────────────────────────────────────────────────────────────

const log = (msg) => console.log(`  ${msg}`);

async function holdMeetingAllFor(F, input, U) {
  const m = await meetings.createMeeting(F, input, U);
  await meetings.conveneMeeting(F, m.id, U);
  const detail = await meetings.getMeeting(F, m.id);
  for (const a of detail.agendas) for (const v of detail.voters) await meetings.recordVote(F, m.id, a.id, v.member_id, 'for', U);
  await meetings.holdMeeting(F, m.id);
  return m.id;
}

async function payCall(F, input, paidDate, U) {
  const call = await calls.createCapitalCall(F, { call_all_unfunded: false, ...input }, U);
  await calls.issueCapitalCall(F, call.id, U);
  for (const it of (await calls.getCapitalCall(F, call.id)).items) {
    await calls.recordPayment(F, call.id, it.id, { paid_amount: it.call_amount, paid_date: paidDate, memo: null }, U);
  }
  return call.id;
}

async function runScenario(s, U) {
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

  // 최초 납입 → 결성총회 → 결성 → 등록 → 운용
  const initialCallId = await payCall(F, { total_call_amount: s.initialCall.amount * 억, call_date: s.initialCall.date, due_date: addDays(s.initialCall.date, 14), purpose: '최초 납입 (결성 시 출자)' }, s.initialCall.paid, U);
  await holdMeetingAllFor(F, { meeting_type: 'formation', meeting_date: s.formationMeeting, location: '본사 대회의실', agendas: [{ agenda_type: 'other', title: '수탁은행 선정의 건', description: null }] }, U);
  await transitions.transitionFund(F, 'formed');
  await institutions.updateRegistration(F, { registration_applied_date: s.registration[0], registration_completed_date: s.registration[1] });
  for (const [type, name] of s.institutions) await institutions.createInstitution(F, { institution_type: type, name, contact_name: null, contact_email: null, contact_phone: null }, U);
  await transitions.transitionFund(F, 'operating');
  log(`결성 ${s.formationMeeting} → 운용`);

  // 운용: 캐피탈콜·관리보수·비용·투자 (날짜순으로 넣어야 거래일 기준 현금 검사를 통과한다)
  const callIds = [initialCallId];
  const timeline = [
    ...s.calls.map(([date, amount, paid], i) => ({ date, run: async () => callIds.push(await payCall(F, { total_call_amount: amount * 억, call_date: date, due_date: addDays(date, 14), purpose: `제${i + 2}차 출자 (투자 재원)` }, paid, U)) })),
    ...s.feeQuarters.map(([y, q, date]) => ({ date, run: () => fees.chargeManagementFee(F, y, q, date, U) })),
    ...s.expenses.map(([type, description, payee, amount, date]) => ({ date, run: () => finance.createExpense(F, { expense_type: type, description, payee, amount, paid_date: date }, U) })),
  ];
  const companyIds = {};
  for (const [name, sector, ceo, date, amount, security, primary] of s.companies) {
    timeline.push({
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
        await investments.executeInvestment(F, { is_follow_on: false, deal_id: deal.id, company_id: null, investment_date: date, investment_amount: amount * 억, security_type: security, shares: null, price_per_share: null, is_primary_purpose: primary }, U);
      },
    });
  }
  timeline.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const t of timeline) await t.run();
  log(`캐피탈콜 ${callIds.length}회 · 관리보수 ${s.feeQuarters.length}분기 · 비용 ${s.expenses.length}건 · 투자 ${s.companies.length}건`);

  for (const [name, , , , , , , fair] of s.companies) {
    await portfolio.recordValuation(F, { company_id: companyIds[name], valuation_date: '2020-12-31', fair_value_amount: fair * 억, method: '유사기업 비교' }, U);
  }

  // 회수와 분배 (날짜순)
  const events = [
    ...s.exits.map(([name, type, date, proceeds, memo]) => ({ date, run: () => exits.recordExit(F, { company_id: companyIds[name], exit_type: type, exit_date: date, proceeds_amount: proceeds * 억, full_exit: true, cost_basis_amount: null, memo }, U) })),
    ...s.distributions.map(([date, amount, memo]) => ({
      date,
      run: async () => {
        const d = await dist.createDistribution(F, { distribution_date: date, distributable_amount: amount * 억, is_final: false, memo }, U);
        await dist.confirmDistribution(F, d.id, U);
        await dist.payDistribution(F, d.id, U);
      },
    })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const e of events) await e.run();
  log(`회수 ${s.exits.length}건 · 분배 ${s.distributions.length}회`);

  // 사업연도 결산 (과거 연도)
  for (let y = s.closeYears[0]; y <= s.closeYears[1]; y++) await accounting.closeFiscalYear(F, y, U);
  log(`결산 ${s.closeYears[0]}~${s.closeYears[1]} 사업연도`);

  // 해산: 해산총회 가결 → 해산. 발송한 캐피탈콜은 마감
  await holdMeetingAllFor(F, { meeting_type: 'dissolution', meeting_date: s.dissolutionMeeting, location: '본사 대회의실', agendas: [] }, U);
  await transitions.transitionFund(F, 'dissolved');
  const open = await sql`select id from capital_calls where fund_id = ${F} and status = 'issued'`; // 완납한 요청은 자동으로 마감되어 있다
  for (const { id } of open) await calls.closeCapitalCall(F, id);
  log(`해산 ${s.dissolutionMeeting}`);

  if (s.stopAt === 'liquidated') {
    const { cash_amount } = await finance.getFinanceSummary(F);
    const d = await dist.createDistribution(F, { distribution_date: s.finalDistribution, distributable_amount: cash_amount, is_final: true, memo: '청산에 따른 잔여 재산 분배' }, U);
    await dist.confirmDistribution(F, d.id, U);
    await dist.payDistribution(F, d.id, U);
    await transitions.transitionFund(F, 'liquidated');
    const [{ carry }] = await sql`
      select coalesce(sum(i.amount), 0)::bigint as carry from distribution_items i join distributions x on x.id = i.distribution_id
      where x.fund_id = ${F} and i.component = 'carried_interest'
    `;
    log(`최종 분배 ${(cash_amount / 억).toFixed(2)}억 (GP 성과보수 ${(carry / 억).toFixed(2)}억) → 청산 완료`);
  }

  // 과거 날짜로 만든 기록의 발송·확정 시각을 업무 날짜에 맞춘다
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
  // 통지 확인: LP 시스템이 확인을 알려온 것으로 (발송 3일 뒤)
  await sql`
    update notice_recipients r set acknowledged_at = n.sent_at + interval '3 days'
    from notices n where r.notice_id = n.id and n.fund_id = ${F} and n.status = 'sent'
  `;
}

try {
  const [demo] = await sql`select id from users where email = 'demo@vc-erp.dev'`;
  if (!demo) throw new Error('데모 계정이 없습니다. npm run db:seed-staff 를 먼저 실행하세요');
  const U = demo.id;

  // 결성 완료 단계: 결성 조건이 준비된 모집 중 조합 하나를 결성한다
  const [green] = await sql`select id, name, status from funds where name = '그린에너지 신기술투자조합'`;
  if (green?.status === 'fundraising') {
    const check = await transitions.checkTransition(green.id, 'formed');
    if (check.ready) {
      await transitions.transitionFund(green.id, 'formed');
      console.log(`• ${green.name}: 결성 처리 (결성 완료 단계)`);
    } else {
      console.log(`• ${green.name}: 결성 조건 미충족으로 건너뜀 (${check.conditions.filter((c) => !c.met).map((c) => c.label).join(', ')})`);
    }
  }

  for (const s of SCENARIOS) await runScenario(s, U);

  const byStatus = await sql`select status, count(*)::int as n from funds group by status order by status`;
  console.log('\n조합 단계별', Object.fromEntries(byStatus.map((r) => [r.status, r.n])));
} catch (err) {
  console.error('✖ 샘플 데이터 생성 실패:', err.code ?? '', err.message, err.details ? JSON.stringify(err.details) : '');
  process.exitCode = 1;
} finally {
  await sql.end();
}
