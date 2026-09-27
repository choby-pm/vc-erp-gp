"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 릴리스가 진행되면서 메뉴가 늘어난다 (출자자: R1-2, 딜: R4)
const LINKS = [
  { href: "/funds", label: "조합", ready: true },
  { href: "/lps", label: "출자자", ready: false },
  { href: "/deals", label: "딜", ready: false },
];

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 text-sm">
      {LINKS.map((link) =>
        link.ready ? (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-1.5 font-medium ${
              pathname.startsWith(link.href) ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {link.label}
          </Link>
        ) : (
          <span key={link.href} title="다음 릴리스에서 추가됩니다" className="cursor-not-allowed rounded-md px-3 py-1.5 text-slate-300">
            {link.label}
          </span>
        ),
      )}
    </nav>
  );
}
