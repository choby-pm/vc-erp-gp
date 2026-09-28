// 회계 모듈 도입 전 업무 기록을 소급 분개한다 (D35)
//
// · 화면·API가 쓰는 것과 같은 자동 분개 규칙(lib/services/accounting.ts)을 쓴다
// · 조합마다 거래일·기록 순서대로 분개하고, 조합 하나는 하나의 트랜잭션으로 처리한다 (중간에 실패하면 그 조합은 전부 취소)
// · 이미 분개된 업무 기록은 건너뛴다 → 여러 번 실행해도 중복되지 않는다
// · 취소된 기타 비용은 분개 + 지급일 역분개를 함께 남긴다
//
// 사용법: npm run db:backfill-journal

import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { alias: { '@': path.resolve('.') } });
const { sql } = await jiti.import('@/lib/db.ts');
const acc = await jiti.import('@/lib/services/accounting.ts');

const fmt = (d) => new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10);

try {
  const funds = await sql`select id, name from funds order by created_at`;
  let total = 0;
  for (const fund of funds) {
    const count = await sql.begin(async (tx) => {
      await tx`select 1 from funds where id = ${fund.id} for update`;
      const has = async (type, id) => (await tx`select 1 from journal_entries where source_type = ${type} and source_id = ${id} and reversal_of_id is null`).length > 0;

      // 거래일·기록 순서로 모든 업무 기록을 모은다
      const events = [];
      for (const e of await tx`
        select e.id, e.entry_type, e.amount, e.entry_date::text as d, e.created_by, e.created_at, coalesce(lp.name, 'GP') as name
        from ledger_entries e join fund_members m on m.id = e.member_id left join limited_partners lp on lp.id = m.lp_id
        where e.fund_id = ${fund.id} and e.entry_type = 'contribution'`) {
        events.push({ d: e.d, at: e.created_at, type: e.entry_type, run: () => acc.journalForContribution(tx, { fund_id: fund.id, ledger_id: e.id, amount: Number(e.amount), entry_date: e.d, member_name: e.name, created_by: e.created_by }), id: e.id });
      }
      // 분배는 분배 문서 1건 = 분개 1건 (원금 반환 → 출자금반환, 나머지 → 이익분배금, D37)
      for (const d of await tx`
        select d.id, d.distribution_no, d.distribution_date::text as d, d.distributable_amount, d.created_by, d.paid_at as created_at,
               coalesce((select sum(amount) from distribution_items i where i.distribution_id = d.id and i.component = 'return_of_capital'), 0)::bigint as roc
        from distributions d where d.fund_id = ${fund.id} and d.status = 'paid'`) {
        events.push({ d: d.d, at: d.created_at, type: 'distribution', id: d.id, run: () => acc.journalForDistributionPayment(tx, { fund_id: fund.id, distribution_id: d.id, distribution_no: d.distribution_no, date: d.d, return_of_capital: Number(d.roc), profit: Number(d.distributable_amount) - Number(d.roc), created_by: d.created_by }) });
      }
      for (const i of await tx`select i.id, i.investment_amount, i.investment_date::text as d, i.is_follow_on, i.created_by, i.created_at, c.name from investments i join companies c on c.id = i.company_id where i.fund_id = ${fund.id}`) {
        events.push({ d: i.d, at: i.created_at, type: 'investment', id: i.id, run: () => acc.journalForInvestment(tx, { fund_id: fund.id, investment_id: i.id, amount: Number(i.investment_amount), date: i.d, company_name: i.name, follow_on: i.is_follow_on, created_by: i.created_by }) });
      }
      for (const x of await tx`select x.id, x.proceeds_amount, x.cost_basis_amount, x.exit_date::text as d, x.created_by, x.created_at, c.name from exits x join companies c on c.id = x.company_id where x.fund_id = ${fund.id}`) {
        events.push({ d: x.d, at: x.created_at, type: 'exit', id: x.id, run: () => acc.journalForExit(tx, { fund_id: fund.id, exit_id: x.id, proceeds: Number(x.proceeds_amount), cost: Number(x.cost_basis_amount), date: x.d, company_name: x.name, created_by: x.created_by }) });
      }
      for (const m of await tx`select id, fee_amount, charged_date::text as d, period_start::text as ps, period_end::text as pe, created_by, created_at from management_fee_charges where fund_id = ${fund.id} and fee_amount > 0`) {
        events.push({ d: m.d, at: m.created_at, type: 'management_fee', id: m.id, run: () => acc.journalForManagementFee(tx, { fund_id: fund.id, charge_id: m.id, amount: Number(m.fee_amount), date: m.d, period: `${fmt(m.ps)} ~ ${fmt(m.pe)}`, created_by: m.created_by }) });
      }
      for (const x of await tx`select id, expense_type, amount, paid_date::text as d, description, cancelled_at, cancel_reason, created_by, cancelled_by, created_at from fund_expenses where fund_id = ${fund.id}`) {
        events.push({
          d: x.d, at: x.created_at, type: 'expense', id: x.id,
          run: async () => {
            await acc.journalForExpense(tx, { fund_id: fund.id, expense_id: x.id, type: x.expense_type, amount: Number(x.amount), date: x.d, description: x.description, created_by: x.created_by });
            if (x.cancelled_at) await acc.reverseSourceJournal(tx, 'expense', x.id, x.d, `비용 취소: ${x.cancel_reason ?? ''}`, x.cancelled_by);
          },
        });
      }
      events.sort((a, b) => (a.d === b.d ? new Date(a.at) - new Date(b.at) : a.d < b.d ? -1 : 1));

      let n = 0;
      for (const ev of events) {
        if (await has(ev.type, ev.id)) continue;
        await ev.run();
        n++;
      }
      return n;
    });
    total += count;
    if (count > 0) console.log(`✔ ${fund.name}: 분개 ${count}건`);
  }
  const [c] = await sql`select (select count(*) from journal_entries)::int as entries, (select count(*) from journal_lines)::int as lines`;
  console.log(`\n소급 분개 ${total}건 추가 (전체 분개 ${c.entries}건, 분개 줄 ${c.lines}줄)`);
} catch (err) {
  console.error('✖ 소급 분개 실패:', err.code ?? '', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
