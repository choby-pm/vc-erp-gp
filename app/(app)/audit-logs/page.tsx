import Link from "next/link";
import NoPermission from "@/components/no-permission";
import { ROLE_LABEL, type Role } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { actionLabel, listAuditLogs, type AuditFilter, type AuditLog } from "@/lib/services/audit";

export const metadata = { title: "감사 로그 · VC ERP" };

// 시스템 > 감사 로그 (D42, BR-AUTH-04): 누가 언제 무엇을 했는지. 모든 쓰기 요청 · 로그인 · LP 시스템 · 자동 전송
// 기록은 추가만 되고 고칠 수 없다. 요청 본문(비밀번호 등)은 남기지 않는다

const RESULTS = [
  { key: "", label: "전체" },
  { key: "ok", label: "성공" },
  { key: "fail", label: "실패" },
  { key: "denied", label: "권한·인증 거부" },
] as const;

const time = (d: Date) =>
  new Date(d).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

function Actor({ log }: { log: AuditLog }) {
  if (log.actor_type === "lp_system") return <span className="text-violet-700">LP 시스템</span>;
  if (log.actor_type === "cron") return <span className="text-slate-500">자동 (Cron)</span>;
  if (!log.user_name) return <span className="text-slate-400">{typeof log.detail?.email === "string" ? log.detail.email : "알 수 없음"}</span>;
  return (
    <>
      {log.user_name}
      {log.user_role && <span className="ml-1 text-xs text-slate-400">{ROLE_LABEL[log.user_role as Role] ?? log.user_role}</span>}
    </>
  );
}

function Result({ log }: { log: AuditLog }) {
  if (log.status < 400) return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">성공</span>;
  const denied = log.status === 401 || log.status === 403;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${denied ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>
      {denied ? "거부" : "실패"} {log.status}
      {log.error_code && ` · ${log.error_code}`}
    </span>
  );
}

export default async function AuditLogsPage(props: PageProps<"/audit-logs">) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") return <NoPermission area="감사 로그" role={me?.role} />;

  const q = await props.searchParams;
  const get = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : "");
  const result = get("result");
  const filter: AuditFilter = {
    user_id: get("user_id") || null,
    fund_id: get("fund_id") || null,
    result: result === "ok" || result === "fail" || result === "denied" ? result : null,
    from: get("from") || null,
    to: get("to") || null,
  };
  const data = await listAuditLogs(filter);
  const href = (patch: Partial<Record<keyof AuditFilter, string>>) => {
    const merged = { ...filter, ...patch };
    const params = new URLSearchParams(Object.entries(merged).filter((e): e is [string, string] => Boolean(e[1])));
    return params.size ? `/audit-logs?${params}` : "/audit-logs";
  };
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">감사 로그</h1>
        <p className="mt-1 text-sm text-slate-500">
          누가 언제 무엇을 했는지 남깁니다: 모든 쓰기 작업, 로그인(실패 포함), 권한이 없어 막힌 시도, LP 시스템의 통지 확인·투표, 자동 전송. 기록은 고칠 수 없고, 요청 내용(비밀번호 등)은 저장하지 않습니다.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">사용자</span>
          <select name="user_id" defaultValue={filter.user_id ?? ""} className="rounded-lg border border-slate-300 px-2 py-1.5">
            <option value="">전체</option>
            {data.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">조합</span>
          <select name="fund_id" defaultValue={filter.fund_id ?? ""} className="rounded-lg border border-slate-300 px-2 py-1.5">
            <option value="">전체</option>
            {data.funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">시작일</span>
          <input type="date" name="from" defaultValue={filter.from ?? ""} className="rounded-lg border border-slate-300 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">종료일</span>
          <input type="date" name="to" defaultValue={filter.to ?? ""} className="rounded-lg border border-slate-300 px-2 py-1" />
        </label>
        {filter.result && <input type="hidden" name="result" value={filter.result} />}
        <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-1.5 font-semibold text-white hover:bg-indigo-700">
          조회
        </button>
        <Link href="/audit-logs" className="py-1.5 text-slate-500 hover:text-indigo-600">
          초기화
        </Link>
      </form>

      <nav className="flex flex-wrap gap-2">
        {RESULTS.map((r) => (
          <Link key={r.key} href={href({ result: r.key })} className={chip((filter.result ?? "") === r.key)}>
            {r.label}
          </Link>
        ))}
      </nav>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        {data.logs.length === 0 ? (
          <p className="px-6 py-16 text-center text-sm text-slate-500">조건에 맞는 기록이 없습니다.</p>
        ) : (
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-2.5">일시</th>
                <th className="px-3 py-2.5">누가</th>
                <th className="px-3 py-2.5">작업</th>
                <th className="px-3 py-2.5">조합</th>
                <th className="px-3 py-2.5">결과</th>
                <th className="px-4 py-2.5">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums text-slate-600">{time(l.occurred_at)}</td>
                  <td className="px-3 py-2">
                    <Actor log={l} />
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-900">{actionLabel(l.action)}</span>
                    <span className="block font-mono text-[11px] text-slate-400">{l.action}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {l.fund_id ? (
                      <Link href={`/funds/${l.fund_id}`} className="hover:text-indigo-600">
                        {l.fund_name ?? "-"}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Result log={l} />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-400">{l.ip ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {data.logs.length === data.limit && <p className="text-xs text-slate-500">최근 {data.limit}건만 보여줍니다. 기간·사용자로 좁혀 보세요.</p>}
    </div>
  );
}
