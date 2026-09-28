import Link from "next/link";
import { DealActions, DealInfoForm, DealNoteForm } from "@/components/deal-panel";
import { DealStageBadge } from "@/components/deal-stage";
import { formatDate, formatKRW } from "@/lib/format";
import { DEAL_NEXT, DEAL_STAGE_LABEL, type DealStage } from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getDeal, listFundOptions, listOwnerOptions } from "@/lib/services/deals";

const FLOW: DealStage[] = ["sourcing", "reviewing", "ic", "approved"];

const formatDateTime = (d: Date) =>
  new Date(d).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function DealDetailPage(props: PageProps<"/deals/[dealId]">) {
  const { dealId } = await props.params;
  const deal = await loadOrNotFound(() => getDeal(dealId));
  const [owners, funds] = await Promise.all([listOwnerOptions(), listFundOptions()]);
  const open = DEAL_NEXT[deal.stage].length > 0;
  const reached = new Set(deal.history.map((h) => h.to_stage));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/deals" className="text-sm text-slate-500 hover:text-indigo-600">
          ← 딜 파이프라인
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">
            <Link href={`/companies/${deal.company_id}`} className="hover:text-indigo-600">
              {deal.company_name}
            </Link>
          </h1>
          <DealStageBadge stage={deal.stage} />
          <span className="text-sm text-slate-500">
            {deal.sector && `${deal.sector} · `}담당 {deal.owner_name} · {formatDate(deal.sourced_date)} 발굴
          </span>
        </div>
      </div>

      {/* 단계 진행 표시 */}
      <ol className="grid grid-cols-4 gap-2">
        {FLOW.map((s) => {
          const current = deal.stage === s;
          const done = reached.has(s) && !current;
          return (
            <li
              key={s}
              className={`rounded-lg border px-3 py-2 text-center text-xs font-medium ${
                current ? "border-indigo-500 bg-indigo-50 text-indigo-700" : done ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-400"
              }`}
            >
              {done && "✓ "}
              {DEAL_STAGE_LABEL[s]}
            </li>
          );
        })}
      </ol>

      {deal.stage === "dropped" && (
        <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          드롭됨 · 사유: {deal.drop_reason}.{" "}
          <Link href={`/deals/new?company_id=${deal.company_id}`} className="font-semibold underline">
            이 기업으로 새 딜 등록
          </Link>
        </p>
      )}
      {deal.stage === "approved" && (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          투자 확정 · {deal.target_fund_name} · 예상 {formatKRW(deal.expected_amount)}
          {deal.invested ? " · 투자 집행 완료 " : " · "}
          <Link href={`/funds/${deal.target_fund_id}/investments`} className="font-semibold underline">
            {deal.invested ? "투자 내역 보기" : "투자 집행 화면으로 (조합이 운용 중일 때)"}
          </Link>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DealActions deal={deal} funds={funds} />

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">메모 {deal.notes.length}건</h2>
            <div className="mt-3">
              <DealNoteForm dealId={deal.id} stage={deal.stage} />
            </div>
            <ul className="mt-4 space-y-3">
              {deal.notes.map((n) => (
                <li key={n.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                  <p className="text-xs text-slate-500">
                    <DealStageBadge stage={n.stage} /> {n.author_name} · {formatDateTime(n.created_at)}
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-slate-800">{n.content}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          {open ? (
            <DealInfoForm deal={deal} owners={owners} funds={funds} />
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm">
              <h2 className="text-base font-semibold text-slate-900">딜 정보</h2>
              <dl className="mt-3 space-y-2">
                <div className="flex justify-between"><dt className="text-slate-500">투자 예정 조합</dt><dd>{deal.target_fund_name ?? "-"}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">예상 투자 금액</dt><dd>{deal.expected_amount ? formatKRW(deal.expected_amount) : "-"}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-slate-500">종료된 딜은 정보를 바꿀 수 없습니다.</p>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">단계 이력</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {deal.history.map((h, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-400" />
                  <span>
                    {h.from_stage ? `${DEAL_STAGE_LABEL[h.from_stage]} → ` : "등록 · "}
                    <b>{DEAL_STAGE_LABEL[h.to_stage]}</b>
                    <span className="block text-xs text-slate-500">
                      {formatDateTime(h.changed_at)} · {h.changed_by_name ?? "-"}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {deal.other_deals.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-base font-semibold text-slate-900">같은 기업의 다른 딜</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {deal.other_deals.map((o) => (
                  <li key={o.id}>
                    <Link href={`/deals/${o.id}`} className="flex items-center gap-2 hover:text-indigo-600">
                      <DealStageBadge stage={o.stage} /> {formatDate(o.sourced_date)}
                      {o.drop_reason && <span className="truncate text-xs text-slate-500">{o.drop_reason}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
