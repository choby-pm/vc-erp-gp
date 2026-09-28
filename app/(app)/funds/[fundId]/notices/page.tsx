import Link from "next/link";
import { NoticeDraftActions, NoticeForm } from "@/components/notice-actions";
import { formatDate } from "@/lib/format";
import { NOTICE_TYPES, NOTICE_TYPE_LABEL, type NoticeType } from "@/lib/labels";
import { listNotices } from "@/lib/services/notices";

// 총회·보고 > 통지: 이 조합에서 LP에게 보낸 모든 통지와 LP별 확인 현황 (12-1, BR-NTC-01, 02)

const TYPE_COLOR: Record<NoticeType, string> = {
  proposal: "bg-violet-50 text-violet-700",
  capital_call: "bg-sky-50 text-sky-700",
  meeting: "bg-amber-50 text-amber-700",
  report: "bg-emerald-50 text-emerald-700",
  distribution: "bg-indigo-50 text-indigo-700",
  general: "bg-slate-100 text-slate-700",
};

export default async function NoticesPage(props: PageProps<"/funds/[fundId]/notices">) {
  const { fundId } = await props.params;
  const raw = await props.searchParams;
  const type = NOTICE_TYPES.includes(raw.type as NoticeType) ? (raw.type as NoticeType) : null;
  const data = await listNotices(fundId, type);
  const total = Object.values(data.counts).reduce((s, n) => s + (n ?? 0), 0);
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-600">
            LP에게 보낸 통지 {total}건 · 수신 {data.totals.sent}건 중 LP 확인 <b>{data.totals.acknowledged}</b>건
          </p>
          <p className="mt-0.5 text-xs text-slate-500">출자 제안·캐피탈콜·총회 소집·정기 보고·분배는 해당 업무에서 자동으로 발송됩니다. 확인 여부는 LP 시스템이 알려줄 때 기록됩니다.</p>
        </div>
        {data.can_write && <NoticeForm fundId={fundId} members={data.members} />}
      </div>

      <nav className="flex flex-wrap gap-2">
        <Link href={`/funds/${fundId}/notices`} className={chip(!type)}>
          전체 {total}
        </Link>
        {NOTICE_TYPES.filter((t) => data.counts[t]).map((t) => (
          <Link key={t} href={`/funds/${fundId}/notices?type=${t}`} className={chip(type === t)}>
            {NOTICE_TYPE_LABEL[t]} {data.counts[t]}
          </Link>
        ))}
      </nav>

      <section className="rounded-2xl border border-slate-200 bg-white">
        {data.notices.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">보낸 통지가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.notices.map((n) => {
              const acked = n.recipients.filter((r) => r.acknowledged_at).length;
              return (
                <li key={n.id}>
                  <details className="group px-6 py-3.5">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TYPE_COLOR[n.notice_type]}`}>{NOTICE_TYPE_LABEL[n.notice_type]}</span>
                      <span className="font-medium text-slate-900">{n.title}</span>
                      {n.status === "draft" && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">초안</span>}
                      <span className="ml-auto text-xs text-slate-500">
                        {n.recipients.length === 1 ? n.recipients[0].lp_name : `LP ${n.recipients.length}곳`}
                        {n.status === "sent" && ` · 확인 ${acked}/${n.recipients.length}`}
                        {` · ${formatDate(n.sent_at ?? n.created_at)}`}
                      </span>
                    </summary>
                    <div className="mt-3 grid gap-4 lg:grid-cols-3">
                      <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-sans text-sm text-slate-700 lg:col-span-2">{n.body}</pre>
                      <div>
                        <p className="text-xs font-semibold text-slate-500">수신자</p>
                        <ul className="mt-1 space-y-1 text-sm">
                          {n.recipients.map((r) => (
                            <li key={r.lp_id} className="flex justify-between gap-2">
                              <span className="text-slate-700">{r.lp_name}</span>
                              <span className={r.acknowledged_at ? "text-emerald-700" : "text-slate-400"}>
                                {n.status === "draft" ? "발송 전" : r.acknowledged_at ? `확인 ${formatDate(r.acknowledged_at)}` : "미확인"}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {n.status === "draft" && (
                          <div className="mt-3">
                            <NoticeDraftActions fundId={fundId} noticeId={n.id} recipients={n.recipients.length} />
                          </div>
                        )}
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
