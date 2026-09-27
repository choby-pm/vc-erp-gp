import Link from "next/link";
import { formatDate } from "@/lib/format";
import { listStaff } from "@/lib/services/staff";

export const metadata = { title: "구성원 · VC ERP" };

const TABS = [
  { key: "active", label: "재직 중" },
  { key: "left", label: "퇴사" },
  { key: "all", label: "전체" },
] as const;

export default async function StaffPage(props: PageProps<"/staff">) {
  const { status: raw } = await props.searchParams;
  const status = raw === "left" || raw === "all" ? raw : "active";
  const staff = await listStaff(status);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">구성원</h1>
          <p className="mt-1 text-sm text-slate-500">운용사 소속 인원. 조합 운용 인력은 구성원 중에서 지정합니다.</p>
        </div>
        <Link href="/staff/new" className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          + 구성원 등록
        </Link>
      </div>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "active" ? "/staff" : `/staff?status=${t.key}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              status === t.key ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {staff.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">
          {status === "active" ? "재직 중인 구성원이 없습니다." : "해당하는 구성원이 없습니다."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">사번</th>
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">직위 · 부서</th>
                <th className="px-4 py-3">입사일</th>
                <th className="px-4 py-3">로그인 계정</th>
                <th className="px-4 py-3 text-right">담당 조합</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.map((s) => (
                <tr key={s.id} className={`hover:bg-slate-50 ${s.left_date ? "text-slate-400" : ""}`}>
                  <td className="px-4 py-3 font-mono text-xs">{s.employee_no}</td>
                  <td className="px-4 py-3">
                    <Link href={`/staff/${s.id}`} className="font-semibold text-slate-900 hover:text-indigo-600">
                      {s.name}
                    </Link>
                    {s.left_date && <span className="ml-2 text-xs">퇴사 {formatDate(s.left_date)}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.position}
                    {s.department && <span className="text-slate-400"> · {s.department}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(s.hired_date)}</td>
                  <td className="px-4 py-3">
                    {!s.has_account ? (
                      <span className="text-slate-400">없음</span>
                    ) : s.account_disabled ? (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">중지됨</span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">사용 중</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{s.active_fund_count > 0 ? `${s.active_fund_count}개` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
