// 샘플 데이터 3: 회수·분배 (R6 화면용)
//
// · 운용 중인 "로컬크리에이터 초기투자조합"에 회수 5건(일부 매각·상환·M&A, 이익·손실 섞어서)과
//   분배 3건(1·2차 지급 완료, 3차 확정 후 지급 대기)을 만든다
// · 화면·API와 같은 서비스 함수를 거친다 (업무 규칙 검사 + 자동 분개 + LP 통지)
// · 이 조합에 회수가 하나라도 있으면 실행하지 않는다. npm run db:seed-sample-deals 를 먼저 실행해야 한다
// · ⚠️ 회수·원장·분개는 지울 수 없는 기록이다 (개발 DB에서만 실행)
//
// 사용법: npm run db:seed-sample-exits

import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve('.') } });
const { sql } = await jiti.import('@/lib/db.ts');
const exits = await jiti.import('@/lib/services/exits.ts');
const dist = await jiti.import('@/lib/services/distributions.ts');

const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const daysAgo = (n) => addDays(TODAY, -n);
const 억 = 100_000_000;

try {
  const [fund] = await sql`select id, name, status from funds where name = '로컬크리에이터 초기투자조합'`;
  if (!fund) throw new Error('로컬크리에이터 초기투자조합이 없습니다. npm run db:seed-sample-deals 를 먼저 실행하세요');
  const [done] = await sql`select 1 from exits where fund_id = ${fund.id}`;
  if (done) {
    console.log('이미 회수 기록이 있어 건너뜁니다.');
  } else {
    const [{ id: user }] = await sql`select id from users order by created_at limit 1`;
    const { holdings } = await exits.listExits(fund.id);
    const by = (name) => holdings.find((h) => h.company_name === name);

    // [기업, 형태, 며칠 전, 처분 원가, 처분대가, 메모]
    const plan = [
      ['클라우드웍스', 'redemption', 4, 10 * 억, 11.8 * 억, 'RCPS 일부 상환 청구'],
      ['에듀스페이스', 'trade_sale', 3, 20 * 억, 38 * 억, '구주 일부 매각 (전략적 투자자)'],
      ['모빌리티원', 'trade_sale', 2, 15 * 억, 9 * 억, '후속 라운드 구주 할인 매각'],
      ['에듀스페이스', 'trade_sale', 1, 15 * 억, 31.5 * 억, '구주 추가 매각 (세컨더리 펀드)'],
      ['클라우드웍스', 'm_and_a', 0, 12 * 억, 18 * 억, '사업부 인수에 따른 지분 일부 매각'],
    ];
    for (const [name, type, ago, cost, proceeds, memo] of plan) {
      const h = by(name);
      if (!h) throw new Error(`${name}: 보유 기업이 아닙니다`);
      const date = daysAgo(ago) < h.first_investment_date ? h.first_investment_date : daysAgo(ago);
      await exits.recordExit(fund.id, { company_id: h.company_id, exit_type: type, exit_date: date, proceeds_amount: Math.round(proceeds), full_exit: false, cost_basis_amount: cost, memo }, user);
      console.log(`✔ 회수 ${name} ${date} 원가 ${cost / 억}억 → ${proceeds / 억}억`);
    }

    // [며칠 전, 금액, 메모, 지급까지 할지]
    const dists = [
      [2, 40 * 억, '클라우드웍스 상환금·에듀스페이스 매각 대금 분배', true],
      [1, 30 * 억, '모빌리티원·에듀스페이스 매각 대금 분배', true],
      [0, 25 * 억, '클라우드웍스 M&A 대금 분배', false],
    ];
    for (const [ago, amount, memo, pay] of dists) {
      const d = await dist.createDistribution(fund.id, { distribution_date: daysAgo(ago), distributable_amount: amount, is_final: false, memo }, user);
      await dist.confirmDistribution(fund.id, d.id, user);
      if (pay) await dist.payDistribution(fund.id, d.id, user);
      console.log(`✔ 제${d.distribution_no}차 분배 ${amount / 억}억 (${pay ? '지급 완료' : '확정 · 지급 대기'})`);
    }
    // 과거 날짜로 만든 샘플이라 확정·지급 시각을 분배일 앞뒤로 맞춘다 (확정 = 분배일 전날 10시, 지급 = 분배일 14시)
    await sql`
      update distributions set confirmed_at = ((distribution_date - 1)::timestamp + interval '10 hours') at time zone 'Asia/Seoul',
        paid_at = case when status = 'paid' then (distribution_date::timestamp + interval '14 hours') at time zone 'Asia/Seoul' end
      where fund_id = ${fund.id} and confirmed_at is not null
    `;
    await sql`update notices n set sent_at = d.confirmed_at from distributions d where n.source_id = d.id and n.notice_type = 'distribution' and d.fund_id = ${fund.id}`;
  }
} catch (err) {
  console.error('❌', err.message ?? err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
