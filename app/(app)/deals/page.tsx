import Link from "next/link";
import DealBoard from "@/components/deal-board";
import { dealStats, listDeals, listFundOptions, listOwnerOptions } from "@/lib/services/deals";

export const metadata = { title: "딜 · VC ERP" };

export default async function DealsPage(props: PageProps<"/deals">) {
  const raw = await props.searchParams;
  const ownerId = typeof raw.owner_id === "string" ? raw.owner_id : null;
  const fundId = typeof raw.fund_id === "string" ? raw.fund_id : null;
  const uuid = (v: string | null) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
  const [deals, stats, owners, funds] = await Promise.all([
    listDeals({ owner_id: uuid(ownerId), fund_id: uuid(fundId) }),
    dealStats(),
    listOwnerOptions(),
    listFundOptions(),
  ]);
  const avgDays = Object.fromEntries(stats.durations.map((d) => [d.stage, d.avg_days]));

  const filterHref = (key: "owner_id" | "fund_id", value: string | null) => {
    const p = new URLSearchParams();
    const next = { owner_id: ownerId, fund_id: fundId, [key]: value };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    return p.toString() ? `/deals?${p}` : "/deals";
  };
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium ${active ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">딜 파이프라인</h1>
          <p className="mt-1 text-sm text-slate-500">발굴 → 검토 → 투심위 → 투자 확정. 어느 단계에서든 드롭할 수 있고, 투심위에서 검토로 되돌릴 수 있습니다.</p>
        </div>
        <Link href="/deals/new" className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          + 딜 등록
        </Link>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-xs text-slate-500">담당자</span>
          <Link href={filterHref("owner_id", null)} className={chip(!ownerId)}>
            전체
          </Link>
          {owners.map((o) => (
            <Link key={o.id} href={filterHref("owner_id", o.id)} className={chip(ownerId === o.id)}>
              {o.name}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-xs text-slate-500">조합</span>
          <Link href={filterHref("fund_id", null)} className={chip(!fundId)}>
            전체
          </Link>
          {funds.map((f) => (
            <Link key={f.id} href={filterHref("fund_id", f.id)} className={chip(fundId === f.id)}>
              {f.name}
            </Link>
          ))}
        </div>
      </div>

      <DealBoard deals={deals} avgDays={avgDays} funds={funds} />

      {stats.drops.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm">
          <h2 className="font-semibold text-slate-900">주요 드롭 사유</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {stats.drops.map((d) => (
              <li key={d.drop_reason} className="rounded-full bg-rose-50 px-3 py-1 text-xs text-rose-700">
                {d.drop_reason} · {d.count}건
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
