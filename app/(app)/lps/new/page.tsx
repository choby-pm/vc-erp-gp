import Link from "next/link";
import LpForm from "@/components/lp-form";

export const metadata = { title: "출자자 등록 · VC ERP" };

export default function NewLpPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/lps" className="text-sm text-slate-500 hover:text-indigo-600">
          ← 출자자 목록
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">출자자 등록</h1>
        <p className="mt-1 text-sm text-slate-500">등록한 출자자는 모든 조합의 출자 제안에서 선택할 수 있습니다.</p>
      </div>
      <LpForm />
    </div>
  );
}
