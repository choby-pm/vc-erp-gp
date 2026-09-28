import Link from "next/link";
import { FundStatusBadge } from "@/components/fund-status";
import { formatDate, formatKRW, formatKRWFull } from "@/lib/format";
import { LP_TYPE_LABEL, PROPOSAL_STATUS_LABEL } from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getLp } from "@/lib/services/lps";

export default async function LpDetailPage(props: PageProps<"/lps/[lpId]">) {
  const { lpId } = await props.params;
  const lp = await loadOrNotFound(() => getLp(lpId));

  const info: [string, string][] = [
    ["유형", LP_TYPE_LABEL[lp.lp_type]],
    ["사업자등록번호", lp.registration_no ?? "-"],
    ["담당자", lp.contact_name ?? "-"],
    ["이메일", lp.contact_email ?? "-"],
    ["전화번호", lp.contact_phone ?? "-"],
    ["등록일", formatDate(lp.created_at)],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/lps" className="text-sm text-slate-500 hover:text-indigo-600">
          ← 출자자 목록
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{lp.name}</h1>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{LP_TYPE_LABEL[lp.lp_type]}</span>
          <Link href={`/lps/${lp.id}/edit`} className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            수정
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900">기본 정보</h2>
          <dl className="mt-4 divide-y divide-slate-100 text-sm">
            {info.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-2.5">
                <dt className="text-slate-500">{label}</dt>
                <dd className="text-right font-medium text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
          {lp.memo && (
            <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <p className="text-xs font-semibold">내부 메모 · LP 비공개</p>
              <p className="mt-1 whitespace-pre-wrap">{lp.memo}</p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-slate-900">조합별 참여 현황</h2>
          <p className="mt-0.5 text-xs text-slate-500">출자 제안부터 약정·납입까지 이 출자자가 참여한 모든 조합</p>
          {lp.participations.length === 0 ? (
            <p className="mt-6 rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              아직 참여한 조합이 없습니다. 조합 화면에서 출자 제안을 보내면 여기에 표시됩니다.
            </p>
          ) : (
            <table className="mt-4 w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-2">조합</th>
                  <th className="py-2">제안 상태</th>
                  <th className="py-2 text-right">확약</th>
                  <th className="py-2 text-right">약정</th>
                  <th className="py-2 text-right">납입</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lp.participations.map((p) => (
                  <tr key={p.fund_id}>
                    <td className="py-2.5">
                      <Link href={`/funds/${p.fund_id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                        {p.fund_name}
                      </Link>{" "}
                      <FundStatusBadge status={p.fund_status} />
                    </td>
                    <td className="py-2.5 text-slate-600">{p.proposal_status ? PROPOSAL_STATUS_LABEL[p.proposal_status] : "-"}</td>
                    <td className="py-2.5 text-right tabular-nums" title={formatKRWFull(p.loc_amount)}>{p.loc_amount ? formatKRW(p.loc_amount) : "-"}</td>
                    <td className="py-2.5 text-right tabular-nums" title={formatKRWFull(p.commitment_amount)}>{p.commitment_amount ? formatKRW(p.commitment_amount) : "-"}</td>
                    <td className="py-2.5 text-right tabular-nums" title={formatKRWFull(p.paid_amount)}>{p.paid_amount ? formatKRW(p.paid_amount) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
