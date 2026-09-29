import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound, statusNotAllowed } from "@/lib/api/errors";
import { formatDate } from "@/lib/format";
import {
  AGENDA_TYPE_LABEL,
  MEETING_TYPE_LABEL,
  type AgendaResult,
  type AgendaType,
  type FundStatus,
  type MeetingStatus,
  type MeetingType,
  type VoteChoice,
} from "@/lib/labels";
import type { AgendaInput, CreateMeetingInput, UpdateMeetingInput } from "@/lib/schemas/meeting";
import { recordEvent } from "@/lib/services/events";

// 조합원 총회 서비스 (BR-MTG-01~03, BR-VOTE-01~06)
// · 총회 생성 → 소집(통지) → 투표 기록 → 개최 처리(결과 확정). 예정 상태에서만 바꿀 수 있다
// · 의결권 = 조합원 지분율(약정액 ÷ 약정 총액). 투표할 때 그 시점 지분율을 스냅샷으로 저장한다 (BR-VOTE-02)
// · 가결 기준의 분모는 출석이 아니라 전체 의결권이다. 기권·미투표는 찬성이 아니다 (BR-VOTE-03, D17)

// 조합 상태별로 열 수 있는 총회 (04 업무 규칙 2-2)
const MEETING_TYPES_BY_STATUS: Partial<Record<FundStatus, MeetingType[]>> = {
  fundraising: ["formation"],
  formed: ["regular", "extraordinary"],
  operating: ["regular", "extraordinary", "dissolution"],
  dissolved: ["regular", "extraordinary"],
};

// 총회 유형마다 반드시 들어가야 하는 안건 (BR-MTG-01, 02). 없으면 자동으로 1번 안건으로 넣는다
const REQUIRED_AGENDA: Partial<Record<MeetingType, { agenda_type: AgendaType; title: string }>> = {
  formation: { agenda_type: "formation", title: "조합 결성의 건" },
  dissolution: { agenda_type: "dissolution", title: "조합 해산의 건" },
};

// 이 안건 유형은 해당 총회에서만 다룬다
const AGENDA_ONLY_IN: Partial<Record<AgendaType, MeetingType>> = { formation: "formation", dissolution: "dissolution" };

// 가결되면 가능해지는 작업 (BR-VOTE-06). 화면이 다음 할 일을 안내하는 데 쓴다
const UNLOCKS: Partial<Record<AgendaType, string>> = {
  formation: "fund_transition:formed",
  terms_amendment: "terms_new_version",
  manager_change: "manager_change",
  dissolution: "fund_transition:dissolved",
};

export const allowedMeetingTypes = (status: FundStatus) => MEETING_TYPES_BY_STATUS[status] ?? [];

export type MeetingListItem = {
  id: string;
  meeting_type: MeetingType;
  meeting_date: string;
  location: string | null;
  status: MeetingStatus;
  agenda_count: number;
  convened_at: Date | null;
};

export type AgendaTally = {
  id: string;
  agenda_no: number;
  agenda_type: AgendaType;
  title: string;
  description: string | null;
  quorum_ratio: number;
  result: AgendaResult;
  for_ratio: number; // 찬성 의결권 ÷ 전체 의결권
  against_ratio: number;
  abstain_ratio: number;
  votes: Record<string, VoteChoice>; // member_id → 선택
  lp_direct: string[]; // LP 시스템에서 직접 투표한 member_id (GP가 바꿀 수 없음, BR-VOTE-07)
  unlocks: string | null; // 가결됐을 때 가능해진 작업
};

export type MeetingDetail = MeetingListItem & {
  fund_status: FundStatus;
  voters: { member_id: string; name: string; member_type: "gp" | "lp"; voting_power: number }[];
  agendas: AgendaTally[];
  can_edit: boolean; // 예정 + 소집 전: 날짜·장소 수정, 안건 추가
  can_convene: boolean;
  can_vote: boolean; // 예정 + 소집 후
  can_hold: boolean;
};

