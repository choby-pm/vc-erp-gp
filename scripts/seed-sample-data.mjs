// 샘플 업무 데이터 생성 스크립트
//
// 화면을 둘러볼 수 있도록 출자자·구성원·조합과 조합별 진행 기록을 무작위로 만든다.
// 조합마다 진행 단계가 달라서(기획 → 모집 → 명부 확정 → 결성총회 → 최초 납입) 모든 화면에 데이터가 보인다.
//
// · 화면·API와 똑같은 서비스 함수(lib/services)를 거쳐 저장하므로 업무 규칙 검사를 모두 통과한 데이터만 들어간다
// · 조합이 하나라도 있으면 실행하지 않는다 (중복 생성 방지). 다시 만들려면 DB를 비운 뒤 실행한다
// · ⚠️ 원장·연동 이벤트는 수정·삭제할 수 없는 기록이라, 한 번 넣으면 지우기 어렵다 (개발 DB에서만 실행)
//
// 사용법: npm run db:seed-sample

import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve('.') } });
const { sql } = await jiti.import('@/lib/db.ts');
const funds = await jiti.import('@/lib/services/funds.ts');
const lps = await jiti.import('@/lib/services/lps.ts');
const staffSvc = await jiti.import('@/lib/services/staff.ts');
const managers = await jiti.import('@/lib/services/fund-managers.ts');
const proposals = await jiti.import('@/lib/services/proposals.ts');
const transitions = await jiti.import('@/lib/services/fund-transitions.ts');
const roster = await jiti.import('@/lib/services/roster.ts');
const meetings = await jiti.import('@/lib/services/meetings.ts');
const calls = await jiti.import('@/lib/services/capital-calls.ts');

// ─── 무작위 도우미 ──────────────────────────────────────────────────────────

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const EOK = 100_000_000; // 1억
const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const daysAgo = (n) => addDays(TODAY, -n);
const maxDate = (a, b) => (a > b ? a : b);
const regNo = () => {
  const d = String(rand(1_000_000_000, 9_999_999_999));
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
};

// ─── 샘플 원천 ─────────────────────────────────────────────────────────────

const LP_POOL = [
  { name: '한빛 성장금융', lp_type: 'policy', contact_name: '박지훈' },
  { name: '누리 모태투자', lp_type: 'policy', contact_name: '윤서영' },
  { name: '새솔 교직원공제회', lp_type: 'pension', contact_name: '정우성' },
  { name: '미래 연금기금', lp_type: 'pension', contact_name: '한예린' },
  { name: '가온 캐피탈', lp_type: 'financial', contact_name: '오세훈' },
  { name: '다온 생명보험', lp_type: 'financial', contact_name: '서지우' },
  { name: '온누리 은행', lp_type: 'financial', contact_name: '김태희' },
  { name: '라온 전자', lp_type: 'corporate', contact_name: '이도현' },
  { name: '해솔 바이오', lp_type: 'corporate', contact_name: '최유진' },
  { name: '김민준', lp_type: 'individual' },
  { name: '이서윤', lp_type: 'individual' },
  { name: '박하준', lp_type: 'individual' },
];

const EXTRA_STAFF = [
  { name: '강다인', position: '수석심사역', department: '투자본부' },
  { name: '문성호', position: '심사역', department: '투자본부' },
  { name: '백지민', position: '파트너', department: '투자본부' },
  { name: '신유나', position: '선임심사역', department: '투자본부' },
  { name: '홍준기', position: '회계담당', department: '경영지원팀' },
];

// 조합 이름과 유형. 단계는 아래 STAGES 순서대로 배정한다
const FUND_POOL = [
  { name: '그로스 1호 벤처투자조합', fund_type: 'venture', gp_type: 'venture_capital', purpose: '업력 7년 이내 중소·벤처기업' },
  { name: '딥테크 스케일업 투자조합', fund_type: 'venture', gp_type: 'venture_capital', purpose: '딥테크 분야 창업기업' },
  { name: '넥스트 바이오 벤처투자조합', fund_type: 'venture', gp_type: 'venture_capital', purpose: '바이오·헬스케어 기업' },
  { name: 'AI 퓨처 벤처투자조합', fund_type: 'venture', gp_type: 'venture_capital', purpose: '인공지능 기술 기반 기업' },
  { name: '그린에너지 신기술투자조합', fund_type: 'new_tech', gp_type: 'new_tech_finance', purpose: '신재생에너지 신기술사업자' },
  { name: '로컬크리에이터 초기투자조합', fund_type: 'venture', gp_type: 'accelerator', purpose: '업력 3년 이내 초기 창업기업' },
  { name: '소셜임팩트 개인투자조합', fund_type: 'individual', gp_type: 'other', purpose: '사회적기업·소셜벤처' },
  { name: '모빌리티 이노베이션 투자조합', fund_type: 'venture', gp_type: 'venture_capital', purpose: '모빌리티·물류 기술 기업' },
  { name: '콘텐츠 글로벌 벤처투자조합', fund_type: 'venture', gp_type: 'venture_capital', purpose: '콘텐츠·미디어 기업' },
];

