import Link from "next/link";
import StaffForm from "@/components/staff-form";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getStaff } from "@/lib/services/staff";

export default async function EditStaffPage(props: PageProps<"/staff/[staffId]/edit">) {
  const { staffId } = await props.params;
  const staff = await loadOrNotFound(() => getStaff(staffId));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/staff/${staff.id}`} className="text-sm text-slate-500 hover:text-indigo-600">
          ← {staff.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">구성원 수정</h1>
      </div>
      <StaffForm staff={staff} />
    </div>
  );
}
