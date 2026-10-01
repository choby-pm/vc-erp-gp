import Link from "next/link";
import { DispatchButton, RetryButton } from "@/components/integration-actions";
import NoPermission from "@/components/no-permission";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { DISPATCH_SCHEDULE_LABEL, listEvents, type EventStatus } from "@/lib/services/integration";
import type { JobTrigger } from "@/lib/services/jobs";

export const metadata = { title: "LP 연동 · VC ERP" };

// LP 시스템 연동 관리 (D2, D12, BR-EVT-01~05)
// · GP DB가 원본이고, LP 시스템은 연동 API(/api/lp/v1)와 웹훅 이벤트로 데이터를 받아간다

const EVENT_LABEL: Record<string, string> = {
  "fund.status_changed": "조합 상태 변경",
  "fund.updated": "조합 정보 변경",
  "fund.terms_updated": "규약 변경",
  "notice.sent": "통지 발송",
  "member.joined": "조합원 가입",
  "ledger.entry_created": "원장 기록",
  "meeting.result_finalized": "총회 결과",
};
const TRIGGER_LABEL: Record<JobTrigger, string> = { auto: "바로 보내기", cron: "주기 작업", manual: "수동" };

const STATUS: Record<EventStatus, { label: string; color: string }> = {
  pending: { label: "대기", color: "bg-amber-50 text-amber-700" },
  delivered: { label: "전송 완료", color: "bg-emerald-50 text-emerald-700" },
  failed: { label: "실패 · 멈춤", color: "bg-rose-50 text-rose-700" },
};

export default async function IntegrationsPage(props: PageProps<"/integrations">) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") return <NoPermission area="LP 연동" role={me?.role} />;
  const raw = await props.searchParams;
  const status = ["pending", "delivered", "failed"].includes(raw.status as string) ? (raw.status as EventStatus) : null;
  const data = await listEvents(status);
  const c = data.config;
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;
  const setting = (ok: boolean, label: string, note: string) => (
    <li className="flex items-start gap-2">
      <span className={ok ? "text-emerald-600" : "text-slate-400"}>{ok ? "✓" : "○"}</span>
      <span>
        <span className="font-medium text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">{note}</span>
      </span>
    </li>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">LP 연동</h1>
        <p className="mt-1 text-sm text-slate-500">
          GP 시스템이 원본이고, LP 시스템은 연동 API와 이벤트(웹훅)로 공개 데이터를 받아갑니다. 출자자 화면의 <b>LP 공개 데이터 미리보기</b>에서 LP별로 보이는 데이터를 확인할 수 있습니다.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900">연동 설정</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {setting(c.api_key_configured, "LP 연동 API 키", "LP_SYSTEM_API_KEY · /api/lp/v1 호출 인증 (Bearer)")}
            {setting(c.secret_configured, "웹훅 서명 비밀 값", "LP_WEBHOOK_SECRET · HMAC-SHA256 서명")}
            {setting(c.cron_configured, "자동 전송 (Vercel Cron)", c.cron_configured ? `CRON_SECRET · ${DISPATCH_SCHEDULE_LABEL}` : "CRON_SECRET 미설정 · 배포 환경에 설정하면 주기적으로 자동 전송합니다")}
            {setting(c.webhook_configured, "웹훅 받을 주소", c.webhook_configured ? "LP_SYSTEM_WEBHOOK_URL" : "LP_SYSTEM_WEBHOOK_URL 미설정 · 이벤트는 대기로 쌓이고 LP 시스템이 /api/lp/v1/events 로 가져갈 수 있습니다")}
          </ul>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">이벤트 전송 현황</h2>
            <DispatchButton configured={c.webhook_configured && c.secret_configured} />
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3">
            {(["pending", "delivered", "failed"] as EventStatus[]).map((s) => (
              <div key={s} className={`rounded-xl px-4 py-3 ${STATUS[s].color}`}>
                <dt className="text-xs">{STATUS[s].label}</dt>
                <dd className="text-xl font-bold tabular-nums">{data.counts[s]}</dd>
              </div>
            ))}
          </dl>
          {data.job?.last_started_at && (
            <p className="mt-3 text-sm text-slate-600">
              마지막 전송 {formatDate(data.job.last_started_at)} {new Date(data.job.last_started_at).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })} ·{" "}
              {TRIGGER_LABEL[data.job.last_trigger ?? "manual"]}
              {data.job.running
                ? " · 전송 중"
                : data.job.last_error
                  ? ` · 오류: ${data.job.last_error}`
                  : data.job.last_result && ` · 전송 ${data.job.last_result.delivered ?? 0}건 · 실패 ${data.job.last_result.failed ?? 0}건`}
            </p>
          )}
          <p className="mt-3 text-xs text-slate-500">
            이벤트가 생기면 바로 보내고(D46), 보내지 못한 것은 주기 작업이 {DISPATCH_SCHEDULE_LABEL} 다시 보냅니다. 이 버튼으로 지금 보낼 수도 있습니다. 실패하면 1분 → 5분 → 30분 → 2시간 → 12시간 뒤 다시 보내고, 5번 실패하면 멈춥니다. 같은 LP의 이벤트는 순서대로 보내 앞 이벤트가 멈추면 뒤 이벤트도 기다립니다.
          </p>
        </section>
      </div>

      <nav className="flex flex-wrap gap-2">
        <Link href="/integrations" className={chip(!status)}>
          전체
        </Link>
        {(["pending", "delivered", "failed"] as EventStatus[]).map((s) => (
          <Link key={s} href={`/integrations?status=${s}`} className={chip(status === s)}>
            {STATUS[s].label} {data.counts[s]}
          </Link>
        ))}
      </nav>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-6 py-4 text-base font-semibold text-slate-900">최근 이벤트 {data.events.length}건</h2>
        {data.events.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">이벤트가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-2.5">발생</th>
                  <th className="px-3 py-2.5">이벤트</th>
                  <th className="px-3 py-2.5">조합</th>
                  <th className="px-3 py-2.5">대상 LP</th>
                  <th className="px-3 py-2.5">상태</th>
                  <th className="px-6 py-2.5 text-right">시도</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.events.map((e) => (
                  <tr key={e.id}>
                    <td className="px-6 py-2.5 text-slate-500">{formatDate(e.created_at)}</td>
                    <td className="px-3 py-2.5 text-slate-900">{EVENT_LABEL[e.event_type] ?? e.event_type}</td>
                    <td className="px-3 py-2.5 text-slate-600">{e.fund_name ?? "-"}</td>
                    <td className="px-3 py-2.5 text-slate-600">{e.lp_name ?? "전체"}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[e.status].color}`}>{STATUS[e.status].label}</span>
                      {e.last_error && <span className="ml-2 text-xs text-rose-600">{e.last_error}</span>}
                    </td>
                    <td className="px-6 py-2.5 text-right">
                      <span className="tabular-nums text-slate-500">{e.attempts}</span>
                      {e.status === "failed" && (
                        <span className="ml-2">
                          <RetryButton eventId={e.id} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
