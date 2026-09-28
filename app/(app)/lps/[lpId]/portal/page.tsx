import Link from "next/link";
import { FundStatusBadge } from "@/components/fund-status";
import { formatDate, formatKRWFull, formatPercent } from "@/lib/format";
import { DISTRIBUTION_COMPONENT_LABEL, NOTICE_TYPE_LABEL, type DistributionComponent } from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import { lpCapitalCalls, lpDistributions, lpFunds, lpLedger, lpNotices, lpProfile } from "@/lib/services/lp-portal";

// LP 공개 데이터 미리보기: LP 연동 API(/api/lp/v1)가 이 LP에게 돌려주는 것과 같은 함수로 그린다 (03 DB 설계 7장)
// GP 내부 정보(메모·연락처·딜·다른 LP)는 여기에도 나오지 않는다

const LEDGER_LABEL: Record<string, string> = { commitment: "약정", contribution: "납입", distribution: "분배" };
const sourceLabel = (s: Record<string, unknown>) =>
  s.type === "capital_call" ? (s.is_initial ? "최초 납입" : `제${s.call_no}차 캐피탈콜`) : s.type === "distribution" ? (s.is_final ? "최종 분배" : `제${s.distribution_no}차 분배`) : s.type === "formation" ? "조합원 명부 확정" : s.type === "terms_amendment" ? "규약 변경 (약정 증액)" : String(s.type);

export default async function LpPortalPreviewPage(props: PageProps<"/lps/[lpId]/portal">) {
  const { lpId } = await props.params;
  const raw = await props.searchParams;
  const lp = await loadOrNotFound(() => lpProfile(lpId));
  const [funds, notices] = await Promise.all([lpFunds(lpId), lpNotices(lpId)]);
  const fundId = typeof raw.fund === "string" && funds.some((f) => f.fund_id === raw.fund) ? raw.fund : funds[0]?.fund_id;
  const [ledger, calls, dists] = fundId ? await Promise.all([lpLedger(lpId, fundId), lpCapitalCalls(lpId, fundId), lpDistributions(lpId, fundId)]) : [null, [], []];

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/lps/${lpId}`} className="text-sm text-slate-500 hover:text-indigo-600">
          ← {lp.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">LP 공개 데이터 미리보기</h1>
        <p className="mt-1 text-sm text-slate-500">
          <b>{lp.name}</b>이(가) LP 시스템에서 보게 되는 데이터입니다. 본인 약정·납입·분배와 참여 조합의 공개 정보만 포함되고, GP 내부 메모·연락처·딜 파이프라인·다른 LP의 금액은 나오지 않습니다.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-6 py-4 text-base font-semibold text-slate-900">참여 조합 {funds.length}곳</h2>
        {funds.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-slate-500">조합원으로 참여한 조합이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-2.5">조합</th>
                  <th className="px-3 py-2.5 text-right">지분율</th>
                  <th className="px-3 py-2.5 text-right">약정</th>
                  <th className="px-3 py-2.5 text-right">납입</th>
                  <th className="px-3 py-2.5 text-right">미납 약정</th>
                  <th className="px-6 py-2.5 text-right">분배 받음</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {funds.map((f) => (
                  <tr key={f.fund_id} className={f.fund_id === fundId ? "bg-indigo-50/40" : ""}>
                    <td className="px-6 py-2.5">
                      <Link href={`/lps/${lpId}/portal?fund=${f.fund_id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                        {f.fund_name}
                      </Link>
                      <span className="ml-2">
                        <FundStatusBadge status={f.status} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{f.my.ownership_ratio == null ? "-" : formatPercent(f.my.ownership_ratio, 2)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatKRWFull(f.my.commitment_amount)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatKRWFull(f.my.contribution_amount)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{formatKRWFull(f.my.unfunded_amount)}</td>
                    <td className="px-6 py-2.5 text-right tabular-nums">{formatKRWFull(f.my.distribution_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {ledger && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-200 px-6 py-4 text-base font-semibold text-slate-900">
              내 원장 <span className="text-sm font-normal text-slate-500">· {funds.find((f) => f.fund_id === fundId)?.fund_name}</span>
            </h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {ledger.entries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-6 py-2.5">
                  <span className="w-24 text-slate-500">{formatDate(e.entry_date)}</span>
                  <span className="w-10 font-medium text-slate-700">{LEDGER_LABEL[e.entry_type]}</span>
                  <span className="flex-1 text-slate-500">
                    {sourceLabel(e.source)}
                    {e.reversal_of_id && " (취소)"}
                  </span>
                  <span className={`tabular-nums ${e.amount < 0 ? "text-rose-700" : "text-slate-900"}`}>{formatKRWFull(e.amount)}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white">
              <h2 className="border-b border-slate-200 px-6 py-4 text-base font-semibold text-slate-900">캐피탈콜 · 내 요청액</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {calls.map((c) => (
                  <li key={c.call_no} className="flex items-center justify-between gap-3 px-6 py-2.5">
                    <span className="text-slate-700">
                      {c.is_initial ? "최초 납입" : `제${c.call_no}차`} <span className="text-xs text-slate-500">기한 {formatDate(c.due_date)}</span>
                    </span>
                    <span className="tabular-nums text-slate-900">
                      {formatKRWFull(c.my_paid_amount)} / {formatKRWFull(c.my_call_amount)}
                    </span>
                  </li>
                ))}
                {calls.length === 0 && <li className="px-6 py-6 text-center text-slate-500">발송된 캐피탈콜이 없습니다.</li>}
              </ul>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white">
              <h2 className="border-b border-slate-200 px-6 py-4 text-base font-semibold text-slate-900">분배 · 내 분배액</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {dists.map((d) => (
                  <li key={d.distribution_no} className="flex items-center justify-between gap-3 px-6 py-2.5">
                    <span className="text-slate-700">
                      {d.is_final ? "최종 분배" : `제${d.distribution_no}차`} <span className="text-xs text-slate-500">{formatDate(d.distribution_date)} · {d.status === "paid" ? "지급 완료" : "지급 예정"}</span>
                      <span className="block text-xs text-slate-500">
                        {Object.entries(d.my_components)
                          .map(([k, v]) => `${DISTRIBUTION_COMPONENT_LABEL[k as DistributionComponent]} ${formatKRWFull(v)}`)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="tabular-nums text-slate-900">{formatKRWFull(d.my_amount)}</span>
                  </li>
                ))}
                {dists.length === 0 && <li className="px-6 py-6 text-center text-slate-500">확정된 분배가 없습니다.</li>}
              </ul>
            </section>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-6 py-4 text-base font-semibold text-slate-900">받은 통지 {notices.length}건</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {notices.slice(0, 20).map((n) => (
            <li key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-6 py-2.5">
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{NOTICE_TYPE_LABEL[n.notice_type]}</span>
              <span className="text-slate-900">{n.title}</span>
              <span className="ml-auto text-xs text-slate-500">
                {formatDate(n.sent_at)} · {n.acknowledged_at ? <span className="text-emerald-700">확인함</span> : "미확인"}
              </span>
            </li>
          ))}
          {notices.length === 0 && <li className="px-6 py-6 text-center text-slate-500">받은 통지가 없습니다.</li>}
        </ul>
      </section>
    </div>
  );
}
