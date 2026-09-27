import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import LoginForm from "./login-form";

export const metadata = { title: "로그인 · VC ERP" };

export default async function LoginPage() {
  // 이미 로그인한 상태면 홈으로 보낸다
  if (await getCurrentUser()) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold tracking-widest text-indigo-600">VC ERP</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">GP 운용 시스템</h1>
          <p className="mt-2 text-sm text-slate-500">펀드 기획부터 청산까지</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
