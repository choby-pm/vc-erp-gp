import Link from "next/link";
import DealForm from "@/components/deal-form";
import { getCurrentUser } from "@/lib/auth/session";
import { listCompanyOptions } from "@/lib/services/companies";
import { listFundOptions, listOwnerOptions } from "@/lib/services/deals";

export const metadata = { title: "딜 등록 · VC ERP" };

export default async function NewDealPage(props: PageProps<"/deals/new">) {
  const raw = await props.searchParams;
  const [companies, owners, funds, me] = await Promise.all([listCompanyOptions(), listOwnerOptions(), listFundOptions(), getCurrentUser()]);
  const companyId = typeof raw.company_id === "string" && companies.some((c) => c.id === raw.company_id) ? raw.company_id : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/deals" className="text-sm text-slate-500 hover:text-indigo-600">
          ← 딜 파이프라인
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">딜 등록</h1>
        <p className="mt-1 text-sm text-slate-500">발굴 단계로 시작합니다. 드롭된 기업을 다시 검토할 때도 새 딜로 등록합니다.</p>
      </div>
      <DealForm
        companies={companies}
        owners={owners}
        funds={funds}
        defaultCompanyId={companyId}
        defaultOwnerId={owners.some((o) => o.id === me?.id) ? (me?.id ?? null) : null}
      />
    </div>
  );
}
