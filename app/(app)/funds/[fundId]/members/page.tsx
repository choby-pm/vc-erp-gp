import Link from "next/link";
import RosterCancel from "@/components/roster-cancel";
import CommitmentIncreaseForm from "@/components/commitment-increase-form";
import LedgerReverseButton from "@/components/ledger-reverse-button";
import RosterForm from "@/components/roster-form";
import { formatDate, formatKRW, formatKRWFull, formatPercent } from "@/lib/format";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getFund } from "@/lib/services/funds";
import { LEDGER_ENTRY_TYPE_LABEL, LEDGER_SOURCE_LABEL, listLedger } from "@/lib/services/ledger";
import { getRoster } from "@/lib/services/roster";
import { listPassedAgendas } from "@/lib/services/terms";

export default async function FundMembersPage(props: PageProps<"/funds/[fundId]/members">) {
  const { fundId } = await props.params;
  const fund = await loadOrNotFound(() => getFund(fundId));
  const [data, ledger, agendas] = await Promise.all([getRoster(fundId), listLedger(fundId), listPassedAgendas(fundId, "terms_amendment")]);
  // 결성 이후 약정 증액은 가결된 규약 변경 안건이 근거 (BR-MEM-06)
  const canIncrease = (fund.status === "formed" || fund.status === "operating") && data.members.length > 0;
  const money = (v: number) => (
    <span title={formatKRWFull(v)} className="tabular-nums">
      {v ? formatKRW(v) : "-"}
    </span>
  );

  return (
    <div className="space-y-6">
      {data.roster && <p className="text-sm text-slate-500">조합원 명부 확정일 {formatDate(data.roster.confirmed_date)}</p>}

      {fund.status === "planning" && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          명부는 모집 중인 조합에서 확정합니다. 조합 화면에서 모집을 시작하고 출자 확약을 받으세요.
        </p>
      )}

      {data.can_confirm && <RosterForm fundId={fund.id} data={data} />}

      {data.roster && (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                조합원 {data.members.length}명 · 약정 총액 {formatKRW(data.totals.commitment_amount)}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                GP 출자 비율 {formatPercent(data.totals.gp_ratio, 2)} (최소 {formatPercent(data.gp_commitment_min_ratio)})
                {data.min_fund_amount !== null &&
                  (data.totals.commitment_amount >= data.min_fund_amount
                    ? ` · 최소 결성액 ${formatKRW(data.min_fund_amount)} 충족`
                    : ` · 최소 결성액 ${formatKRW(data.min_fund_amount)} 미달`)}
              </p>
            </div>
            {canIncrease ? (
              agendas.length > 0 ? (
                <CommitmentIncreaseForm
                  fundId={fund.id}
                  members={data.members.map((m) => ({ member_id: m.member_id, name: m.lp_name ?? "GP", commitment_amount: m.commitment_amount }))}
                  agendas={agendas}
                  unitAmount={fund.terms.unit_amount}
                />
              ) : (
                <p className="text-xs text-slate-500">약정 증액은 총회에서 ‘규약 변경’ 안건을 가결한 뒤에 할 수 있습니다</p>
              )
            ) : data.cancel_blocked_reason ? (
              <p className="text-xs text-slate-500">{data.cancel_blocked_reason}</p>
            ) : (
              <RosterCancel fundId={fund.id} />
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-2.5">조합원</th>
                  <th className="px-3 py-2.5 text-right">약정액</th>
                  <th className="px-3 py-2.5 text-right">지분율</th>
                  <th className="px-3 py-2.5 text-right">요청액</th>
                  <th className="px-3 py-2.5 text-right">납입액</th>
                  <th className="px-6 py-2.5 text-right">잔여 약정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.members.map((m) => (
                  <tr key={m.member_id}>
                    <td className="px-6 py-3">
                      {m.member_type === "gp" ? (
                        <span className="font-semibold text-slate-900">
                          GP <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">운용사</span>
                        </span>
                      ) : (
                        <Link href={`/lps/${m.lp_id}`} className="font-semibold text-slate-900 hover:text-indigo-600">
                          {m.lp_name}
                        </Link>
                      )}
                      {m.loc_amount !== null && m.loc_amount !== m.commitment_amount && (
                        <p className="text-xs text-slate-500">확약 {formatKRW(m.loc_amount)}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900">{money(m.commitment_amount)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatPercent(m.ownership_ratio, 2)}</td>
                    <td className="px-3 py-3 text-right">{money(m.called_amount)}</td>
                    <td className="px-3 py-3 text-right">{money(m.paid_amount)}</td>
                    <td className="px-6 py-3 text-right">{money(m.unfunded_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data.cancelled.length > 0 && (
        <details className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm">
          <summary className="cursor-pointer text-slate-600">취소된 명부 {data.cancelled.length}건</summary>
          <ul className="mt-2 space-y-1 text-slate-500">
            {data.cancelled.map((c) => (
              <li key={String(c.cancelled_at)}>
                {formatDate(c.confirmed_date)} 확정 → {formatDate(c.cancelled_at)} 취소 · {c.cancel_reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">원장</h2>
          <p className="mt-0.5 text-xs text-slate-500">조합원 돈의 유일한 원본. 수정·삭제할 수 없고 정정은 취소 행(음수)으로 남습니다.</p>
        </div>
        {ledger.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">아직 원장 기록이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-2.5">일자</th>
                  <th className="px-3 py-2.5">조합원</th>
                  <th className="px-3 py-2.5">구분</th>
                  <th className="px-3 py-2.5">원인</th>
                  <th className="px-3 py-2.5 text-right">금액</th>
                  <th className="px-6 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.map((e) => (
                  <tr key={e.id} className={e.reversed ? "text-slate-400 line-through decoration-slate-300" : ""}>
                    <td className="px-6 py-2.5">{formatDate(e.entry_date)}</td>
                    <td className="px-3 py-2.5">{e.member_name}</td>
                    <td className="px-3 py-2.5">
                      {LEDGER_ENTRY_TYPE_LABEL[e.entry_type]}
                      {e.reversal_of_id && <span className="ml-1 rounded bg-rose-100 px-1.5 text-xs text-rose-700 no-underline">취소</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">
                      {LEDGER_SOURCE_LABEL[e.source_type] ?? e.source_type}
                      {e.memo && <span className="block text-xs">{e.memo}</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${e.amount < 0 ? "text-rose-700" : ""}`} title={formatKRWFull(e.amount)}>
                      {e.amount < 0 ? `−${formatKRW(-e.amount)}` : formatKRW(e.amount)}
                    </td>
                    <td className="px-6 py-2.5 text-right">
                      {/* 납입만 여기서 취소한다. 약정은 명부 취소, 분배는 분배 문서에서 (BR-LED-02) */}
                      {e.entry_type === "contribution" && !e.reversal_of_id && !e.reversed && (
                        <LedgerReverseButton fundId={fund.id} entryId={e.id} label={`${e.member_name} 납입 ${formatKRWFull(e.amount)} (${formatDate(e.entry_date)})`} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
