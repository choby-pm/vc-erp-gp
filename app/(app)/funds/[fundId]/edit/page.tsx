import Link from "next/link";
import { redirect } from "next/navigation";
import FundForm from "@/components/fund-form";
import { getFund } from "@/lib/services/funds";
import { loadOrNotFound } from "@/lib/page-helpers";

export default async function EditFundPage(props: PageProps<"/funds/[fundId]/edit">) {
  const { fundId } = await props.params;
  const fund = await loadOrNotFound(() => getFund(fundId));

  // 결성 이후에는 수정 화면에 들어올 수 없다 (BR-FUND-08, BR-TERM-01)
  if (!fund.editable) redirect(`/funds/${fund.id}/profile`);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/funds/${fund.id}/profile`} className="text-sm text-slate-500 hover:text-indigo-600">
          ← 조합 정보
        </Link>
        <h2 className="mt-2 text-xl font-bold text-slate-900">조합 정보 수정</h2>
      </div>
      <FundForm fund={fund} />
    </div>
  );
}
