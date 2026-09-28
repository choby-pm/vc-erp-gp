import Link from "next/link";
import ReportActions from "@/components/report-actions";
import { formatDate, formatKRW, formatKRWFull, formatPercent } from "@/lib/format";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getReport, periodLabel } from "@/lib/services/reports";

const STATUS_LABEL = { holding: "보유 중", partially_exited: "일부 회수", exited: "전액 회수" } as const;

export default async function ReportDetailPage(props: PageProps<"/funds/[fundId]/reports/[reportId]">) {
  const { fundId, reportId } = await props.params;
  const r = await loadOrNotFound(() => getReport(fundId, reportId));
  const s = r.snapshot.totals;
  const f = r.snapshot.period_flows;
  const published = r.status === "published";

  const cards: [string, string, string?][] = [
    ["약정 총액", formatKRW(s.commitment_amount), formatKRWFull(s.commitment_amount)],
    ["납입 출자금", formatKRW(s.paid_amount), `납입률 ${formatPercent(s.paid_ratio, 1)}`],
    ["투자자산 취득 누계", formatKRW(s.invested_amount), `장부가액(원가) ${formatKRW(s.invested_balance_amount)}`],
    ["투자자산 공정가치", formatKRW(s.current_value_amount), `기업 ${r.snapshot.portfolio.filter((p) => p.status !== "exited").length}개`],
    ["투자자산 처분대가 누계", formatKRW(s.proceeds_amount)],
    ["분배금 누계", formatKRW(s.distributed_amount)],
    ["관리보수 누계", formatKRW(s.fee_amount)],
    ["TVPI", s.tvpi === null ? "-" : `${s.tvpi.toFixed(2)}x`, "(분배금 + 공정가치 + 현금) ÷ 납입 출자금"],
  ];
  const flows: [string, number][] = [
    ["출자금 납입", f.paid_amount],
    ["투자자산 취득", f.invested_amount],
    ["투자자산 처분대가", f.proceeds_amount],
    ["분배금 지급", f.distributed_amount],
    ["관리보수 지급", f.fee_amount],
    ["기타 비용", f.expense_amount ?? 0], // D34 이전에 발행된 스냅샷에는 없다
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/funds/${fundId}/reports`} className="text-sm text-slate-500 hover:text-indigo-600">
          ← 보고서 목록
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold text-slate-900">{periodLabel(r.period_type, r.period_start)}</h2>
          {r.is_correction && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-800">정정</span>}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${published ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
            {published ? "발행" : "초안"}
          </span>
          <span className="text-sm text-slate-500">
            {formatDate(r.period_start)} ~ {formatDate(r.period_end)} · 기준일 {formatDate(r.snapshot.as_of)}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {published
            ? `${formatDate(r.published_at)} 발행된 숫자입니다. 이후 데이터가 바뀌어도 이 보고서는 바뀌지 않습니다. 틀린 곳이 있으면 같은 기간의 정정 보고서를 새로 발행하세요.`
            : "초안입니다. 볼 때마다 기간 종료일 기준 최신 숫자로 다시 계산됩니다."}
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-4">
        {cards.map(([label, value, note]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900">{value}</dd>
            {note && <p className="text-[11px] text-slate-400">{note}</p>}
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h3 className="text-base font-semibold text-slate-900">기간 중 변동</h3>
          <dl className="mt-3 divide-y divide-slate-100 text-sm">
            {flows.map(([label, v]) => (
              <div key={label} className="flex justify-between py-2">
                <dt className="text-slate-500">{label}</dt>
                <dd className="tabular-nums" title={formatKRWFull(v)}>
                  {v ? formatKRW(v) : "-"}
                </dd>
              </div>
            ))}
            <div className="flex justify-between py-2">
              <dt className="text-slate-500">현금및현금성자산 (기준일)</dt>
              <dd className="tabular-nums">{formatKRW(s.cash_amount)}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-slate-500">주목적 투자 비율</dt>
              <dd className="tabular-nums">{formatPercent(s.primary_purpose_ratio, 1)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-2">
          <h3 className="text-base font-semibold text-slate-900">포트폴리오 요약</h3>
          {r.snapshot.portfolio.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">기준일까지 투자한 기업이 없습니다.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-2">기업</th>
                  <th className="py-2">상태</th>
                  <th className="py-2 text-right">취득원가</th>
                  <th className="py-2 text-right">공정가치</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.snapshot.portfolio.map((p) => (
                  <tr key={p.company_name}>
                    <td className="py-2 font-medium">{p.company_name}</td>
                    <td className="py-2 text-slate-600">{STATUS_LABEL[p.status]}</td>
                    <td className="py-2 text-right tabular-nums">{formatKRW(p.invested_amount)}</td>
                    <td className="py-2 text-right tabular-nums">{formatKRW(p.current_value_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {published ? (
        r.gp_comment && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-base font-semibold text-slate-900">GP 코멘트</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{r.gp_comment}</p>
          </section>
        )
      ) : (
        <ReportActions fundId={fundId} reportId={r.id} comment={r.gp_comment} canPublish={r.can_publish} blockedReason={r.publish_blocked_reason} />
      )}
    </div>
  );
}
