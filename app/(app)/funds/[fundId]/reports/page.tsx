import Link from "next/link";
import ReportCreateForm from "@/components/report-create-form";
import { formatDate } from "@/lib/format";
import { listReports, periodLabel } from "@/lib/services/reports";

export default async function ReportsPage(props: PageProps<"/funds/[fundId]/reports">) {
  const { fundId } = await props.params;
  const data = await listReports(fundId);
  const kst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  // 기본 선택: 직전 분기·직전 달 (보통 기간이 끝난 뒤 보고한다)
  const q = Math.floor(kst.getMonth() / 3) + 1;
  const quarterly = q === 1 ? { year: kst.getFullYear() - 1, no: 4 } : { year: kst.getFullYear(), no: q - 1 };
  const monthly = kst.getMonth() === 0 ? { year: kst.getFullYear() - 1, no: 12 } : { year: kst.getFullYear(), no: kst.getMonth() };

  return (
    <div className="space-y-6">
      {data.can_create ? (
        <ReportCreateForm fundId={fundId} defaults={{ quarterly, monthly }} />
      ) : (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">정기 보고는 조합을 결성한 뒤에 작성할 수 있습니다.</p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-6 py-4 text-base font-semibold text-slate-900">보고서 {data.reports.length}건</h2>
        {data.reports.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">아직 작성한 보고서가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.reports.map((r) => (
              <li key={r.id}>
                <Link href={`/funds/${fundId}/reports/${r.id}`} className="flex flex-wrap items-center gap-3 px-6 py-3 hover:bg-slate-50">
                  <span className="font-semibold text-slate-900">{periodLabel(r.period_type, r.period_start)}</span>
                  <span className="text-sm text-slate-500">
                    {formatDate(r.period_start)} ~ {formatDate(r.period_end)}
                  </span>
                  {r.is_correction && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-800">정정</span>}
                  <span className="ml-auto text-xs text-slate-500">{r.published_at ? `발행 ${formatDate(r.published_at)}` : ""}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
                    {r.status === "published" ? "발행" : "초안"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
