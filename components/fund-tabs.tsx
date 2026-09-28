"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 조합 상세의 탭. 어느 화면에 있든 같은 조합의 다른 업무로 바로 옮겨 갈 수 있다.
// 아직 쓸 수 없는 단계의 탭도 숨기지 않고 흐리게 보여줘서 기능이 어디 있는지는 늘 알 수 있게 한다

const TABS = [
  { href: "", label: "개요" },
  { href: "/proposals", label: "출자자 모집" },
  { href: "/members", label: "조합원·원장" },
  { href: "/meetings", label: "총회" },
  { href: "/terms", label: "규약" },
  { href: "/capital-calls", label: "캐피탈콜" },
  { href: "/management-fees", label: "관리보수", needsFormation: true },
  { href: "/investments", label: "투자 집행", needsFormation: true },
  { href: "/portfolio", label: "포트폴리오", needsFormation: true },
  { href: "/reports", label: "보고", needsFormation: true },
];

export default function FundTabs({ fundId, formed }: { fundId: string; formed: boolean }) {
  const pathname = usePathname();
  const base = `/funds/${fundId}`;

  return (
    <nav className="-mx-4 overflow-x-auto border-b border-slate-200 px-4">
      <ul className="flex min-w-max gap-1">
        {TABS.map((tab) => {
          const href = base + tab.href;
          // 개요 탭은 개요와 수정 화면에서, 나머지는 하위 화면(상세 포함)까지 선택된 것으로 본다
          const active = tab.href === "" ? pathname === base || pathname === `${base}/edit` : pathname.startsWith(href);
          const waiting = tab.needsFormation && !formed;
          return (
            <li key={tab.label}>
              <Link
                href={href}
                title={waiting ? "조합을 결성한 뒤에 사용할 수 있습니다" : undefined}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium ${
                  active ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
                } ${waiting && !active ? "text-slate-400" : ""}`}
              >
                {tab.label}
                {waiting && <span className="rounded bg-slate-100 px-1 text-[10px] font-normal text-slate-400">결성 후</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
