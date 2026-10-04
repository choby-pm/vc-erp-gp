import Link from "next/link";
import { formatDate, formatKRW } from "@/lib/format";
import { LP_STRATEGIES as STRATEGIES, LP_STRATEGY_LABEL as STRATEGY_LABEL } from "@/lib/lp-erp/labels";
import { listLpCalls, listMyApplications, lpErpConfigured, type LpCall } from "@/lib/services/lp-calls";

export const metadata = { title: "출자사업 공고 · VC ERP" };


// LP ERP 출자사업 공고 게시판 (D47). 볼 때마다 LP ERP를 읽는다 — GP에 저장하지 않는다
// 연동된 기관 공고에는 여기서 바로 지원하고, 연동 안 된 기관은 공고의 접수 방법대로 지원한다
export default async function CallsPage(props: PageProps<"/calls">) {
  const sp = await props.searchParams;
  const strategy = typeof sp.strategy === "string" && STRATEGIES.includes(sp.strategy) ? sp.strategy : undefined;
  let calls: LpCall[] = [];
  let error: string | null = null;
  if (!lpErpConfigured()) error = "LP ERP 연동 설정이 없어 공고를 읽을 수 없습니다 (LP 연동 화면에서 확인).";
  else {
    try {
      calls = await listLpCalls(strategy);
    } catch (e) {
      error = e instanceof Error ? e.message : "LP ERP 공고를 읽지 못했습니다";
    }
  }
  const applications = await listMyApplications();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">출자사업 공고</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          LP ERP를 쓰는 출자기관들의 접수 중 · 심사 중 출자사업 공고입니다. 연동된 기관 공고에는 여기서 조합을 골라 바로 지원하고, 선정되면 그 기관의 확약이 출자 제안에 들어옵니다.
          나머지 출자자는 지금처럼 개별 출자 제안으로 모읍니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {[undefined, ...STRATEGIES].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/calls?strategy=${s}` : "/calls"}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${strategy === s ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {s ? STRATEGY_LABEL[s] : "전체 분야"}
          </Link>
        ))}
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </p>
      ) : calls.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">지금 접수 중인 공고가 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {calls.map((c) => {
            const mine = applications.filter((a) => a.lp_program_id === c.id);
            return (
              <li key={c.id}>
                <Link href={`/calls/${c.id}`} className="block rounded-2xl border border-slate-200 bg-white p-5 hover:border-indigo-300">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                        {c.org_name}
                        {c.linked ? (
                          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700">연동 · 바로 지원</span>
                        ) : (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">기관 창구로 지원</span>
                        )}
                        {mine.length > 0 && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">지원 {mine.length}건</span>}
                      </p>
                      <h2 className="mt-0.5 text-base font-semibold text-slate-900">{c.name}</h2>
                      <p className="mt-1 text-xs text-slate-500">
                        접수 {formatDate(c.apply_start_date)} ~ {formatDate(c.apply_end_date)} · 부문 {c.tracks.length}개
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${c.status === "reviewing" ? "bg-slate-100 text-slate-600" : "bg-indigo-50 text-indigo-700"}`}>
                      {c.status === "reviewing" ? "심사 중" : c.days_left === 0 ? "오늘 마감" : `D-${c.days_left}`}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {c.tracks.map((t) => (
                      <span key={t.id} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                        {t.name} · {STRATEGY_LABEL[t.strategy] ?? t.strategy} · {formatKRW(t.planned_amount)} · {t.target_gp_count}곳
                      </span>
                    ))}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {applications.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">우리가 지원한 공고</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {applications.map((a) => (
              <li key={a.proposal_id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-2.5">
                <span>
                  <Link href={`/calls/${a.lp_program_id}`} className="font-medium text-slate-900 hover:text-indigo-700">
                    {a.lp_name} · {a.program_name} · {a.track_name}
                  </Link>
                  <span className="block text-xs text-slate-500">
                    {a.fund_name} · 요청 {formatKRW(a.proposed_amount)}
                  </span>
                </span>
                <span className={`text-xs ${a.apply_sent_at ? "text-emerald-700" : "text-rose-700"}`}>
                  {a.apply_sent_at ? `접수됨 ${formatDate(a.apply_sent_at)}` : `보내지 못함 — ${a.apply_error ?? "확인 필요"}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
