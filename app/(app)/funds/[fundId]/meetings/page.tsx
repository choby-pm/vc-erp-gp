import Link from "next/link";
import MeetingCreateForm from "@/components/meeting-create-form";
import { formatDate } from "@/lib/format";
import { MEETING_STATUS_LABEL, MEETING_TYPE_LABEL } from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getFund } from "@/lib/services/funds";
import { listMeetings } from "@/lib/services/meetings";
import { getRoster } from "@/lib/services/roster";

export default async function FundMeetingsPage(props: PageProps<"/funds/[fundId]/meetings">) {
  const { fundId } = await props.params;
  const fund = await loadOrNotFound(() => getFund(fundId));
  const [data, roster] = await Promise.all([listMeetings(fundId), getRoster(fundId)]);

  // 결성총회는 명부를 확정한 뒤에 열 수 있다 (BR-MTG-01)
  const formationBlocked = fund.status === "fundraising" && !roster.roster;
  const hasOpenFormation = data.meetings.some((m) => m.meeting_type === "formation" && m.status === "scheduled");
  const canCreate = data.allowed_types.length > 0 && !formationBlocked && !hasOpenFormation;

  return (
    <div className="space-y-6">
      {formationBlocked && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          결성총회는 <Link href={`/funds/${fund.id}/members`} className="font-semibold underline">조합원 명부</Link>를 확정한 뒤에 열 수 있습니다.
        </p>
      )}
      {data.allowed_types.length === 0 && fund.status === "planning" && (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">기획 중인 조합은 총회를 열 수 없습니다.</p>
      )}

      {canCreate && <MeetingCreateForm fundId={fund.id} allowedTypes={data.allowed_types} />}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-6 py-4 text-base font-semibold text-slate-900">총회 {data.meetings.length}건</h2>
        {data.meetings.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">아직 열린 총회가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.meetings.map((m) => (
              <li key={m.id}>
                <Link href={`/funds/${fund.id}/meetings/${m.id}`} className="flex flex-wrap items-center gap-3 px-6 py-3 hover:bg-slate-50">
                  <span className="font-semibold text-slate-900">{MEETING_TYPE_LABEL[m.meeting_type]}</span>
                  <span className="text-sm text-slate-500">
                    {formatDate(m.meeting_date)}
                    {m.location && ` · ${m.location}`} · 안건 {m.agenda_count}건
                  </span>
                  <span className="ml-auto text-xs text-slate-500">{m.convened_at ? `소집 ${formatDate(m.convened_at)}` : "소집 전"}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{MEETING_STATUS_LABEL[m.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
