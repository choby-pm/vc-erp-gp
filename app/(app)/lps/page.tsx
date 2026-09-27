import Link from "next/link";
import { formatKRW, formatKRWFull } from "@/lib/format";
import { LP_TYPES, LP_TYPE_LABEL } from "@/lib/labels";
import { lpListQuerySchema } from "@/lib/schemas/lp";
import { listLps } from "@/lib/services/lps";

export const metadata = { title: "출자자 · VC ERP" };

export default async function LpsPage(props: PageProps<"/lps">) {
  const raw = await props.searchParams;
  const parsed = lpListQuerySchema.safeParse({
    q: typeof raw.q === "string" && raw.q ? raw.q : undefined,
    lp_type: typeof raw.lp_type === "string" && raw.lp_type ? raw.lp_type : undefined,
    page: typeof raw.page === "string" ? raw.page : undefined,
  });
  const query = parsed.success ? parsed.data : lpListQuerySchema.parse({});
  const { items, meta } = await listLps(query);
  const lastPage = Math.max(1, Math.ceil(meta.total / meta.page_size));

  // 현재 검색 조건을 유지한 채 일부만 바꾼 주소
  const href = (change: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged = { q: query.q, lp_type: query.lp_type, page: query.page, ...change };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "" && !(k === "page" && v === 1)) params.set(k, String(v));
    const s = params.toString();
    return s ? `/lps?${s}` : "/lps";
  };

  const filterClass = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium ${
      active ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
    }`;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">출자자</h1>
          <p className="mt-1 text-sm text-slate-500">조합에 출자하거나 출자를 검토하는 기관·개인. 한 출자자가 여러 조합에 참여할 수 있습니다.</p>
        </div>
        <Link href="/lps/new" className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          + 출자자 등록
        </Link>
      </div>

      <div className="space-y-3">
        <form action="/lps" className="flex gap-2">
          {query.lp_type && <input type="hidden" name="lp_type" value={query.lp_type} />}
          <input
            name="q"
            defaultValue={query.q}
            placeholder="이름, 사업자등록번호, 담당자로 검색"
            className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
          <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">검색</button>
        </form>
        <div className="flex flex-wrap gap-2">
          <Link href={href({ lp_type: undefined, page: 1 })} className={filterClass(!query.lp_type)}>
            전체
          </Link>
          {LP_TYPES.map((t) => (
            <Link key={t} href={href({ lp_type: t, page: 1 })} className={filterClass(query.lp_type === t)}>
              {LP_TYPE_LABEL[t]}
            </Link>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          {query.q || query.lp_type ? (
            <p className="text-sm text-slate-500">검색 조건에 맞는 출자자가 없습니다.</p>
          ) : (
            <>
              <p className="text-lg font-semibold text-slate-800">아직 등록된 출자자가 없습니다</p>
              <p className="mt-1 text-sm text-slate-500">출자 제안을 보내려면 먼저 출자자를 등록하세요.</p>
              <Link href="/lps/new" className="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                첫 출자자 등록하기
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">출자자</th>
                <th className="px-4 py-3">유형</th>
                <th className="px-4 py-3">사업자등록번호</th>
                <th className="px-4 py-3">담당자</th>
                <th className="px-4 py-3 text-right">참여 조합</th>
                <th className="px-4 py-3 text-right">약정 합계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((lp) => (
                <tr key={lp.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/lps/${lp.id}`} className="font-semibold text-slate-900 hover:text-indigo-600">
                      {lp.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{LP_TYPE_LABEL[lp.lp_type]}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-600">{lp.registration_no ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{lp.contact_name ?? "-"}</td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {lp.member_fund_count > 0 ? `${lp.member_fund_count}개` : lp.proposal_count > 0 ? `제안 ${lp.proposal_count}건` : "-"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" title={formatKRWFull(lp.total_commitment_amount)}>
                    {lp.total_commitment_amount > 0 ? formatKRW(lp.total_commitment_amount) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta.total > meta.page_size && (
        <div className="flex items-center justify-center gap-3 text-sm">
          {query.page > 1 ? <Link href={href({ page: query.page - 1 })} className="text-indigo-600 hover:underline">← 이전</Link> : <span className="text-slate-300">← 이전</span>}
          <span className="text-slate-500">
            {query.page} / {lastPage} 페이지 · 총 {meta.total}명
          </span>
          {query.page < lastPage ? <Link href={href({ page: query.page + 1 })} className="text-indigo-600 hover:underline">다음 →</Link> : <span className="text-slate-300">다음 →</span>}
        </div>
      )}
    </div>
  );
}
