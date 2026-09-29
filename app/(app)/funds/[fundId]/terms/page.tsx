import Link from "next/link";
import AttachmentPanel from "@/components/attachment-panel";
import TermsAmendForm from "@/components/terms-amend-form";
import { formatDate, formatKRWFull, formatPercent } from "@/lib/format";
import { listAttachments, storageConfigured } from "@/lib/services/attachments";
import { listPassedAgendas, listTermsVersions, type TermsVersion } from "@/lib/services/terms";

type Row = { label: string; value: (t: TermsVersion) => string };

const ROWS: Row[] = [
  { label: "적용일", value: (t) => formatDate(t.effective_date) },
  { label: "근거 안건", value: (t) => (t.agenda ? `${formatDate(t.agenda.meeting_date)} ${t.agenda.title}` : "최초 규약") },
  { label: "주목적 투자 분야", value: (t) => t.primary_purpose },
  { label: "1좌 금액", value: (t) => formatKRWFull(t.unit_amount) },
  { label: "주목적 의무 비율", value: (t) => formatPercent(t.primary_purpose_min_ratio) },
  { label: "GP 의무 출자 비율", value: (t) => formatPercent(t.gp_commitment_min_ratio) },
  { label: "관리보수율 (투자 기간)", value: (t) => formatPercent(t.management_fee_rate) },
  { label: "관리보수율 (투자 기간 후)", value: (t) => formatPercent(t.management_fee_rate_after) },
  { label: "성과보수율", value: (t) => formatPercent(t.carry_rate) },
  { label: "기준수익률", value: (t) => formatPercent(t.hurdle_rate) },
  { label: "총회 가결 기준", value: (t) => formatPercent(t.quorum_ratio) },
];

export default async function TermsPage(props: PageProps<"/funds/[fundId]/terms">) {
  const { fundId } = await props.params;
  const [data, agendas] = await Promise.all([listTermsVersions(fundId), listPassedAgendas(fundId, "terms_amendment")]);
  const unused = agendas.filter((a) => a.used_by_version === null);
  const latest = data.versions[0];
  // 오래된 버전이 왼쪽에 오도록 뒤집는다. 직전 버전과 달라진 칸을 강조한다
  const columns = [...data.versions].reverse();
  const files = await Promise.all(data.versions.map((t) => listAttachments(fundId, "fund_terms", t.id)));

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        결성 이후 규약은 고치지 않고 총회 가결 안건마다 새 버전을 쌓습니다. 어떤 날짜의 계산(관리보수·가결 기준 등)은 그날 적용되는 버전을 씁니다 (BR-TERM-04).
      </p>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-6 py-3">항목</th>
              {columns.map((t) => (
                <th key={t.version} className="px-4 py-3">
                  버전 {t.version}
                  {t.version === data.effective_version && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800">오늘 적용 중</span>}
                  {t.version > data.effective_version && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">적용 예정</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ROWS.map((row) => (
              <tr key={row.label}>
                <td className="px-6 py-2.5 text-slate-500">{row.label}</td>
                {columns.map((t, i) => {
                  const changed = i > 0 && row.label !== "적용일" && row.label !== "근거 안건" && row.value(t) !== row.value(columns[i - 1]);
                  return (
                    <td key={t.version} className={`px-4 py-2.5 ${changed ? "bg-indigo-50 font-semibold text-indigo-800" : "text-slate-900"}`}>
                      {row.value(t)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">규약 원문</h2>
        <p className="mt-0.5 text-xs text-slate-500">버전별 규약 원문 PDF. LP 시스템에서도 조합원이 내려받을 수 있습니다 (오늘 적용 중인 버전).</p>
        <div className="mt-4 space-y-4">
          {data.versions.map((t, i) => (
            <div key={t.id}>
              <p className="mb-1.5 text-sm font-semibold text-slate-700">
                버전 {t.version} <span className="font-normal text-slate-500">· 적용일 {formatDate(t.effective_date)}</span>
              </p>
              <AttachmentPanel fundId={fundId} targetType="fund_terms" targetId={t.id} attachments={files[i]} storageConfigured={storageConfigured()} />
            </div>
          ))}
        </div>
      </section>

      {data.can_amend ? (
        unused.length > 0 ? (
          <TermsAmendForm fundId={fundId} current={latest} agendas={unused} />
        ) : (
          <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">
            규약을 바꾸려면 먼저 <Link href={`/funds/${fundId}/meetings`} className="font-semibold text-indigo-600 underline">총회</Link>에서 ‘규약 변경’ 안건을 가결하세요. 가결된 안건이 여기에 나타납니다.
          </p>
        )
      ) : (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">
          {data.fund_status === "planning" || data.fund_status === "fundraising"
            ? "결성 전에는 조합 정보 수정에서 규약 버전 1을 직접 고칩니다."
            : "현재 조합 상태에서는 규약을 바꿀 수 없습니다."}
        </p>
      )}
    </div>
  );
}
