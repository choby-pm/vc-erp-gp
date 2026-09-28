import Link from "next/link";
import { FundStatusBadge } from "@/components/fund-status";
import { formatDate, formatKRW, formatKRWFull, formatPercent } from "@/lib/format";
import { FUND_STATUSES, FUND_STATUS_LABEL } from "@/lib/labels";
import { getDashboard } from "@/lib/services/dashboard";

export const metadata = { title: "대시보드 · VC ERP" };

// 전체 대시보드: 운용 중인 조합의 합계 숫자, 경고·할 일, 다가오는 일정, 조합별 현황
// 숫자는 조합 화면과 같은 원본에서 계산한다 (성공 기준 6)

const LEVEL = {
  danger: { dot: "bg-rose-500", box: "border-rose-200 bg-rose-50/60", text: "text-rose-800" },
  warning: { dot: "bg-amber-500", box: "border-amber-200 bg-amber-50/60", text: "text-amber-900" },
  info: { dot: "bg-sky-500", box: "border-slate-200 bg-white", text: "text-slate-700" },
};
const KIND_LABEL: Record<string, string> = { capital_call: "납입 기한", meeting: "총회", distribution: "분배" };

export default async function DashboardPage() {
  const d = await getDashboard();
  const t = d.totals;

  const kpis: [string, number, string][] = [
    ["약정 총액", t.commitment_amount, `결성~해산 조합 ${t.active_count}곳 (청산 완료 제외)`],
    ["납입 출자금", t.paid_amount, t.commitment_amount ? `납입률 ${formatPercent(t.paid_amount / t.commitment_amount, 1)}` : "-"],
    ["투자자산 취득 누계", t.invested_amount, `회수 ${formatKRW(t.proceeds_amount)}`],
    ["분배 누계", t.distributed_amount, "조합원에게 지급"],
    ["순자산가치 (NAV)", t.nav_amount, `현금 ${formatKRW(t.cash_amount)} + 공정가치`],
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">대시보드</h1>
        <p className="mt-1 text-sm text-slate-500">{formatDate(d.as_of)} 기준 · 전체 조합 {t.fund_count}곳</p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map(([label, value, note]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900" title={formatKRWFull(value)}>
              {formatKRW(value)}
            </dd>
            <p className="text-[11px] text-slate-400">{note}</p>
          </div>
        ))}
      </dl>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {FUND_STATUSES.map((s, i) => (
            <li key={s} className={`rounded-xl px-3 py-2.5 text-center ${d.by_status[s] ? "bg-indigo-50" : "bg-slate-50"}`}>
              <p className="text-[11px] text-slate-500">
                {i + 1}. {FUND_STATUS_LABEL[s]}
              </p>
              <p className={`text-xl font-bold tabular-nums ${d.by_status[s] ? "text-indigo-700" : "text-slate-300"}`}>{d.by_status[s]}</p>
            </li>
          ))}
        </ol>
        {t.raising_target_amount > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            모집 중 목표 {formatKRW(t.raising_target_amount)} · 확약 {formatKRW(t.raising_committed_amount)} ({formatPercent(t.raising_committed_amount / t.raising_target_amount, 0)})
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white lg:col-span-2">
          <h2 className="border-b border-slate-200 px-6 py-4 text-base font-semibold text-slate-900">
            확인할 일 <span className="text-sm font-normal text-slate-500">{d.alerts.length}건</span>
          </h2>
          {d.alerts.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-slate-500">확인할 경고가 없습니다.</p>
          ) : (
            <ul className="space-y-2 p-4">
              {d.alerts.map((a, i) => (
                <li key={`${a.category}-${a.fund_id}-${i}`}>
                  <Link href={a.href} className={`flex items-start gap-3 rounded-xl border px-4 py-3 hover:opacity-80 ${LEVEL[a.level].box}`}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${LEVEL[a.level].dot}`} />
                    <span className={`text-sm ${LEVEL[a.level].text}`}>
                      <span className="font-semibold">{a.category}</span>
                      {a.fund_name && <span className="text-slate-500"> · {a.fund_name}</span>}
                      <span className="block">{a.message}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-6 py-4 text-base font-semibold text-slate-900">다가오는 일정 · 30일</h2>
          {d.schedule.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-slate-500">예정된 일정이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.schedule.map((e) => (
                <li key={e.href}>
                  <Link href={e.href} className="flex gap-3 px-6 py-3 hover:bg-slate-50">
                    <span className="w-16 shrink-0 text-sm font-semibold tabular-nums text-slate-900">{e.date.slice(5).replace("-", "/")}</span>
                    <span className="text-sm">
                      <span className="text-slate-900">{e.title}</span>
                      <span className="block text-xs text-slate-500">
                        {KIND_LABEL[e.kind]} · {e.fund_name}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500">
            LP 연동 이벤트 대기 {d.events.pending}건 · 실패 {d.events.failed}건{" "}
            <Link href="/integrations" className="font-semibold text-indigo-600 hover:underline">
              연동 관리 →
            </Link>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-baseline justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">조합별 현황</h2>
          <Link href="/funds" className="text-sm font-semibold text-indigo-600 hover:underline">
            조합 목록 →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-6 py-2.5">조합</th>
                <th className="px-3 py-2.5 text-right">약정</th>
                <th className="px-3 py-2.5 text-right">납입</th>
                <th className="px-3 py-2.5 text-right">투자</th>
                <th className="px-3 py-2.5 text-right">회수</th>
                <th className="px-3 py-2.5 text-right">분배</th>
                <th className="px-3 py-2.5 text-right">NAV</th>
                <th className="px-6 py-2.5 text-right">TVPI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {d.funds.map((f) => (
                <tr key={f.fund_id}>
                  <td className="px-6 py-2.5">
                    <Link href={`/funds/${f.fund_id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                      {f.name}
                    </Link>
                    <span className="ml-2">
                      <FundStatusBadge status={f.status} />
                    </span>
                  </td>
                  {[f.commitment_amount, f.paid_amount, f.invested_amount, f.proceeds_amount, f.distributed_amount, f.nav_amount].map((v, i) => (
                    <td key={i} className="px-3 py-2.5 text-right tabular-nums text-slate-700" title={formatKRWFull(v)}>
                      {v ? formatKRW(v) : "-"}
                    </td>
                  ))}
                  <td className="px-6 py-2.5 text-right tabular-nums font-semibold text-slate-900">{f.tvpi === null ? "-" : `${f.tvpi.toFixed(2)}x`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500">NAV = 현금 + 보유 기업 공정가치 (부채 없음). TVPI = (분배 누계 + NAV) ÷ 납입 출자금.</p>
      </section>
    </div>
  );
}
