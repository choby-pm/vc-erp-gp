import Link from "next/link";
import CompanyForm from "@/components/company-form";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getCompany } from "@/lib/services/companies";

export default async function EditCompanyPage(props: PageProps<"/companies/[companyId]/edit">) {
  const { companyId } = await props.params;
  const company = await loadOrNotFound(() => getCompany(companyId));
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/companies/${company.id}`} className="text-sm text-slate-500 hover:text-indigo-600">
          ← {company.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">기업 정보 수정</h1>
      </div>
      <CompanyForm company={company} />
    </div>
  );
}