// ─── 조회 ──────────────────────────────────────────────────────────────────

export type VoteChannel = "gp" | "lp_system";

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

async function assertFund(fundId: string) {
  assertUuid(fundId, "조합을");
  const [fund] = await sql<{ status: FundStatus }[]>`select status from funds where id = ${fundId}`;
  if (!fund) throw notFound("조합을");
  return fund;
}

export async function listMeetings(fundId: string) {
  const fund = await assertFund(fundId);
  const meetings = await sql<MeetingListItem[]>`
    select g.id, g.meeting_type, g.meeting_date, g.location, g.status,
           (select count(*)::int from agendas a where a.meeting_id = g.id) as agenda_count,
           (select min(n.sent_at) from notices n where n.source_type = 'general_meeting' and n.source_id = g.id) as convened_at
    from general_meetings g
    where g.fund_id = ${fundId}
    order by g.meeting_date desc, g.created_at desc
  `;
  return { fund_status: fund.status, allowed_types: allowedMeetingTypes(fund.status), meetings };
}

// 현재 조합원과 의결권 (= 지분율). 약정이 남아 있는 조합원만 (명부 취소분 제외)
async function currentVoters(tx: typeof sql, fundId: string) {
  return tx<{ member_id: string; name: string; member_type: "gp" | "lp"; voting_power: number; lp_id: string | null }[]>`
    select b.member_id, coalesce(lp.name, 'GP') as name, b.member_type, b.lp_id,
           coalesce(b.ownership_ratio, 0)::float8 as voting_power
    from v_member_balances b left join limited_partners lp on lp.id = b.lp_id
    where b.fund_id = ${fundId} and b.commitment_amount > 0
    order by b.member_type = 'lp', b.commitment_amount desc, lp.name
  `;
}

export async function getMeeting(fundId: string, meetingId: string): Promise<MeetingDetail> {
  const fund = await assertFund(fundId);
  assertUuid(meetingId, "총회를");
  const [meeting] = await sql<MeetingListItem[]>`
    select g.id, g.meeting_type, g.meeting_date, g.location, g.status,
           (select count(*)::int from agendas a where a.meeting_id = g.id) as agenda_count,
           (select min(n.sent_at) from notices n where n.source_type = 'general_meeting' and n.source_id = g.id) as convened_at
    from general_meetings g where g.id = ${meetingId} and g.fund_id = ${fundId}
  `;
  if (!meeting) throw notFound("총회를");

  const agendaRows = await sql<Omit<AgendaTally, "for_ratio" | "against_ratio" | "abstain_ratio" | "votes" | "unlocks">[]>`
    select id, agenda_no, agenda_type, title, description, quorum_ratio::float8 as quorum_ratio, result
    from agendas where meeting_id = ${meetingId} order by agenda_no
  `;
  const votes = await sql<{ agenda_id: string; member_id: string; choice: VoteChoice; voting_power_ratio: number; channel: VoteChannel }[]>`
    select v.agenda_id, v.member_id, v.choice, v.voting_power_ratio::float8 as voting_power_ratio, v.channel
    from votes v join agendas a on a.id = v.agenda_id
    where a.meeting_id = ${meetingId}
  `;
  const voters = await currentVoters(sql, fundId);
  const totalPower = voters.reduce((s, v) => s + v.voting_power, 0);

  const agendas = agendaRows.map((a) => {
    const mine = votes.filter((v) => v.agenda_id === a.id);
    const sum = (c: VoteChoice) => mine.filter((v) => v.choice === c).reduce((s, v) => s + v.voting_power_ratio, 0);
    const ratio = (c: VoteChoice) => (totalPower > 0 ? sum(c) / totalPower : 0);
    return {
      ...a,
      for_ratio: ratio("for"),
      against_ratio: ratio("against"),
      abstain_ratio: ratio("abstain"),
      votes: Object.fromEntries(mine.map((v) => [v.member_id, v.choice])),
      lp_direct: mine.filter((v) => v.channel === "lp_system").map((v) => v.member_id),
      unlocks: a.result === "passed" ? (UNLOCKS[a.agenda_type] ?? null) : null,
    };
  });

  const scheduled = meeting.status === "scheduled";
  const convened = meeting.convened_at !== null;
  return {
    ...meeting,
    fund_status: fund.status,
    voters: voters.map((v) => ({ member_id: v.member_id, name: v.name, member_type: v.member_type, voting_power: v.voting_power })),
    agendas,
    can_edit: scheduled && !convened,
    can_convene: scheduled && !convened && agendas.length > 0,
    can_vote: scheduled && convened,
    can_hold: scheduled && convened && meeting.meeting_date <= today(),
  };
}

