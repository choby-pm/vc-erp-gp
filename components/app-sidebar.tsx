"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import LogoutButton from "@/components/logout-button";
import { SIDEBAR_FOLDED_COOKIE } from "@/lib/ui-prefs";

// 전체 메뉴 사이드바
// · 넓은 화면: 왼쪽 고정. 로고 옆 버튼으로 접으면 아이콘만 보이는 좁은 폭이 된다 (쿠키에 기억 → 새로고침해도 유지, 깜빡임 없음)
// · 좁은 화면: ☰ 버튼으로 여닫는다

type Item = { href: string; label: string; icon: React.ReactNode };

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden>
    <path d={d} />
  </svg>
);

// 둥근 사각형 테두리 + 왼쪽 사이드바 칸 구분선
const PANEL = "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M9 3v18";

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "조합 운용",
    items: [
      { href: "/funds", label: "조합", icon: icon("M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6") },
      { href: "/deals", label: "딜 파이프라인", icon: icon("M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v5h-4z") },
      { href: "/companies", label: "기업", icon: icon("M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M8 8h3M8 12h3M8 16h3M3 21h18") },
    ],
  },
  {
    title: "기준 정보",
    items: [
      { href: "/lps", label: "출자자", icon: icon("M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.74") },
      { href: "/staff", label: "구성원", icon: icon("M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8") },
    ],
  },
];

export default function AppSidebar({ userName, initialFolded }: { userName: string; initialFolded: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // 좁은 화면 메뉴
  const [folded, setFolded] = useState(initialFolded); // 넓은 화면 접기

  function toggleFold() {
    const next = !folded;
    setFolded(next);
    document.cookie = `${SIDEBAR_FOLDED_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  const renderNav = (compact: boolean) => (
    <nav className={`flex flex-1 flex-col overflow-y-auto py-4 ${compact ? "gap-3 px-2" : "gap-6 px-3"}`}>
      {SECTIONS.map((section, i) => (
        <div key={section.title}>
          {compact ? (
            i > 0 && <div className="mx-2 mb-3 border-t border-slate-200" />
          ) : (
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{section.title}</p>
          )}
          <ul className={`space-y-0.5 ${compact ? "" : "mt-2"}`}>
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    title={compact ? item.label : undefined}
                    onClick={() => setOpen(false)} // 좁은 화면에서 열어 둔 메뉴는 이동하면 닫는다
                    className={`flex items-center rounded-lg py-2 text-sm font-medium ${compact ? "justify-center px-2" : "gap-3 px-3"} ${
                      active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {item.icon}
                    <span className={compact ? "sr-only" : ""}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const renderFooter = (compact: boolean) =>
    compact ? (
      <div className="flex flex-col items-center gap-2 border-t border-slate-200 py-3">
        <span title={userName} className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
          {userName.slice(0, 1)}
        </span>
        <LogoutButton compact />
      </div>
    ) : (
      <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-sm">
        <span className="truncate text-slate-700">{userName}</span>
        <LogoutButton />
      </div>
    );

  const logo = (
    <Link href="/funds" className="truncate text-sm font-bold text-slate-900">
      <span className="text-indigo-600">VC ERP</span> · GP
    </Link>
  );

  return (
    <>
      {/* 넓은 화면: 왼쪽 고정 사이드바 (접기 가능) */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 md:flex ${folded ? "w-16" : "w-60"}`}
      >
        <div className={`flex h-14 items-center border-b border-slate-200 ${folded ? "justify-center" : "justify-between pl-5 pr-3"}`}>
          {!folded && logo}
          <button
            type="button"
            onClick={toggleFold}
            aria-label={folded ? "메뉴 펼치기" : "메뉴 접기"}
            aria-expanded={!folded}
            title={folded ? "메뉴 펼치기" : "메뉴 접기"}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            {/* 사이드바 패널 아이콘: 테두리 + 왼쪽 칸 구분선 + 접기(‹)/펼치기(›) 방향 */}
            {folded ? icon(`${PANEL} M14 9l3 3-3 3`) : icon(`${PANEL} M17 15l-3-3 3-3`)}
          </button>
        </div>
        {renderNav(folded)}
        {renderFooter(folded)}
      </aside>

      {/* 좁은 화면: 상단 막대 + 여닫는 메뉴 */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 md:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label="메뉴 열기" className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100">
          {icon("M4 6h16M4 12h16M4 18h16")}
        </button>
        {logo}
      </header>
      {open && (
        <div className="fixed inset-0 z-30 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-5">
              {logo}
              <button type="button" onClick={() => setOpen(false)} aria-label="메뉴 닫기" className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
                {icon("M6 6l12 12M18 6L6 18")}
              </button>
            </div>
            {renderNav(false)}
            {renderFooter(false)}
          </aside>
        </div>
      )}
    </>
  );
}
