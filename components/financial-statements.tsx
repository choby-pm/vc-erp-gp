import { formatDate } from "@/lib/format";
import { EXPENSE_TYPE_LABEL } from "@/lib/labels";
import type { FinancialStatements } from "@/lib/services/finance";

// 약식 재무상태표·손익계산서 (원가 기준, BR-FIN-03). 금액은 원 단위, 음수는 괄호로 표시한다 (회계 관행)

const won = (v: number) => (v < 0 ? `(${(-v).toLocaleString("ko-KR")})` : v.toLocaleString("ko-KR"));

type Line = { label: string; amount?: number; level?: 0 | 1 | 2; strong?: boolean; total?: boolean; muted?: boolean };

function Statement({ title, subtitle, lines }: { title: string; subtitle: string; lines: Line[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {lines.map((l, i) => (
            <tr key={`${l.label}-${i}`} className={l.total ? "border-t-2 border-double border-slate-300" : l.strong ? "border-t border-slate-200" : ""}>
              <td
                className={`py-2 pr-3 ${l.level === 2 ? "pl-12" : l.level === 1 ? "pl-9" : "pl-6"} ${l.strong || l.total ? "font-semibold text-slate-900" : l.muted ? "text-slate-400" : "text-slate-700"}`}
              >
                {l.label}
              </td>
              <td className={`py-2 pr-6 text-right tabular-nums ${l.strong || l.total ? "font-semibold text-slate-900" : l.muted ? "text-slate-400" : "text-slate-700"} ${(l.amount ?? 0) < 0 ? "text-rose-700" : ""}`}>
                {l.amount === undefined ? "" : won(l.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function FinancialStatementsView({ data, formationDate }: { data: FinancialStatements; formationDate: string | null }) {
  const bs = data.balance_sheet;
  const is = data.income_statement;
  const fv = data.fair_value;

  const balanceLines: Line[] = [
    { label: "자산", strong: true },
    { label: "유동자산", level: 1 },
    { label: "현금및현금성자산", amount: bs.assets.cash, level: 2 },
    { label: "비유동자산", level: 1 },
    { label: "투자자산 (취득원가)", amount: bs.assets.investments_at_cost, level: 2 },
    { label: "자산총계", amount: bs.assets.total, total: true },
    { label: "부채", strong: true },
    { label: "미지급금·미지급비용", amount: 0, level: 1, muted: true },
    { label: "부채총계", amount: bs.liabilities.total, total: true },
    { label: "자본 (조합원 지분)", strong: true },
    { label: "출자금 (납입분)", amount: bs.equity.paid_in_capital, level: 1 },
    { label: "분배금", amount: -bs.equity.distributions, level: 1 },
    { label: bs.equity.retained_earnings >= 0 ? "이익잉여금" : "결손금", amount: bs.equity.retained_earnings, level: 1 },
    { label: "자본총계", amount: bs.equity.total, total: true },
    { label: "부채와자본총계", amount: bs.liabilities.total + bs.equity.total, total: true },
  ];

  const incomeLines: Line[] = [
    { label: "영업수익", strong: true },
    { label: is.revenue.realized_gain >= 0 ? "투자자산처분이익" : "투자자산처분손실", amount: is.revenue.realized_gain, level: 1 },
    { label: "영업수익 합계", amount: is.revenue.total, total: true },
    { label: "영업비용", strong: true },
    { label: "관리보수", amount: -is.expenses.management_fee, level: 1 },
    ...is.expenses.other.map((o) => ({ label: EXPENSE_TYPE_LABEL[o.type], amount: -o.amount, level: 1 as const })),
    { label: "영업비용 합계", amount: -is.expenses.total, total: true },
    { label: is.net_income >= 0 ? "당기순이익 (누적)" : "당기순손실 (누적)", amount: is.net_income, total: true },
    { label: "참고: 미실현 평가손익 (공정가치 − 장부가액)", amount: fv.unrealized_gain, muted: true },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-6 lg:grid-cols-2">
        <Statement title="재무상태표 (약식)" subtitle={`${formatDate(data.as_of)} 현재 · 원가 기준 · 단위: 원`} lines={balanceLines} />
        <Statement
          title="손익계산서 (약식)"
          subtitle={`${formationDate ? formatDate(formationDate) : "결성 전"} ~ ${formatDate(data.as_of)} 누적 · 단위: 원`}
          lines={incomeLines}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm">
          <p className="text-xs text-slate-500">순자산가치 (NAV, 공정가치 기준)</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{won(fv.net_asset_value)}원</p>
          <p className="text-[11px] text-slate-400">자본총계 + 미실현 평가손익 · 투자자산 공정가치 {won(fv.investments_at_fair_value)}원</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm">
          <p className="text-xs text-slate-500">주석: 출자 약정</p>
          <p className="mt-1 tabular-nums text-slate-900">
            약정 {won(data.commitment.committed)}원 · 납입 {won(data.commitment.paid_in)}원
          </p>
          <p className="text-[11px] text-slate-400">미납입 약정 {won(data.commitment.unpaid)}원 (재무상태표에 인식하지 않는 약정 사항)</p>
        </div>
        <div className={`rounded-2xl border px-5 py-4 text-sm ${bs.balanced ? "border-emerald-200 bg-emerald-50/40" : "border-rose-300 bg-rose-50"}`}>
          <p className="text-xs text-slate-500">대차 검증</p>
          <p className={`mt-1 font-semibold ${bs.balanced ? "text-emerald-700" : "text-rose-700"}`}>
            {bs.balanced ? "자산총계 = 부채와자본총계 ✓" : "자산과 부채·자본이 일치하지 않습니다"}
          </p>
          <p className="text-[11px] text-slate-400">업무 기록에서 바로 계산한 값입니다</p>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        ⚠️ 업무 기록에서 바로 계산한 약식 재무제표입니다 (수동 분개·결산 미반영). 분개장 기준 재무제표·장부·결산은 <b>재무·회계</b> 탭의 각 화면에서 봅니다.
      </p>
    </div>
  );
}
