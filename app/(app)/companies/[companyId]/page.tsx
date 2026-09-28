import Link from "next/link";
import { DealStageBadge } from "@/components/deal-stage";
import { FundStatusBadge } from "@/components/fund-status";
import { formatDate, formatKRW, formatKRWFull } from "@/lib/format";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getCompany } from "@/lib/services/companies";

const HOLDING_LABEL = { holding: "보유 중", partially_exited: "일부 회수", exited: "전액 회수" } as const;

export default async function CompanyDetailPage(props: PageProps<"/companies/[companyId]">) {
  const { companyId } = await props.params;
  const company = await loadOrNotFound(() => getCompany(companyId));

  const info: [string, string][] = [
    ["사업자등록번호", company.registration_no ?? "-"],
    ["업종·분야", company.sector ?? "-"],
    ["대표자", company.ceo_name ?? "-"],
    ["설립일", company.founded_date ? formatDate(company.founded_date) : "-"],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/companies" className="text-sm text-slate-500 hover:text-indigo-600">
          ← 기업 목록
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{company.name}</h1>
          <div className="ml-auto flex gap-2">
            <Link href={`/deals/new?company_id=${company.id}`} className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
              + 딜 등록
            </Link>
            <Link href={`/companies/${company.id}/edit`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              수정
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900">기업 정보</h2>
          <dl className="mt-4 divide-y divide-slate-100 text-sm">
            {info.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-2.5">
                <dt className="text-slate-500">{label}</dt>
                <dd className="text-right font-medium text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">조합별 투자 현황</h2>
            {company.holdings.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">아직 투자한 조합이 없습니다.</p>
            ) : (
              <table className="mt-4 w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="py-2">조합</th>
                    <th className="py-2 text-right">취득원가</th>
                    <th className="py-2 text-right">장부가액</th>
                    <th className="py-2 text-right">공정가치</th>
                    <th className="py-2 text-right">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {company.holdings.map((h) => (
                    <tr key={h.fund_id}>
                      <td className="py-2.5">
                        <Link href={`/funds/${h.fund_id}`} className="font-medium hover:text-indigo-600">
                          {h.fund_name}
                        </Link>{" "}
                        <FundStatusBadge status={h.fund_status} />
                      </td>
                      <td className="py-2.5 text-right tabular-nums" title={formatKRWFull(h.invested_amount)}>
                        {formatKRW(h.invested_amount)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{formatKRW(h.remaining_cost_amount)}</td>
                      <td className="py-2.5 text-right tabular-nums">{formatKRW(h.current_value_amount)}</td>
                      <td className="py-2.5 text-right text-slate-600">{HOLDING_LABEL[h.holding_status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">딜 이력 {company.deals.length}건</h2>
            <p className="mt-0.5 text-xs text-slate-500">드롭된 기업을 다시 검토하면 새 딜이 생깁니다. 과거 딜도 모두 남습니다.</p>
            {company.deals.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">아직 딜이 없습니다.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {company.deals.map((d) => (
                  <li key={d.id}>
                    <Link href={`/deals/${d.id}`} className="flex flex-wrap items-center gap-3 py-2.5 hover:text-indigo-600">
                      <DealStageBadge stage={d.stage} />
                      <span>
                        {formatDate(d.sourced_date)} 발굴 · 담당 {d.owner_name}
                      </span>
                      {d.target_fund_name && (
                        <span className="text-slate-500">
                          → {d.target_fund_name}
                          {d.expected_amount ? ` ${formatKRW(d.expected_amount)}` : ""}
                        </span>
                      )}
                      {d.drop_reason && <span className="text-xs text-rose-600">드롭 사유: {d.drop_reason}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
