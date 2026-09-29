import Link from "next/link";
import { FundStatusBadge } from "@/components/fund-status";
import StaffAccountPanel from "@/components/staff-account-panel";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { MANAGER_ROLE_LABEL } from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getStaff } from "@/lib/services/staff";

export default async function StaffDetailPage(props: PageProps<"/staff/[staffId]">) {
  const { staffId } = await props.params;
  const [staff, me] = await Promise.all([loadOrNotFound(() => getStaff(staffId)), getCurrentUser()]);

  const info: [string, string][] = [
    ["사번", staff.employee_no],
    ["직위", staff.position],
    ["부서", staff.department ?? "-"],
    ["입사일", formatDate(staff.hired_date)],
    ["퇴사일", staff.left_date ? formatDate(staff.left_date) : "재직 중"],
    ["업무 이메일", staff.email ?? "-"],
    ["전화번호", staff.phone ?? "-"],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/staff" className="text-sm text-slate-500 hover:text-indigo-600">
          ← 구성원 목록
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{staff.name}</h1>
          <span className="text-slate-500">{staff.position}</span>
          {staff.left_date ? (
            <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">퇴사</span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">재직 중</span>
          )}
          <Link href={`/staff/${staff.id}/edit`} className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            수정
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">인사 정보</h2>
            <dl className="mt-4 grid gap-x-8 text-sm sm:grid-cols-2">
              {info.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-slate-100 py-2.5">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-right font-medium text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">조합 운용 이력</h2>
            <p className="mt-0.5 text-xs text-slate-500">운용 인력으로 지정된 조합. 교체되어도 이력은 남습니다.</p>
            {staff.assignments.length === 0 ? (
              <p className="mt-6 rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                아직 운용 인력으로 지정된 조합이 없습니다.
              </p>
            ) : (
              <table className="mt-4 w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="py-2">조합</th>
                    <th className="py-2">역할</th>
                    <th className="py-2">기간</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staff.assignments.map((a) => (
                    <tr key={`${a.fund_id}-${a.start_date}`} className={a.end_date ? "text-slate-400" : ""}>
                      <td className="py-2.5">
                        <Link href={`/funds/${a.fund_id}`} className="font-medium hover:text-indigo-600">
                          {a.fund_name}
                        </Link>{" "}
                        <FundStatusBadge status={a.fund_status} />
                      </td>
                      <td className="py-2.5">{MANAGER_ROLE_LABEL[a.role]}</td>
                      <td className="py-2.5">
                        {formatDate(a.start_date)} ~ {a.end_date ? formatDate(a.end_date) : "현재"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <StaffAccountPanel staff={staff} isSelf={staff.account?.user_id === me?.id} canManage={me?.role === "admin"} />
      </div>
    </div>
  );
}