// ─── 생성·수정 ─────────────────────────────────────────────────────────────

async function lockFund(tx: typeof sql, fundId: string) {
  assertUuid(fundId, "조합을");
  const [fund] = await tx<{ status: FundStatus; name: string }[]>`select status, name from funds where id = ${fundId} for update`;
  if (!fund) throw notFound("조합을");
  return fund;
}

// 가결 기준은 안건을 만들 때 최신 규약에서 복사해 고정한다 (BR-VOTE-04)
async function currentQuorum(tx: typeof sql, fundId: string) {
  // BR-TERM-04: 오늘 적용되는 버전 (결성 전 버전 1도 작성일부터 적용)
  const [terms] = await tx<{ quorum_ratio: string }[]>`
    select quorum_ratio from fund_terms where fund_id = ${fundId}
    order by (effective_date <= ${today()}) desc, version desc limit 1
  `;
  return terms.quorum_ratio;
}

function assertAgendaAllowed(meetingType: MeetingType, agenda: AgendaInput, field: string) {
  const only = AGENDA_ONLY_IN[agenda.agenda_type];
  if (only && only !== meetingType) {
    const message = `${AGENDA_TYPE_LABEL[agenda.agenda_type]} 안건은 ${MEETING_TYPE_LABEL[only]}에서만 다룰 수 있습니다`;
    throw new AppError(422, "AGENDA_NOT_ALLOWED", message, "BR-MTG-01", { fields: { [field]: message } });
  }
}

export async function createMeeting(fundId: string, input: CreateMeetingInput, userId: string) {
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const fund = await lockFund(t, fundId);
    if (!allowedMeetingTypes(fund.status).includes(input.meeting_type)) {
      throw statusNotAllowed("BR-FUND-08", `현재 조합 상태에서는 ${MEETING_TYPE_LABEL[input.meeting_type]}를 열 수 없습니다`);
    }

    if (input.meeting_type === "formation") {
      // BR-MTG-01: 명부 확정 후에만. 결성총회는 한 번에 하나만 진행한다
      const [roster] = await tx`select 1 from fund_rosters where fund_id = ${fundId} and cancelled_at is null`;
      if (!roster) throw new AppError(409, "ROSTER_NOT_CONFIRMED", "결성총회는 조합원 명부를 확정한 뒤에 열 수 있습니다", "BR-MTG-01");
      const [open] = await tx`
        select 1 from general_meetings where fund_id = ${fundId} and meeting_type = 'formation' and status = 'scheduled'
      `;
      if (open) throw new AppError(409, "MEETING_ALREADY_SCHEDULED", "이미 예정된 결성총회가 있습니다", "BR-MTG-01");
      const [passed] = await tx`
        select 1 from agendas a join general_meetings g on g.id = a.meeting_id
        where g.fund_id = ${fundId} and a.agenda_type = 'formation' and a.result = 'passed'
      `;
      if (passed) throw new AppError(409, "FORMATION_ALREADY_PASSED", "결성 안건이 이미 가결되었습니다", "BR-MTG-01");
    }

    input.agendas.forEach((a, i) => assertAgendaAllowed(input.meeting_type, a, `agendas.${i}.agenda_type`));
    const required = REQUIRED_AGENDA[input.meeting_type];
    const agendas: AgendaInput[] =
      required && !input.agendas.some((a) => a.agenda_type === required.agenda_type)
        ? [{ ...required, description: null }, ...input.agendas]
        : input.agendas;

    const [meeting] = await tx<{ id: string }[]>`
      insert into general_meetings (fund_id, meeting_type, meeting_date, location, created_by)
      values (${fundId}, ${input.meeting_type}, ${input.meeting_date}, ${input.location}, ${userId})
      returning id
    `;
    const quorum = await currentQuorum(t, fundId);
    for (const [i, a] of agendas.entries()) {
      await tx`
        insert into agendas (meeting_id, agenda_no, agenda_type, title, description, quorum_ratio, created_by)
        values (${meeting.id}, ${i + 1}, ${a.agenda_type}, ${a.title}, ${a.description}, ${quorum}, ${userId})
      `;
    }
    return meeting;
  });
}

