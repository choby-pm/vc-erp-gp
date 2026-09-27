import FundForm from "@/components/fund-form";

export const metadata = { title: "새 조합 · VC ERP" };

export default function NewFundPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">새 조합 기획</h1>
        <p className="mt-1 text-sm text-slate-500">
          조합은 &lsquo;기획&rsquo; 상태로 만들어집니다. 결성 전까지는 기본 정보와 규약 조건을 자유롭게 고칠 수 있습니다.
        </p>
      </div>
      <FundForm />
    </div>
  );
}
