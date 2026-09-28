import Link from "next/link";

// 딜·기업 메뉴 공통 머리: 제목 + 탭 (딜 파이프라인 / 기업). 딜은 기업에 대한 투자 검토 건이라 한 메뉴로 묶는다

const TABS = [
  { key: "deals", href: "/deals", label: "딜 파이프라인" },
  { key: "companies", href: "/companies", label: "기업" },
] as const;

export default function DealSectionHeader({
  active,
  description,
  action,
}: {
  active: (typeof TABS)[number]["key"];
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">딜·기업</h1>
      <div className="mt-6 -mx-4 overflow-x-auto border-b border-slate-200 px-4">
        <ul className="flex min-w-max gap-1">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={t.href}
                aria-current={active === t.key ? "page" : undefined}
                className={`-mb-px block border-b-2 px-4 py-2.5 text-sm font-semibold ${
                  active === t.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">{description}</p>
        <div className="shrink-0">{action}</div>
      </div>
    </div>
  );
}