// 예정 상태 + 소집 전인 총회를 잠근다. 소집 통지가 나간 뒤에는 일정·안건을 바꾸지 않는다
async function lockMeeting(tx: typeof sql, fundId: string, meetingId: string, need: "editable" | "votable" | "scheduled") {
  assertUuid(meetingId, "총회를");
  const [m] = await tx<{ id: string; meeting_type: MeetingType; meeting_date: string; location: string | null; status: MeetingStatus; convened: boolean }[]>`
    select g.id, g.meeting_type, g.meeting_date, g.location, g.status,
           exists (select 1 from notices n where n.source_type = 'general_meeting' and n.source_id = g.id) as convened
    from general_meetings g where g.id = ${meetingId} and g.fund_id = ${fundId}
    for update of g
  `;
  if (!m) throw notFound("총회를");
  if (m.status !== "scheduled") throw new AppError(409, "DOCUMENT_LOCKED", "개최했거나 취소된 총회는 바꿀 수 없습니다", "BR-VOTE-05");
  if (need === "editable" && m.convened) {
    throw new AppError(409, "DOCUMENT_LOCKED", "소집 통지를 보낸 뒤에는 일정과 안건을 바꿀 수 없습니다. 총회를 취소하고 다시 여세요", "BR-NTC-01");
  }
  if (need === "votable" && !m.convened) throw new AppError(409, "MEETING_NOT_CONVENED", "소집 통지를 먼저 보내세요", "BR-MTG-03");
  return m;
}

export async function updateMeeting(fundId: string, meetingId: string, input: UpdateMeetingInput) {
  await sql.begin(async (tx) => {
    await lockMeeting(tx as unknown as typeof sql, fundId, meetingId, "editable");
    await tx`update general_meetings set ${tx(input, "meeting_date", "location")} where id = ${meetingId}`;
  });
}

export async function addAgenda(fundId: string, meetingId: string, input: AgendaInput, userId: string) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const m = await lockMeeting(t, fundId, meetingId, "editable");
    assertAgendaAllowed(m.meeting_type, input, "agenda_type");
    const [{ next }] = await tx<{ next: number }[]>`select coalesce(max(agenda_no), 0) + 1 as next from agendas where meeting_id = ${meetingId}`;
    await tx`
      insert into agendas (meeting_id, agenda_no, agenda_type, title, description, quorum_ratio, created_by)
      values (${meetingId}, ${next}, ${input.agenda_type}, ${input.title}, ${input.description}, ${await currentQuorum(t, fundId)}, ${userId})
    `;
  });
}

// ─── 소집 ──────────────────────────────────────────────────────────────────

