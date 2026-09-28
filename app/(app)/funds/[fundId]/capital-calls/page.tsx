import Link from "next/link";
import CapitalCallForm from "@/components/capital-call-form";
import { formatDate, formatKRW, formatKRWFull, formatPercent } from "@/lib/format";
import { CALL_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import { listCapitalCalls, listUnpaidItems } from "@/lib/services/capital-calls";
import { getFund } from "@/lib/services/funds";

export default async function CapitalCallsPage(props: PageProps<"/funds/[fundId]/capital-calls">) {
  const { fundId } = await props.params;
  const fund = await loadOrNotFound(() => getFund(fundId));
  const [data, unpaid] = await Promise.all([listCapitalCalls(fundId), listUnpaidItems(fundId)]);
  const unpaidTotal = unpaid.reduce((s, u) => s + u.unpaid_amount, 0);
  const isInitial = fund.status === "fundraising";

  return (
    <div className="space-y-6">
      {!data.can_create && data.calls.length === 0 && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {fund.status === "fundraising" ? (
            <>
              최초 납입은 <Link href={`/funds/${fund.id}/members`} className="font-semibold underline">조합원 명부</Link>를 확정한 뒤에 요청할 수 있습니다.
            </>
          ) : (
            "현재 조합 상태에서는 캐피탈콜을 할 수 없습니다."
          )}
        </p>
      )}
      {isInitial && data.calls.length > 0 && (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">결성 전에는 최초 납입 1회만 요청할 수 있습니다. 최초 납입 발송은 결성 조건입니다.</p>
      )}

      {unpaid.length > 0 && (
        <section className="rounded-2xl border border-rose-200 bg-white">
          <div className="border-b border-rose-100 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              미납 현황 · {unpaid.length}건 {formatKRW(unpaidTotal)}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">발송된 캐피탈콜 중 아직 다 내지 않은 조합원. 기한이 지난 항목이 먼저 나옵니다.</p>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {unpaid.map((u) => (
                <tr key={`${u.capital_call_id}-${u.member_name}`}>
                  <td className="px-6 py-2.5 font-medium text-slate-900">{u.member_name}</td>
                  <td className="px-3 py-2.5">
                    <Link href={`/funds/${fund.id}/capital-calls/${u.capital_call_id}`} className="text-slate-600 hover:text-indigo-600">
                      {u.is_initial ? "최초 납입" : `제${u.call_no}차`}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500">
                    기한 {formatDate(u.due_date)}
                    {u.overdue_days > 0 && <span className="ml-1 font-semibold text-rose-600">({u.overdue_days}일 지남)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums" title={formatKRWFull(u.unpaid_amount)}>
                    미납 {formatKRW(u.unpaid_amount)} <span className="text-xs text-slate-400">/ {formatKRW(u.call_amount)}</span>
                  </td>
                  <td className="px-6 py-2.5 text-right">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${u.payment_status === "overdue" ? "bg-rose-100 text-rose-700" : u.payment_status === "partial" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                      {PAYMENT_STATUS_LABEL[u.payment_status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {data.can_create && <CapitalCallForm fundId={fund.id} isInitial={isInitial} />}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-6 py-4 text-base font-semibold text-slate-900">요청 {data.calls.length}건</h2>
        {data.calls.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">아직 캐피탈콜이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.calls.map((c) => (
              <li key={c.id}>
                <Link href={`/funds/${fund.id}/capital-calls/${c.id}`} className="flex flex-wrap items-center gap-3 px-6 py-3 hover:bg-slate-50">
                  <span className="font-semibold text-slate-900">{c.is_initial ? "최초 납입" : `제${c.call_no}차`}</span>
                  <span className="text-sm text-slate-500">
                    {formatKRW(c.total_call_amount)} · 요청 {formatDate(c.call_date)} · 기한 {formatDate(c.due_date)}
                  </span>
                  <span className="ml-auto text-sm tabular-nums text-slate-600">
                    {c.status === "draft" ? "" : `납입 ${formatPercent(c.paid_ratio, 1)}${c.unpaid_member_count ? ` · 미납 ${c.unpaid_member_count}명` : ""}`}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{CALL_STATUS_LABEL[c.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
