import Link from "next/link";
import { redirect } from "next/navigation";
import FundForm from "@/components/fund-form";
import { getFund } from "@/lib/services/funds";
import { loadOrNotFound } from "@/lib/page-helpers";

export default async function EditFundPage(props: PageProps<"/funds/[fundId]/edit">) {
  const { fundId } = await props.params;
  const fund = await loadOrNotFound(() => getFund(fundId));

  // 결성 이후에는 수정 화면에 들어올 수 없다 (BR-FUND-08, BR-TERM-01)
  if (!fund.editable) redirect(`/funds/${fund.id}`);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/funds/${fund.id}`} className="text-sm text-slate-500 hover:text-indigo-600">
          ← {fund.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">펀드 수정</h1>
      </div>
      <FundForm fund={fund} />
    </div>
  );
}
