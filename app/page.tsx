import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import LogoutButton from "./logout-button";

// 홈. R1부터 펀드 목록과 대시보드가 이 자리에 들어온다
export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex flex-1 flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <p className="text-sm font-bold text-slate-900">
            <span className="text-indigo-600">VC ERP</span> · GP
          </p>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>{user.name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900">안녕하세요, {user.name}님</h1>
        <p className="mt-2 text-slate-600">
          로그인이 정상적으로 동작합니다. 다음 릴리스(R1)에서 펀드 기획과 LP 모집 화면이 이곳에 추가됩니다.
        </p>
      </main>
    </div>
  );
}
