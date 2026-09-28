// 샘플 데이터 2: 기업·딜 파이프라인 + 운용 중인 조합 (R4 화면용)
//
// · 기업 8~10개, 딜 10~12건(발굴·검토·투심위·투자 확정·드롭)을 만든다
// · "로컬크리에이터 초기투자조합"을 결성 → 등록 → 운용까지 진행하고,
//   2차 캐피탈콜·관리보수·투자 집행(신규·후속)·기업가치 평가를 채운다
// · 결성·등록·캐피탈콜·관리보수·투자·평가는 화면·API와 같은 서비스 함수를 거친다 (업무 규칙 검사 통과)
// · 딜은 보드에서 단계별 체류일이 보이도록 단계 이력 시각을 과거로 넣는다 (허용된 이동 순서만 사용)
// · 기업이 하나라도 있으면 실행하지 않는다. npm run db:seed-sample 을 먼저 실행해야 한다
// · ⚠️ 원장·투자·단계 이력은 지울 수 없는 기록이다 (개발 DB에서만 실행)
//
// 사용법: npm run db:seed-sample-deals

import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve('.') } });
const { sql } = await jiti.import('@/lib/db.ts');
const transitions = await jiti.import('@/lib/services/fund-transitions.ts');
const institutions = await jiti.import('@/lib/services/institutions.ts');
const calls = await jiti.import('@/lib/services/capital-calls.ts');
const fees = await jiti.import('@/lib/services/management-fees.ts');
const investments = await jiti.import('@/lib/services/investments.ts');
const portfolio = await jiti.import('@/lib/services/portfolio.ts');

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const daysAgo = (n) => addDays(TODAY, -n);
const ts = (daysBack, hour = 10) => new Date(Date.parse(`${daysAgo(daysBack)}T${String(hour).padStart(2, '0')}:00:00+09:00`));
const floorTo = (v, unit) => Math.floor(v / unit) * unit;
const EOK = 100_000_000;

const COMPANIES = [
  { name: '넥스트랩', sector: 'AI 반도체', ceo_name: '윤재현' },
  { name: '그린셀', sector: '2차전지 소재', ceo_name: '한소영' },
  { name: '메디브릿지', sector: '디지털 헬스케어', ceo_name: '오민석' },
  { name: '루트로지스', sector: '물류 자동화', ceo_name: '장태오' },
  { name: '핀플로우', sector: '핀테크', ceo_name: '서하람' },
  { name: '바이오젠텍', sector: '바이오 신약', ceo_name: '임도경' },
  { name: '에듀스페이스', sector: '에듀테크', ceo_name: '강지후' },
  { name: '팜테크', sector: '스마트팜', ceo_name: '노은채' },
  { name: '클라우드웍스', sector: 'B2B SaaS', ceo_name: '배준호' },
  { name: '모빌리티원', sector: '모빌리티', ceo_name: '홍세린' },
];
const DROP_REASONS = ['밸류에이션 이견', '시장 규모 불확실', '창업팀 역량 우려', '경쟁사 대비 차별성 부족'];
const NOTES = {
  sourcing: ['IR 자료 수령, 첫 미팅 일정 조율 중', '지인 추천으로 소개받음'],
  reviewing: ['재무제표 3개년 검토 완료', '고객 인터뷰 3곳 진행, 재구매 의향 높음', '경쟁사 비교표 작성'],
  ic: ['투심위 1차: 시장 규모 추가 자료 요청', '밸류 조정 후 재상정 예정'],
  approved: ['투심위 만장일치 통과', '투자계약서 날인 일정 확정'],
  dropped: ['내부 논의 결과 이번 조합에서는 보류'],
};
// 단계별 경로 (허용된 이동만)
const PATHS = {
  sourcing: ['sourcing'],
  reviewing: ['sourcing', 'reviewing'],
  ic: ['sourcing', 'reviewing', 'ic'],
  ic_back: ['sourcing', 'reviewing', 'ic', 'reviewing'], // 투심위 보완 요청으로 되돌아간 딜
  approved: ['sourcing', 'reviewing', 'ic', 'approved'],
  dropped_early: ['sourcing', 'dropped'],
  dropped_ic: ['sourcing', 'reviewing', 'ic', 'dropped'],
};

