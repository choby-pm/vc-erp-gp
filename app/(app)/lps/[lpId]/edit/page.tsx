import Link from "next/link";
import LpForm from "@/components/lp-form";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getLp } from "@/lib/services/lps";

export default async function EditLpPage(props: PageProps<"/lps/[lpId]/edit">) {
  const { lpId } = await props.params;
  const lp = await loadOrNotFound(() => getLp(lpId));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/lps/${lp.id}`} className="text-sm text-slate-500 hover:text-indigo-600">
          ← {lp.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">출자자 수정</h1>
      </div>
      <LpForm lp={lp} />
    </div>
  );
}
