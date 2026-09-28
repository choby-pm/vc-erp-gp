import Link from "next/link";
import MeetingBoard from "@/components/meeting-board";
import { formatDate } from "@/lib/format";
import { MEETING_STATUS_LABEL, MEETING_TYPE_LABEL } from "@/lib/labels";
import { loadOrNotFound } from "@/lib/page-helpers";
import { getFund } from "@/lib/services/funds";
import { getMeeting } from "@/lib/services/meetings";

export default async function MeetingDetailPage(props: PageProps<"/funds/[fundId]/meetings/[meetingId]">) {
  const { fundId, meetingId } = await props.params;
  const fund = await loadOrNotFound(() => getFund(fundId));
  const meeting = await loadOrNotFound(() => getMeeting(fundId, meetingId));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/funds/${fund.id}/meetings`} className="text-sm text-slate-500 hover:text-indigo-600">
          ← 총회 목록
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold text-slate-900">{MEETING_TYPE_LABEL[meeting.meeting_type]}</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{MEETING_STATUS_LABEL[meeting.status]}</span>
          <span className="text-sm text-slate-500">
            {formatDate(meeting.meeting_date)}
            {meeting.location && ` · ${meeting.location}`}
          </span>
        </div>
      </div>
      <MeetingBoard fundId={fund.id} meeting={meeting} />
    </div>
  );
}