try {
  const [{ count }] = await sql`select count(*)::int as count from companies`;
  if (count > 0) {
    console.log(`이미 기업이 ${count}개 있어 실행하지 않습니다 (중복 생성 방지).`);
    process.exit(0);
  }
  const [demo] = await sql`select id from users where email = 'demo@vc-erp.dev'`;
  if (!demo) throw new Error('데모 계정이 없습니다. npm run db:seed-staff 를 먼저 실행하세요');
  const U = demo.id;
  const [target] = await sql`select id, name from funds where name = '로컬크리에이터 초기투자조합'`;
  if (!target) throw new Error('로컬크리에이터 초기투자조합이 없습니다. npm run db:seed-sample 을 먼저 실행하세요');
  const F = target.id;
  const others = await sql`select id, name from funds where id <> ${F} and status in ('planning', 'fundraising') order by created_at`;
  const owners = await sql`select u.id from users u left join staff s on s.user_id = u.id where u.disabled_at is null and (s.id is null or s.left_date is null)`;

  // ─── 1. 로컬크리에이터: 결성 → 등록 → 운용 ──────────────────────────────
  const check = await transitions.checkTransition(F, 'formed');
  if (!check.ready) throw new Error(`결성 조건이 충족되지 않았습니다: ${check.conditions.filter((c) => !c.met).map((c) => c.label).join(', ')}`);
  await transitions.transitionFund(F, 'formed');
  const [{ formation_date: formed }] = await sql`select formation_date::text as formation_date from funds where id = ${F}`;
  const applied = addDays(formed, 1);
  const completed = addDays(formed, Math.min(4, Math.max(1, Math.floor((Date.parse(TODAY) - Date.parse(formed)) / 86_400_000) - 3)));
  await institutions.updateRegistration(F, { registration_applied_date: applied, registration_completed_date: completed });
  for (const [type, name, contact] of [['custodian', '온누리은행 여의도지점', '김수탁'], ['administrator', '한결펀드서비스', '이사무'], ['auditor', '정도회계법인', '박감사']]) {
    await institutions.createInstitution(F, { institution_type: type, name, contact_name: contact, contact_email: null, contact_phone: `02-${rand(3000, 7999)}-${rand(1000, 9999)}` }, U);
  }
  await transitions.transitionFund(F, 'operating');
  console.log(`✔ ${target.name}: 결성(${formed}) → 등록 완료(${completed}) → 운용 중, 관계 기관 3곳`);

  // ─── 2. 2차 캐피탈콜 (투자 재원) ────────────────────────────────────────
  const [{ commitment }] = await sql`select total_commitment_amount as commitment from v_fund_summary where fund_id = ${F}`;
  const call2Amount = floorTo((commitment * rand(35, 45)) / 100, 1_000_000);
  const callDate = addDays(completed, 1) <= daysAgo(2) ? addDays(completed, 1) : daysAgo(2);
  const call2 = await calls.createCapitalCall(F, { total_call_amount: call2Amount, call_all_unfunded: false, call_date: callDate, due_date: addDays(callDate, 14), purpose: '투자 재원 및 관리보수' }, U);
  await calls.issueCapitalCall(F, call2.id, U);
  const items = (await calls.getCapitalCall(F, call2.id)).items;
  for (const [i, it] of items.entries()) {
    if (i === items.length - 1 && items.length > 2) continue; // 한 곳은 아직 미납 (기한 전)
    await calls.recordPayment(F, call2.id, it.id, { paid_amount: it.call_amount, paid_date: addDays(callDate, 1) > TODAY ? TODAY : addDays(callDate, 1), memo: null }, U);
  }
  console.log(`✔ 2차 캐피탈콜 ${call2Amount.toLocaleString('ko-KR')}원 발송·납입 (1곳 미납)`);

  // ─── 3. 관리보수 (이번 분기) ─────────────────────────────────────────────
  const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const fee = await fees.chargeManagementFee(F, kst.getFullYear(), Math.floor(kst.getMonth() / 3) + 1, TODAY, U);
  console.log(`✔ 관리보수 ${fee.total_fee_amount.toLocaleString('ko-KR')}원 청구`);

  // ─── 4. 기업 ─────────────────────────────────────────────────────────────
  const companies = [];
  for (const c of shuffle(COMPANIES).slice(0, rand(8, 10))) {
    const d = String(rand(1_000_000_000, 9_999_999_999));
    const [row] = await sql`
      insert into companies (name, registration_no, sector, ceo_name, founded_date, created_by)
      values (${c.name}, ${`${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`}, ${c.sector}, ${c.ceo_name}, ${`${rand(2016, 2024)}-${String(rand(1, 12)).padStart(2, '0')}-01`}, ${U})
      returning id, name
    `;
    companies.push(row);
  }
  console.log(`✔ 기업 ${companies.length}개`);

  // ─── 5. 딜 (단계 이력을 과거 시각으로) ──────────────────────────────────
  // 앞 3개 기업은 로컬크리에이터로 투자 확정, 1개는 다른 조합으로 확정, 나머지는 진행 중·드롭
  const plan = ['approved', 'approved', 'approved', 'approved', 'ic', 'ic_back', 'reviewing', 'reviewing', 'sourcing', 'dropped_early', 'dropped_ic', 'sourcing'];
  const deals = [];
  for (const [i, kind] of plan.slice(0, Math.max(companies.length, 10)).entries()) {
    const company = companies[i % companies.length];
    const stages = PATHS[kind];
    const final = stages.at(-1);
    const toTarget = final === 'approved' && i < 3;
    const fundId = toTarget ? F : final === 'approved' || Math.random() < 0.5 ? (others[0]?.id ?? F) : null;
    const expected = final === 'approved' || fundId ? rand(3, 15) * EOK / 10 * 10 : null;
    // 단계마다 5~20일씩 머문 것으로, 마지막 단계는 오늘로부터 2~45일 전에 들어온 것으로
    let back = rand(2, 45) + stages.length * rand(8, 18);
    const sourced = daysAgo(back);
    const owner = pick(owners).id;
    const [deal] = await sql`
      insert into deals (company_id, target_fund_id, stage, expected_amount, owner_id, sourced_date, drop_reason, created_by, created_at)
      values (${company.id}, ${fundId}, ${final}, ${expected}, ${owner}, ${sourced}, ${final === 'dropped' ? pick(DROP_REASONS) : null}, ${owner}, ${ts(back)})
      returning id
    `;
    let prev = null;
    for (const [j, st] of stages.entries()) {
      if (j > 0) back -= rand(5, 20);
      back = Math.max(back, 1);
      await sql`insert into deal_stage_history (deal_id, from_stage, to_stage, changed_by, changed_at) values (${deal.id}, ${prev}, ${st}, ${owner}, ${ts(back, 9 + j)})`;
      if (Math.random() < 0.7) await sql`insert into deal_notes (deal_id, stage, content, created_by, created_at) values (${deal.id}, ${st}, ${pick(NOTES[st])}, ${owner}, ${ts(back, 14 + j)})`;
      prev = st;
    }
    deals.push({ id: deal.id, company, final, toTarget, expected });
  }
  console.log(`✔ 딜 ${deals.length}건 (${Object.entries(deals.reduce((m, d) => ({ ...m, [d.final]: (m[d.final] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(', ')})`);

  // ─── 6. 투자 집행 (신규 3건 + 후속 1건) ─────────────────────────────────
  const summary = await investments.getInvestmentSummary(F);
  const budget = Math.min(summary.cash_amount, summary.investable_amount);
  const shares = [0.3, 0.25, 0.2];
  const invested = [];
  for (const [i, d] of deals.filter((x) => x.toTarget).entries()) {
    const amount = floorTo(budget * shares[i], 10_000_000);
    const price = pick([5_000, 12_000, 25_000, 48_000]);
    const date = addDays(completed, i + 1) > TODAY ? TODAY : addDays(completed, i + 1);
    await investments.executeInvestment(F, {
      is_follow_on: false, deal_id: d.id, company_id: null, investment_date: date, investment_amount: amount,
      security_type: pick(['rcps', 'rcps', 'common', 'cb']), shares: Math.floor(amount / price), price_per_share: price, is_primary_purpose: i !== 2,
    }, U);
    invested.push({ ...d, amount, date });
  }
  const follow = invested[0];
  const followAmount = floorTo(budget * 0.1, 10_000_000);
  await investments.executeInvestment(F, {
    is_follow_on: true, deal_id: null, company_id: follow.company.id, investment_date: TODAY, investment_amount: followAmount,
    security_type: 'rcps', shares: null, price_per_share: null, is_primary_purpose: true,
  }, U);
  console.log(`✔ 투자 집행: 신규 ${invested.length}건 + 후속 1건 (${follow.company.name})`);

  // ─── 7. 기업가치 평가 ───────────────────────────────────────────────────
  for (const [i, d] of invested.slice(0, 2).entries()) {
    const multiple = i === 0 ? 1.6 : 0.8; // 하나는 가치 상승, 하나는 하락
    const base = d.amount + (i === 0 ? followAmount : 0);
    await portfolio.recordValuation(F, { company_id: d.company.id, valuation_date: TODAY, fair_value_amount: Math.round(base * multiple), method: i === 0 ? '후속 투자 단가' : '유사기업 비교' }, U);
  }
  console.log('✔ 기업가치 평가 2건');

  const after = await investments.getInvestmentSummary(F);
  console.log('\n로컬크리에이터', {
    약정: after.total_commitment_amount, 누적투자: after.total_invested_amount, 투자가능잔액: after.investable_amount,
    현금: after.cash_amount, 주목적비율: after.primary_purpose_ratio, 경고: after.warnings.map((w) => w.level),
  });
} catch (err) {
  console.error('✖ 샘플 데이터 생성 실패:', err.code ?? '', err.message, err.details ? JSON.stringify(err.details) : '');
  process.exitCode = 1;
} finally {
  await sql.end();
}