// BR-MTG-03: LP 조합원 전원에게 소집 통지. 수신 LP마다 연동 이벤트를 만든다 (BR-EVT-01)
export async function conveneMeeting(fundId: string, meetingId: string, userId: string) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const fund = await lockFund(t, fundId);
    const m = await lockMeeting(t, fundId, meetingId, "editable");
    const agendas = await tx<{ agenda_no: number; title: string }[]>`select agenda_no, title from agendas where meeting_id = ${meetingId} order by agenda_no`;
    if (agendas.length === 0) throw new AppError(422, "NO_AGENDA", "안건을 1개 이상 등록하세요", "BR-MTG-01");

    const lps = (await currentVoters(t, fundId)).filter((v) => v.lp_id);
    if (lps.length === 0) throw new AppError(409, "NO_MEMBERS", "통지를 받을 LP 조합원이 없습니다", "BR-MTG-03");

    const title = `${fund.name} ${MEETING_TYPE_LABEL[m.meeting_type]} 소집 통지`;
    const body = [
      `${fund.name} ${MEETING_TYPE_LABEL[m.meeting_type]}를 아래와 같이 소집합니다.`,
      "",
      `· 일시: ${formatDate(m.meeting_date)}`,
      ...(m.location ? [`· 장소: ${m.location}`] : []),
      "· 안건",
      ...agendas.map((a) => `  ${a.agenda_no}. ${a.title}`),
      "",
      "의결권은 약정액 비율에 따르며, 전체 의결권 기준으로 가결 여부를 판정합니다.",
    ].join("\n");

    const [notice] = await tx<{ id: string; sent_at: Date }[]>`
      insert into notices (fund_id, notice_type, title, body, source_type, source_id, status, sent_at, created_by)
      values (${fundId}, 'meeting', ${title}, ${body}, 'general_meeting', ${meetingId}, 'sent', now(), ${userId})
      returning id, sent_at
    `;
    for (const lp of lps) {
      await tx`insert into notice_recipients (notice_id, lp_id) values (${notice.id}, ${lp.lp_id})`;
      await recordEvent(t, {
        event_type: "notice.sent",
        aggregate_type: "notice",
        aggregate_id: notice.id,
        lp_id: lp.lp_id,
        fund_id: fundId,
        data: { notice_id: notice.id, notice_type: "meeting", title, sent_at: notice.sent_at, meeting_id: meetingId, meeting_date: m.meeting_date },
      });
    }
  });
}

// ─── 투표 ──────────────────────────────────────────────────────────────────

// GP가 조합원별 찬반을 입력한다 (서면 결의서 등). 의결권은 기록 시점 지분율로 고정 (BR-VOTE-01, 02).
// LP가 LP 시스템에서 직접 한 투표는 GP가 바꿀 수 없다 (BR-VOTE-07)
export async function recordVote(fundId: string, meetingId: string, agendaId: string, memberId: string, choice: VoteChoice, userId: string) {
  assertUuid(agendaId, "안건을");
  assertUuid(memberId, "조합원을");
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    await lockMeeting(t, fundId, meetingId, "votable");
    const [agenda] = await tx`select 1 from agendas where id = ${agendaId} and meeting_id = ${meetingId}`;
    if (!agenda) throw notFound("안건을");
    const voter = (await currentVoters(t, fundId)).find((v) => v.member_id === memberId);
    if (!voter) throw new AppError(422, "NOT_A_MEMBER", "의결권이 있는 조합원이 아닙니다", "BR-VOTE-01");
    const [direct] = await tx`select 1 from votes where agenda_id = ${agendaId} and member_id = ${memberId} and channel = 'lp_system'`;
    if (direct) throw new AppError(409, "LP_VOTED_DIRECTLY", `${voter.name}이(가) LP 시스템에서 직접 투표했습니다. LP가 직접 한 투표는 GP가 바꿀 수 없습니다`, "BR-VOTE-07");

    await tx`
      insert into votes (agenda_id, member_id, choice, voting_power_ratio, created_by)
      values (${agendaId}, ${memberId}, ${choice}, ${voter.voting_power}, ${userId})
      on conflict (agenda_id, member_id) do update
        set choice = excluded.choice, voting_power_ratio = excluded.voting_power_ratio, created_by = excluded.created_by
    `;
  });
}

