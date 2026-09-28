import Link from "next/link";
import { formatKRW } from "@/lib/format";
import { companyListQuerySchema } from "@/lib/schemas/deal";
import { listCompanies } from "@/lib/services/companies";

export const metadata = { title: "기업 · VC ERP" };

export default async function CompaniesPage(props: PageProps<"/companies">) {
  const raw = await props.searchParams;
  const parsed = companyListQuerySchema.safeParse({
    q: typeof raw.q === "string" && raw.q ? raw.q : undefined,
    page: typeof raw.page === "string" ? raw.page : undefined,
  });
  const query = parsed.success ? parsed.data : companyListQuerySchema.parse({});
  const { items, meta } = await listCompanies(query);
  const lastPage = Math.max(1, Math.ceil(meta.total / meta.page_size));
  const href = (page: number) => {
    const p = new URLSearchParams();
    if (query.q) p.set("q", query.q);
    if (page > 1) p.set("page", String(page));
    return p.toString() ? `/companies?${p}` : "/companies";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">기업</h1>
          <p className="mt-1 text-sm text-slate-500">투자를 검토했거나 투자한 기업. 한 기업의 딜 이력과 조합별 투자 현황을 함께 봅니다.</p>
        </div>
        <Link href="/companies/new" className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          + 기업 등록
        </Link>
      </div>

      <form action="/companies" className="flex gap-2">
        <input
          name="q"
          defaultValue={query.q}
          placeholder="기업명, 사업자등록번호, 업종, 대표자로 검색"
          className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">검색</button>
      </form>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">
          {query.q ? "검색 결과가 없습니다." : "등록된 기업이 없습니다. 딜을 등록할 때 함께 등록할 수도 있습니다."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">기업명</th>
                <th className="px-4 py-3">업종</th>
                <th className="px-4 py-3">대표자</th>
                <th className="px-4 py-3 text-right">딜</th>
                <th className="px-4 py-3 text-right">누적 투자</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/companies/${c.id}`} className="font-semibold text-slate-900 hover:text-indigo-600">
                      {c.name}
                    </Link>
                    {c.registration_no && <p className="text-xs tabular-nums text-slate-500">{c.registration_no}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.sector ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{c.ceo_name ?? "-"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {c.deal_count}
                    {c.open_deal_count > 0 && <span className="ml-1 text-xs text-indigo-600">(진행 {c.open_deal_count})</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.invested_amount > 0 ? formatKRW(c.invested_amount) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lastPage > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          {query.page > 1 && (
            <Link href={href(query.page - 1)} className="text-indigo-600 hover:underline">
              ← 이전
            </Link>
          )}
          <span className="text-slate-500">
            {query.page} / {lastPage}
          </span>
          {query.page < lastPage && (
            <Link href={href(query.page + 1)} className="text-indigo-600 hover:underline">
              다음 →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
