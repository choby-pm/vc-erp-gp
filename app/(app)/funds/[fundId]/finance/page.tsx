import Link from "next/link";
import ExpensePanel from "@/components/expense-panel";
import FinancialStatementsView from "@/components/financial-statements";
import { formatDate, formatKRW, formatKRWFull } from "@/lib/format";
import { CASH_FLOW_LABEL, type CashFlowKind } from "@/lib/labels";
import { getFinanceSummary, getFinancialStatements, listCashFlows, listExpenses } from "@/lib/services/finance";

const KINDS = Object.keys(CASH_FLOW_LABEL) as CashFlowKind[];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function FinancePage(props: PageProps<"/funds/[fundId]/finance">) {
  const { fundId } = await props.params;
  const raw = await props.searchParams;
  const pick = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : null);
  const kind = KINDS.includes(pick("kind") as CashFlowKind) ? (pick("kind") as CashFlowKind) : null;
  const from = DATE.test(pick("from") ?? "") ? pick("from") : null;
  const to = DATE.test(pick("to") ?? "") ? pick("to") : null;

  const [s, statements, cash, expenses] = await Promise.all([
    getFinanceSummary(fundId),
    getFinancialStatements(fundId),
    listCashFlows(fundId, { kind, from, to }),
    listExpenses(fundId),
  ]);

  const href = (change: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ kind, from, to, ...change })) if (v) p.set(k, v);
    const q = p.toString();
    return q ? `/funds/${fundId}/finance?${q}` : `/funds/${fundId}/finance`;
  };
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium ${active ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;

  return (
    <div className="space-y-6">
      <FinancialStatementsView data={statements} formationDate={s.formation_date} />

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="space-y-3 border-b border-slate-200 px-6 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">현금출납장</h2>
              <p className="mt-0.5 text-xs text-slate-500">현금및현금성자산의 입금·출금 내역 · 투자 가능 잔액 {formatKRW(s.investable_amount)} (약정 − 투자 − 관리보수 − 기타 비용)</p>
            </div>
            <p className="text-sm text-slate-500">
              {cash.count}건 · 입금 <b className="text-emerald-700">{formatKRW(cash.inflow)}</b> · 출금 <b className="text-rose-700">{formatKRW(cash.outflow)}</b>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={href({ kind: null })} className={chip(!kind)}>
              전체
            </Link>
            {KINDS.map((k) => (
              <Link key={k} href={href({ kind: k })} className={chip(kind === k)}>
                {CASH_FLOW_LABEL[k]}
              </Link>
            ))}
          </div>
          <form className="flex flex-wrap items-center gap-2 text-sm" action={`/funds/${fundId}/finance`}>
            {kind && <input type="hidden" name="kind" value={kind} />}
            <input type="date" name="from" defaultValue={from ?? ""} className="rounded-lg border border-slate-300 px-2 py-1" aria-label="시작일" />
            <span className="text-slate-400">~</span>
            <input type="date" name="to" defaultValue={to ?? ""} className="rounded-lg border border-slate-300 px-2 py-1" aria-label="종료일" />
            <button className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50">기간 적용</button>
            {(from || to) && (
              <Link href={href({ from: null, to: null })} className="text-xs text-slate-500 hover:text-slate-700">
                기간 해제
              </Link>
            )}
          </form>
        </div>
        {cash.flows.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">해당하는 입출금 내역이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-2.5">일자</th>
                  <th className="px-3 py-2.5">구분</th>
                  <th className="px-3 py-2.5">내용</th>
                  <th className="px-3 py-2.5">거래처</th>
                  <th className="px-3 py-2.5 text-right">입금</th>
                  <th className="px-3 py-2.5 text-right">출금</th>
                  <th className="px-6 py-2.5 text-right">잔액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cash.flows.map((f, i) => (
                  <tr key={`${f.date}-${i}`}>
                    <td className="px-6 py-2.5 whitespace-nowrap">{formatDate(f.date)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {f.link ? (
                        <Link href={f.link} className="text-slate-600 hover:text-indigo-600">
                          {CASH_FLOW_LABEL[f.kind]}
                        </Link>
                      ) : (
                        CASH_FLOW_LABEL[f.kind]
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{f.description}</td>
                    <td className="px-3 py-2.5 text-slate-500">{f.counterparty ?? "-"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{f.amount > 0 ? formatKRWFull(f.amount) : ""}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-rose-700">{f.amount < 0 ? formatKRWFull(-f.amount) : ""}</td>
                    <td className={`px-6 py-2.5 text-right tabular-nums ${f.balance < 0 ? "text-rose-600" : "text-slate-900"}`}>{formatKRWFull(f.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500">
          출자금 원장·투자·처분·관리보수·비용 기록을 모아 거래일 순으로 보여줍니다. 잔액은 전체 기간 기준 현금및현금성자산 잔액입니다.
        </p>
      </section>

      <ExpensePanel fundId={fundId} expenses={expenses} canRecord={["formed", "operating", "dissolved"].includes(s.fund_status)} cash={s.cash_amount} />
    </div>
  );
}
