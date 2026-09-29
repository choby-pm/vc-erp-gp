import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import AppSidebar from "@/components/app-sidebar";
import { SIDEBAR_FOLDED_COOKIE } from "@/lib/ui-prefs";

// 로그인 후 화면의 공통 틀 (왼쪽 사이드바 메뉴). 로그인하지 않았으면 로그인 화면으로 보낸다
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // 사이드바 접힘 상태를 서버에서 읽어, 처음 그릴 때부터 맞는 폭으로 보여준다
  const folded = (await cookies()).get(SIDEBAR_FOLDED_COOKIE)?.value === "1";

  return (
    <div className="flex flex-1 flex-col bg-slate-50 md:flex-row">
      <AppSidebar userName={user.name} userRole={user.role} initialFolded={folded} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">{children}</div>
      </main>
    </div>
  );
}