// BR-VOTE-07 LP 직접 투표: LP 시스템이 본인 조합원 행의 찬반을 안건별로 한 번에 제출한다 (전부 기록되거나 전부 실패).
// 소집 후 개최 처리 전까지 다시 제출할 수 있고, GP가 먼저 입력한 값도 LP 본인 제출이 덮어쓴다
export async function recordLpVotes(lpId: string, fundId: string, meetingId: string, input: { agenda_id: string; choice: VoteChoice }[]) {
  assertUuid(fundId, "조합을");
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    await lockMeeting(t, fundId, meetingId, "votable");
    const voters = (await currentVoters(t, fundId)).filter((v) => v.lp_id === lpId);
    if (voters.length === 0) throw new AppError(403, "NOT_A_MEMBER", "의결권이 있는 조합원이 아닙니다", "BR-VOTE-01");
    const agendaIds = new Set((await tx<{ id: string }[]>`select id from agendas where meeting_id = ${meetingId}`).map((a) => a.id));
    for (const v of input) {
      if (!agendaIds.has(v.agenda_id)) throw new AppError(422, "VALIDATION_ERROR", "이 총회의 안건이 아닙니다", "BR-VOTE-07", { fields: { agenda_id: v.agenda_id } });
    }
    for (const v of input) {
      for (const voter of voters) {
        await tx`
          insert into votes (agenda_id, member_id, choice, voting_power_ratio, channel, created_by)
          values (${v.agenda_id}, ${voter.member_id}, ${v.choice}, ${voter.voting_power}, 'lp_system', null)
          on conflict (agenda_id, member_id) do update
            set choice = excluded.choice, voting_power_ratio = excluded.voting_power_ratio, channel = 'lp_system', created_by = null
        `;
      }
    }
  });
}

// ─── 개최 처리·취소 ────────────────────────────────────────────────────────

// BR-VOTE-03, 05: 모든 안건의 결과를 판정해 잠근다. 총회일이 지나야 개최 처리할 수 있다
export async function holdMeeting(fundId: string, meetingId: string) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    await lockFund(t, fundId);
    const m = await lockMeeting(t, fundId, meetingId, "votable");
    if (m.meeting_date > today()) {
      throw new AppError(422, "INVALID_DATE", `총회일(${formatDate(m.meeting_date)}) 이후에 개최 처리할 수 있습니다`, "BR-VOTE-05");
    }
    const detail = await getMeeting(fundId, meetingId);
    const results = detail.agendas.map((a) => ({
      agenda_no: a.agenda_no,
      agenda_type: a.agenda_type,
      title: a.title,
      for_ratio: Number(a.for_ratio.toFixed(6)),
      quorum_ratio: a.quorum_ratio,
      result: (a.for_ratio >= a.quorum_ratio - 1e-9 ? "passed" : "rejected") as AgendaResult,
    }));
    for (const r of results) await tx`update agendas set result = ${r.result} where meeting_id = ${meetingId} and agenda_no = ${r.agenda_no}`;
    await tx`update general_meetings set status = 'held' where id = ${meetingId}`;
    await recordEvent(t, {
      event_type: "meeting.result_finalized",
      aggregate_type: "general_meeting",
      aggregate_id: meetingId,
      lp_id: null,
      fund_id: fundId,
      data: {
        meeting_id: meetingId,
        meeting_type: m.meeting_type,
        meeting_date: m.meeting_date,
        agendas: results,
      },
    });
  });
}

export async function cancelMeeting(fundId: string, meetingId: string) {
  await sql.begin(async (tx) => {
    await lockMeeting(tx as unknown as typeof sql, fundId, meetingId, "scheduled");
    await tx`update general_meetings set status = 'cancelled' where id = ${meetingId}`;
  });
}
