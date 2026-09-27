import Link from "next/link";
import StaffForm from "@/components/staff-form";

export const metadata = { title: "구성원 등록 · VC ERP" };

export default function NewStaffPage() {
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
