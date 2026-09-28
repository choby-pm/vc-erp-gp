import Link from "next/link";
import CompanyForm from "@/components/company-form";

export const metadata = { title: "기업 등록 · VC ERP" };

export default function NewCompanyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/companies" className="text-sm text-slate-500 hover:text-indigo-600">
          ← 기업 목록
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">기업 등록</h1>
      </div>
      <CompanyForm />
    </div>
  );
}
