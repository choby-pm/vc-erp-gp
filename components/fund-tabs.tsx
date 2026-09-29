"use client";

import Link from "next/link";
import LinkPending from "@/components/link-pending";
import { usePathname, useSearchParams } from "next/navigation";

// 조합 상세 탭 (2단계)
// · 큰 탭 5개: 업무 흐름별로 묶는다 (개요 / 출자자·조합원 / 투자·회수 / 재무·회계 / 총회·보고)
// · 작은 탭: 같은 업무 안의 화면. 큰 탭을 누르면 첫 번째 작은 탭으로 간다
// · 아직 쓸 수 없는 단계의 탭도 숨기지 않고 흐리게 보여줘서 기능이 어디 있는지는 늘 알 수 있게 한다

type Sub = {
  href: string; // 조합 주소 뒤에 붙는 경로 ("" = 개요)
  label: string;
  view?: string[]; // /accounting 처럼 ?view= 로 나뉘는 화면
  needsFormation?: boolean;
};
type Group = { label: string; subs: Sub[] };

const GROUPS: Group[] = [
  {
    label: "개요",
    subs: [
      { href: "", label: "요약" },
      { href: "/profile", label: "조합 정보" },
    ],
  },
  {
    label: "출자자·조합원",
    subs: [
      { href: "/proposals", label: "출자 제안" },
      { href: "/members", label: "조합원·원장" },
      { href: "/capital-calls", label: "캐피탈콜" },
    ],
  },
  {
    label: "투자·회수",
    subs: [
      { href: "/investments", label: "투자 집행", needsFormation: true },
      { href: "/portfolio", label: "포트폴리오", needsFormation: true },
      { href: "/exits", label: "회수", needsFormation: true },
      { href: "/distributions", label: "분배", needsFormation: true }, // 회수한 돈을 조합원에게 돌려주는 흐름 (회수 → 분배)
    ],
  },
  {
    label: "재무·회계",
    subs: [
      { href: "/finance", label: "현금·비용" },
      { href: "/management-fees", label: "관리보수", needsFormation: true },
      { href: "/carried-interest", label: "성과보수", needsFormation: true },
      { href: "/accounting", label: "재무제표", view: ["statements"] },
      { href: "/accounting", label: "장부", view: ["trial", "ledger", "journal"] },
      { href: "/accounting", label: "결산", view: ["closing"] },
    ],
  },
  {
    label: "총회·보고",
    subs: [
      { href: "/meetings", label: "총회" },
      { href: "/terms", label: "규약" },
      { href: "/reports", label: "정기 보고", needsFormation: true },
      { href: "/notices", label: "통지" },
    ],
  },
];

const subHref = (base: string, s: Sub) => base + s.href + (s.view ? `?view=${s.view[0]}` : "");

export default function FundTabs({ fundId, formed }: { fundId: string; formed: boolean }) {
  const pathname = usePathname();
  const view = useSearchParams().get("view") ?? "statements";
  const base = `/funds/${fundId}`;

  // 현재 화면에 해당하는 작은 탭 (하위 상세 화면·수정 화면도 포함)
  const isActive = (s: Sub) => {
    if (s.href === "") return pathname === base;
    if (s.href === "/profile" && pathname === `${base}/edit`) return true; // 조합 정보 수정 화면
    if (!pathname.startsWith(base + s.href)) return false;
    return s.view ? s.view.includes(view) : true;
  };
  const activeGroup = GROUPS.find((g) => g.subs.some(isActive)) ?? GROUPS[0];

  return (
    <nav className="space-y-3">
      <div className="-mx-4 overflow-x-auto border-b border-slate-200 px-4">
        <ul className="flex min-w-max gap-1">
          {GROUPS.map((g) => {
            const active = g === activeGroup;
            const waiting = g.subs.every((s) => s.needsFormation) && !formed;
            return (
              <li key={g.label}>
                <Link
                  href={subHref(base, g.subs[0])}
                  title={waiting ? "조합을 결성한 뒤에 사용할 수 있습니다" : undefined}
                  className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold ${
                    active ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
                  } ${waiting && !active ? "text-slate-400" : ""}`}
                >
                  {g.label}
                  {waiting && <span className="rounded bg-slate-100 px-1 text-[10px] font-normal text-slate-400">결성 후</span>}
                  <LinkPending />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {activeGroup.subs.map((s) => {
          const active = isActive(s);
          const waiting = s.needsFormation && !formed;
          return (
            <li key={s.label}>
              <Link
                href={subHref(base, s)}
                title={waiting ? "조합을 결성한 뒤에 사용할 수 있습니다" : undefined}
                className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm ${
                  active ? "bg-slate-900 font-semibold text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                } ${waiting && !active ? "text-slate-400" : ""}`}
              >
                {s.label}
                {waiting && <span className="text-[10px] font-normal">· 결성 후</span>}
                <LinkPending />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
