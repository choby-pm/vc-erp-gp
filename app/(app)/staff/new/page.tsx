import Link from "next/link";
import NoPermission from "@/components/no-permission";
import StaffForm from "@/components/staff-form";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata = { title: "구성원 등록 · VC ERP" };

export default async function NewStaffPage() {
  const me = await getCurrentUser();
  if (me?.role !== "admin") return <NoPermission area="구성원 등록" role={me?.role} />;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/staff" className="text-sm text-slate-500 hover:text-indigo-600">
          ← 구성원 목록
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">구성원 등록</h1>
      </div>
      <StaffForm />
    </div>
  );
}
