import Link from "next/link";
import LpCallApply from "@/components/lp-call-apply";
import { formatDate, formatKRW, formatPercent } from "@/lib/format";
import { FUND_STATUS_LABEL } from "@/lib/labels";
import { applicableFunds, getLpCall, listMyApplications } from "@/lib/services/lp-calls";
import { LP_STRATEGY_LABEL as STRATEGY_LABEL } from "@/lib/lp-erp/labels";

export const metadata = { title: "출자사업 공고 · VC ERP" };

// LP ERP 공고 하나 · 지원 (D47). 공고 조건은 지원하는 모든 GP에 같고, 선정되면 그 기관이 우리와의 선정 조건을 따로 정한다
export default async function CallPage(props: PageProps<"/calls/[programId]">) {
  const { programId } = await props.params;
  let call;
  try {
    call = await getLpCall(programId);
  } catch (e) {
    return (
      <div className="space-y-4">
        <Link href="/calls" className="text-sm text-slate-500 hover:text-slate-700">
          ← 출자사업 공고
        </Link>
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {e instanceof Error ? e.message : "공고를 읽지 못했습니다"}
        </p>
      </div>
    );
  }
  const [funds, applications] = await Promise.all([applicableFunds(), listMyApplications(programId)]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/calls" className="text-sm text-slate-500 hover:text-slate-700">
          ← 출자사업 공고
        </Link>
        <p className="mt-2 text-sm font-medium text-slate-500">{call.org_name}</p>
        <h1 className="text-2xl font-bold text-slate-900">{call.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          접수 {formatDate(call.apply_start_date)} ~ {formatDate(call.apply_end_date)} ·{" "}
          {call.status === "reviewing" ? "접수 마감 · 심사 중" : call.days_left === 0 ? "오늘 마감" : `마감까지 ${call.days_left}일`}
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">모집 부문 · 공고 조건</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm tabular-nums">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-5 py-2.5">부문</th>
                <th className="px-5 py-2.5">분야</th>
                <th className="px-5 py-2.5 text-right">출자 예정액</th>
                <th className="px-5 py-2.5 text-right">선정 GP</th>
                <th className="px-5 py-2.5 text-right">최소 결성 규모</th>
                <th className="px-5 py-2.5 text-right">출자 비율 상한</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {call.tracks.map((t) => (
                <tr key={t.id}>
                  <td className="px-5 py-2.5 font-medium text-slate-900">{t.name}</td>
                  <td className="px-5 py-2.5 text-slate-600">{STRATEGY_LABEL[t.strategy] ?? t.strategy}</td>
                  <td className="px-5 py-2.5 text-right">{formatKRW(t.planned_amount)}</td>
                  <td className="px-5 py-2.5 text-right">{t.target_gp_count}곳</td>
                  <td className="px-5 py-2.5 text-right">{t.min_fund_size_amount ? formatKRW(t.min_fund_size_amount) : "제한 없음"}</td>
                  <td className="px-5 py-2.5 text-right">{t.max_commitment_ratio ? formatPercent(t.max_commitment_ratio) : "제한 없음"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {applications.length > 0 && (
        <section className="rounded-2xl border border-emerald-200 bg-white">
          <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">이 공고에 지원한 내역</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {applications.map((a) => (
              <li key={a.proposal_id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-2.5">
                <span>
                  <Link href={`/funds/${a.fund_id}/proposals`} className="font-medium text-slate-900 hover:text-indigo-700">
                    {a.fund_name}
                  </Link>{" "}
                  · {a.track_name} · 요청 {formatKRW(a.proposed_amount)}
                </span>
                <span className={`text-xs ${a.apply_sent_at ? "text-emerald-700" : "text-rose-700"}`}>
                  {a.apply_sent_at ? `${call.org_name} 접수 ${formatDate(a.apply_sent_at)}` : `보내지 못함 — ${a.apply_error ?? "확인 필요"}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {call.linked ? (
        call.status === "open" ? (
          <LpCallApply
            programId={call.id}
            orgName={call.org_name}
            tracks={call.tracks.map((t) => ({ id: t.id, label: `${t.name} · ${STRATEGY_LABEL[t.strategy] ?? t.strategy} · ${formatKRW(t.planned_amount)}` }))}
            funds={funds.map((f) => ({ id: f.id, label: `${f.name} · ${STRATEGY_LABEL[f.strategy]} · ${FUND_STATUS_LABEL[f.status]} · 목표 ${formatKRW(f.target_amount)}` }))}
          />
        ) : (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">접수가 끝나 심사 중인 공고입니다.</p>
        )
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          <h2 className="text-sm font-semibold text-slate-900">지원 방법</h2>
          <p className="mt-2">{call.org_name}은(는) 이 GP와 연동되지 않은 기관입니다. {call.apply_guide ?? "기관이 접수 방법을 적지 않았습니다. 기관에 직접 문의하세요."}</p>
        </section>
      )}
    </div>
  );
}
