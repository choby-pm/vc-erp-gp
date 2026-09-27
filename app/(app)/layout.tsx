import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import LogoutButton from "@/components/logout-button";
import NavLinks from "@/components/nav-links";

// 로그인 후 화면의 공통 틀 (상단 메뉴). 로그인하지 않았으면 로그인 화면으로 보낸다
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex flex-1 flex-col bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link href="/funds" className="text-sm font-bold text-slate-900">
            <span className="text-indigo-600">VC ERP</span> · GP
          </Link>
          <NavLinks />
          <div className="ml-auto flex items-center gap-3 text-sm text-slate-600">
            <span className="hidden sm:inline">{user.name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