// 조합별 진행 단계 (앞쪽 5개는 반드시 포함해 모든 화면이 채워지게 한다)
const STAGES = ['planning', 'fundraising', 'roster', 'meeting_scheduled', 'initial_call', 'ready', 'fundraising', 'roster', 'planning'];

const STAGE_LABEL = {
  planning: '기획 (운용 인력·제안 초안)',
  fundraising: '모집 중 (제안 발송·검토·확약·거절)',
  roster: '명부 확정 (취소 이력 포함)',
  meeting_scheduled: '결성총회 소집·일부 투표 + 최초 납입 초안',
  initial_call: '결성총회 가결 + 최초 납입 일부 납입',
  ready: '결성총회 가결 + 최초 납입 완납',
};

// ─── 실행 ──────────────────────────────────────────────────────────────────

try {
  const [{ count }] = await sql`select count(*)::int as count from funds`;
  if (count > 0) {
    console.log(`이미 조합이 ${count}개 있어 실행하지 않습니다 (중복 생성 방지).`);
    process.exit(0);
  }
  const [user] = await sql`select id from users where email = 'demo@vc-erp.dev'`;
  if (!user) throw new Error('데모 계정이 없습니다. npm run db:seed-staff 를 먼저 실행하세요');
  const U = user.id;

  // 1. 출자자 (8~10곳)
  const lpList = [];
  for (const lp of shuffle(LP_POOL).slice(0, rand(8, 10))) {
    const individual = lp.lp_type === 'individual';
    const { id } = await lps.createLp(
      {
        name: lp.name,
        lp_type: lp.lp_type,
        registration_no: individual ? null : regNo(),
        contact_name: lp.contact_name ?? null,
        contact_email: individual ? null : `contact${rand(10, 99)}@${['hanbit', 'nuri', 'saesol', 'mirae', 'gaon', 'daon', 'onnuri', 'raon', 'haesol'][rand(0, 8)]}.example`,
        contact_phone: `02-${rand(1000, 9999)}-${rand(1000, 9999)}`,
        memo: Math.random() < 0.4 ? pick(['연 1회 정기 출자 심사', '바이오 분야 선호', '출자 한도 50억', '담당자 교체 예정']) : null,
      },
      U,
    );
    lpList.push({ id, ...lp });
  }
  console.log(`✔ 출자자 ${lpList.length}곳`);

  // 2. 구성원 추가 (3~5명, 로그인 계정 없음)
  const extra = shuffle(EXTRA_STAFF).slice(0, rand(3, 5));
  for (const [i, s] of extra.entries()) {
    const year = rand(2018, 2024);
    await staffSvc.createStaff(
      {
        employee_no: `GP-${year}-${String(100 + i).padStart(3, '0')}`,
        ...s,
        email: null,
        phone: `010-${rand(1000, 9999)}-${rand(1000, 9999)}`,
        hired_date: `${year}-${String(rand(1, 12)).padStart(2, '0')}-01`,
      },
      false,
      U,
    );
  }
  const staff = await sql`select id, name, hired_date::text as hired_date from staff where left_date is null`;
  console.log(`✔ 구성원 ${extra.length}명 추가 (재직 ${staff.length}명)`);

  // 3. 조합 (6~9개)
  const fundCount = rand(6, 9);
  for (const [i, base] of FUND_POOL.slice(0, fundCount).entries()) {
    const stage = STAGES[i];
    const individual = base.fund_type === 'individual';
    const unit = individual ? 1_000_000 : pick([1_000_000, 10_000_000]);
    const target = individual ? rand(3, 15) * EOK : rand(10, 50) * 10 * EOK;
    const { id: F } = await funds.createFund(
      { name: base.name, fund_type: base.fund_type, gp_type: base.gp_type, target_amount: target, term_years: rand(7, 10), investment_period_years: rand(3, 5) },
      {
        primary_purpose: base.purpose,
        unit_amount: unit,
        primary_purpose_min_ratio: pick([0.4, 0.5, 0.6]),
        gp_commitment_min_ratio: 0.01,
        management_fee_rate: pick([0.015, 0.02, 0.025]),
        management_fee_rate_after: pick([0.01, 0.015]),
        carry_rate: pick([0.15, 0.2]),
        hurdle_rate: pick([0.05, 0.06, 0.07]),
        quorum_ratio: pick([0.5, 0.666667]),
      },
      U,
    );

    // 운용 인력: 대표 1명 + 핵심·운용 1~3명. 일부 조합은 교체 이력을 남긴다
    const team = shuffle(staff).slice(0, rand(2, 4));
    const start = (s) => maxDate(daysAgo(rand(60, 120)), s.hired_date);
    for (const [j, s] of team.entries()) {
      await managers.appointManager(F, { staff_id: s.id, role: j === 0 ? 'lead' : pick(['key', 'general']), start_date: start(s), replaces_id: null, agenda_id: null }, U);
    }
    if (Math.random() < 0.4) {
      const current = (await managers.listFundManagers(F)).current.find((m) => m.role !== 'lead');
      const next = staff.find((s) => !team.includes(s));
      if (current && next) {
        await managers.appointManager(F, { staff_id: next.id, role: current.role, start_date: maxDate(maxDate(current.start_date, next.hired_date), daysAgo(20)), replaces_id: current.id, agenda_id: null }, U);
      }
    }

    // 출자 제안: 5~8곳. 개인투자조합은 개인 위주, 그 외는 기관 위주
    const pool = lpList.filter((lp) => (individual ? true : lp.lp_type !== 'individual'));
    const chosen = shuffle(pool).slice(0, Math.min(pool.length, rand(5, 8)));
    const perLp = Math.max(unit, Math.floor(target / Math.max(2, chosen.length - 2) / unit) * unit);
    const created = [];
    for (const lp of chosen) {
      const amount = Math.max(unit, Math.round((perLp * rand(6, 14)) / 10 / unit) * unit);
      const proposed_date = daysAgo(rand(45, 80));
      await proposals.createProposal(F, { lp_id: lp.id, proposed_amount: amount, proposed_date, memo: Math.random() < 0.3 ? pick(['IR 미팅 완료', '투자위원회 상정 예정', '추가 자료 요청']) : null }, U);
      created.push({ lp, amount, proposed_date });
    }
    const pid = async (lpId) => (await proposals.listProposals(F)).items.find((p) => p.lp_id === lpId).id;

    if (stage === 'planning') {
      console.log(`✔ ${base.name} — ${STAGE_LABEL[stage]}`);
      continue;
    }

    // 모집 시작 → 제안 발송 → 단계 이동
    await transitions.transitionFund(F, 'fundraising');
    const committed = [];
    for (const [j, c] of created.entries()) {
      const id = await pid(c.lp.id);
      if (Math.random() < 0.85) await proposals.sendProposal(F, id, U);
      // 명부 단계 이상은 확약이 충분해야 하므로 앞쪽 제안은 확약으로 둔다
      const needCommit = stage !== 'fundraising' && j < Math.max(3, created.length - 2);
      const r = needCommit ? 1 : Math.random();
      const decided_date = addDays(c.proposed_date, rand(10, 30));
      if (r > 0.55) {
        const loc = Math.max(unit, Math.round((c.amount * rand(7, 11)) / 10 / unit) * unit);
        await proposals.transitionProposal(F, id, { to_status: 'committed', loc_amount: loc, decided_date });
        committed.push({ id, loc, lp: c.lp });
      } else if (r > 0.4) {
        await proposals.transitionProposal(F, id, { to_status: 'declined', loc_amount: null, decided_date });
      } else if (r > 0.15) {
        await proposals.transitionProposal(F, id, { to_status: 'reviewing', loc_amount: null, decided_date: null });
      }
    }
    if (stage === 'fundraising') {
      console.log(`✔ ${base.name} — ${STAGE_LABEL[stage]}`);
      continue;
    }

    // 명부 확정: GP는 약정 총액의 2~5% (의무 비율 1% 이상)
    const lpTotal = committed.reduce((s, c) => s + c.loc, 0);
    const gp = Math.ceil((lpTotal * rand(2, 5)) / 100 / unit) * unit;
    const members = committed.map((c) => ({ proposal_id: c.id, commitment_amount: c.loc }));
    const confirmDate = daysAgo(rand(12, 14)); // 확약일(최대 15일 전) 이후
    if (stage === 'roster') {
      // 취소 이력을 보여주려고 한 번 확정했다가 취소하고 다시 확정한다
      await roster.confirmRoster(F, { confirmed_date: confirmDate, gp_commitment_amount: gp, members: members.slice(0, -1) }, U);
      await roster.cancelRoster(F, `${committed.at(-1).lp.name} 확약 반영 누락`, U);
    }
    await roster.confirmRoster(F, { confirmed_date: confirmDate, gp_commitment_amount: gp, members }, U);
    if (stage === 'roster') {
      console.log(`✔ ${base.name} — ${STAGE_LABEL[stage]}`);
      continue;
    }

    // 결성총회
    const future = stage === 'meeting_scheduled';
    const meetingDate = future ? addDays(TODAY, rand(5, 14)) : daysAgo(rand(8, 12));
    const extraAgenda = [{ agenda_type: 'other', title: pick(['수탁은행 선정의 건', '회계감사인 선임의 건', '투자심의위원회 구성의 건']), description: null }];
    const m = await meetings.createMeeting(F, { meeting_type: 'formation', meeting_date: meetingDate, location: pick(['본사 대회의실', '화상 회의', '여의도 IFC 회의실']), agendas: extraAgenda }, U);
    await meetings.conveneMeeting(F, m.id, U);
    const detail = await meetings.getMeeting(F, m.id);
    for (const agenda of detail.agendas) {
      for (const v of detail.voters) {
        if (future && Math.random() < 0.5) continue; // 예정된 총회는 일부만 투표
        const choice = v.member_type === 'gp' || Math.random() < 0.85 ? 'for' : pick(['against', 'abstain']);
        await meetings.recordVote(F, m.id, agenda.id, v.member_id, choice, U);
      }
    }
    if (!future) {
      // 가결되도록 결성 안건은 전원 찬성으로 맞춘다
      for (const v of detail.voters) await meetings.recordVote(F, m.id, detail.agendas[0].id, v.member_id, 'for', U);
      await meetings.holdMeeting(F, m.id);
    }

    // 최초 납입: 약정 총액의 10~30%
    const total = lpTotal + gp;
    const callAmount = Math.floor((total * rand(10, 30)) / 100 / 1_000_000) * 1_000_000;
    const callDate = future ? TODAY : daysAgo(rand(5, 7));
    const call = await calls.createCapitalCall(F, { total_call_amount: callAmount, call_all_unfunded: false, call_date: callDate, due_date: addDays(callDate, future ? 14 : 3), purpose: '최초 납입 (결성 시 출자)' }, U);
    if (!future) {
      await calls.issueCapitalCall(F, call.id, U);
      const items = (await calls.getCapitalCall(F, call.id)).items;
      for (const [j, it] of items.entries()) {
        const payDate = addDays(callDate, rand(0, 3));
        if (stage === 'ready' || j === 0) {
          await calls.recordPayment(F, call.id, it.id, { paid_amount: it.call_amount, paid_date: payDate, memo: null }, U);
        } else if (j === 1) {
          // 일부 납입 (두 번에 나눠 내는 중)
          await calls.recordPayment(F, call.id, it.id, { paid_amount: Math.floor(it.call_amount / 2), paid_date: payDate, memo: '1차 분할 납입' }, U);
        } else if (Math.random() < 0.5) {
          await calls.recordPayment(F, call.id, it.id, { paid_amount: it.call_amount, paid_date: payDate, memo: null }, U);
        }
      }
    }
    console.log(`✔ ${base.name} — ${STAGE_LABEL[stage]}`);
  }

  const [c] = await sql`
    select (select count(*) from funds)::int as funds, (select count(*) from limited_partners)::int as lps,
           (select count(*) from staff)::int as staff, (select count(*) from fund_managers)::int as managers,
           (select count(*) from lp_proposals)::int as proposals, (select count(*) from fund_members)::int as members,
           (select count(*) from general_meetings)::int as meetings, (select count(*) from capital_calls)::int as calls,
           (select count(*) from ledger_entries)::int as ledger, (select count(*) from notices)::int as notices
  `;
  console.log('\n합계', c);
} catch (err) {
  console.error('✖ 샘플 데이터 생성 실패:', err.code ?? '', err.message, err.details ? JSON.stringify(err.details) : '');
  process.exitCode = 1;
} finally {
  await sql.end();
}
