import FundraisingProgress from "@/components/fundraising-progress";
import ProposalsBoard from "@/components/proposals-board";
import { formatDate, formatKRW, formatPercent } from "@/lib/format";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getFund } from "@/lib/services/funds";
import { listLpOptions } from "@/lib/services/lps";
import { listProposals } from "@/lib/services/proposals";

export default async function FundProposalsPage(props: PageProps<"/funds/[fundId]/proposals">) {
  const { fundId } = await props.params;
  const fund = await loadOrNotFound(() => getFund(fundId));
  const [data, lps] = await Promise.all([listProposals(fundId), listLpOptions()]);

  return (
    <div className="space-y-6">
      {fund.status === "planning" && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          기획 중인 조합입니다. 제안을 미리 작성할 수 있지만, 발송은 조합 화면에서 <b>모집을 시작</b>한 뒤에 할 수 있습니다.
        </p>
      )}
      {!data.can_edit && (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">결성 이후에는 출자 제안을 바꿀 수 없습니다. 기록만 조회합니다.</p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">모집 달성률</h2>
        <p className="mt-0.5 text-xs text-slate-500">확약 금액 합 ÷ 목표 결성액. 확약은 결성 전 약속이며, 결성 때 조합원 명부에서 약정액으로 확정됩니다.</p>
        <div className="mt-4">
          <FundraisingProgress summary={data.summary} />
        </div>
      </section>

      {data.summary.anchors.length > 0 && (
        <section className="rounded-2xl border border-indigo-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900">앵커 조건</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            출자기관이 선정하며 붙인 조건입니다 (LP ERP에서 받은 값). 출자 비율 상한을 지키려면 결성액이 확약 ÷ 상한 이상이어야 하고, 결성 기한 안에 결성해야 합니다.
          </p>
          <ul className="mt-4 space-y-3">
            {data.summary.anchors.map((a) => (
              <li key={a.lp_name + a.formation_deadline} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-slate-900">
                    {a.lp_name} <span className="font-normal text-slate-500">· {a.program_name ?? "개별 선정"} · 확약 {formatKRW(a.loc_amount)}</span>
                  </p>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.days_left < 0 ? "bg-rose-50 text-rose-700" : a.days_left <= 30 ? "bg-amber-50 text-amber-800" : "bg-indigo-50 text-indigo-700"}`}>
                    결성 기한 {formatDate(a.formation_deadline)} · {a.days_left < 0 ? `${-a.days_left}일 지남` : `D-${a.days_left}`}
                  </span>
                </div>
                <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                  <div><dt className="text-xs text-slate-500">출자 비율 상한</dt><dd className="tabular-nums">{a.max_commitment_ratio ? formatPercent(a.max_commitment_ratio) : "없음"}</dd></div>
                  <div><dt className="text-xs text-slate-500">최소 결성 규모</dt><dd className="tabular-nums">{a.min_fund_size_amount ? formatKRW(a.min_fund_size_amount) : "없음"}</dd></div>
                  <div><dt className="text-xs text-slate-500">필요한 최소 결성액</dt><dd className="font-semibold tabular-nums">{a.required_fund_amount ? formatKRW(a.required_fund_amount) : "-"}</dd></div>
                  <div>
                    <dt className="text-xs text-slate-500">남은 모집액 (지금 확약 {formatKRW(data.summary.committed_amount)})</dt>
                    <dd className={`font-semibold tabular-nums ${a.remaining_amount > 0 ? "text-rose-700" : "text-emerald-700"}`}>{a.remaining_amount > 0 ? formatKRW(a.remaining_amount) : "충족"}</dd>
                  </div>
                </dl>
                {a.key_person_condition && <p className="mt-2 text-xs text-slate-600">핵심 운용 인력 조건: {a.key_person_condition}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ProposalsBoard fundId={fund.id} data={data} lps={lps} />
    </div>
  );
}
