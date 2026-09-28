import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound, statusNotAllowed } from "@/lib/api/errors";
import type { FundStatus, NoticeType } from "@/lib/labels";
import type { NoticeInput } from "@/lib/schemas/notice";
import { recordEvent } from "@/lib/services/events";

// 통지 (04 업무 규칙 12-1, BR-NTC-01, 02)
// · 출자 제안·캐피탈콜·총회 소집·정기 보고·분배는 해당 업무에서 자동으로 발송된다
// · GP는 일반 공지만 직접 작성한다: 초안 → 발송. 발송한 통지는 수정·삭제할 수 없다 (BR-NTC-01)
// · LP 확인 시각은 LP 시스템이 연동 API로 알려줄 때만 기록된다 (BR-NTC-02)

export type NoticeRecipient = { lp_id: string; lp_name: string; acknowledged_at: string | null };
export type Notice = {
  id: string;
  notice_type: NoticeType;
  title: string;
  body: string;
  status: "draft" | "sent";
  sent_at: Date | null;
  created_at: Date;
  recipients: NoticeRecipient[];
};

const NOTICE_STATUSES: FundStatus[] = ["fundraising", "formed", "operating", "dissolved"]; // 일반 공지 (청산 후에는 조회만)

export async function listNotices(fundId: string, type?: NoticeType | null) {
  assertUuid(fundId, "조합을");
  const [fund] = await sql<{ status: FundStatus }[]>`select status from funds where id = ${fundId}`;
  if (!fund) throw notFound("조합을");
  const notices = await sql<Notice[]>`
    select n.id, n.notice_type, n.title, n.body, n.status, n.sent_at, n.created_at,
           coalesce(json_agg(json_build_object('lp_id', r.lp_id, 'lp_name', lp.name, 'acknowledged_at', r.acknowledged_at) order by lp.name)
                    filter (where r.id is not null), '[]') as recipients
    from notices n
    left join notice_recipients r on r.notice_id = n.id
    left join limited_partners lp on lp.id = r.lp_id
    where n.fund_id = ${fundId} and (${type ?? null}::text is null or n.notice_type = ${type ?? null})
    group by n.id
    order by n.status = 'draft' desc, coalesce(n.sent_at, n.created_at) desc
  `;
  const counts = await sql<{ notice_type: NoticeType; count: number }[]>`
    select notice_type, count(*)::int as count from notices where fund_id = ${fundId} group by notice_type
  `;
  // 수신자 선택지: LP 조합원
  const members = await sql<{ lp_id: string; lp_name: string }[]>`
    select distinct m.lp_id, lp.name as lp_name
    from fund_members m join limited_partners lp on lp.id = m.lp_id
    where m.fund_id = ${fundId} and m.lp_id is not null
    order by lp.name
  `;
  const all = await sql<{ sent: number; acknowledged: number }[]>`
    select count(*)::int as sent, count(r.acknowledged_at)::int as acknowledged
    from notice_recipients r join notices n on n.id = r.notice_id
    where n.fund_id = ${fundId} and n.status = 'sent'
  `;
  return {
    fund_status: fund.status,
    can_write: NOTICE_STATUSES.includes(fund.status) && members.length > 0,
    counts: Object.fromEntries(counts.map((c) => [c.notice_type, c.count])) as Partial<Record<NoticeType, number>>,
    totals: all[0],
    members,
    notices,
  };
}

async function lockFund(tx: typeof sql, fundId: string) {
  assertUuid(fundId, "조합을");
  const [fund] = await tx<{ status: FundStatus }[]>`select status from funds where id = ${fundId} for update`;
  if (!fund) throw notFound("조합을");
  if (!NOTICE_STATUSES.includes(fund.status)) throw statusNotAllowed("BR-FUND-08", "일반 공지는 모집부터 해산까지 보낼 수 있습니다");
  return fund;
}

// 일반 공지 초안. 수신자를 비우면 LP 조합원 전원
export async function createGeneralNotice(fundId: string, input: NoticeInput, userId: string) {
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    await lockFund(t, fundId);
    const rows = await tx<{ lp_id: string }[]>`select distinct lp_id from fund_members where fund_id = ${fundId} and lp_id is not null`;
    const members = new Set(rows.map((r) => r.lp_id));
    if (members.size === 0) throw new AppError(422, "NO_RECIPIENT", "공지를 받을 LP 조합원이 없습니다. 조합원 명부를 먼저 확정하세요");
    const targets = input.lp_ids.length ? [...new Set(input.lp_ids)] : [...members];
    if (targets.some((id) => !members.has(id))) {
      throw new AppError(422, "NOT_A_MEMBER", "이 조합의 LP 조합원에게만 보낼 수 있습니다", undefined, { fields: { lp_ids: "조합원이 아닌 수신자가 있습니다" } });
    }
    const [notice] = await tx<{ id: string }[]>`
      insert into notices (fund_id, notice_type, title, body, status, created_by)
      values (${fundId}, 'general', ${input.title}, ${input.body}, 'draft', ${userId})
      returning id
    `;
    for (const lpId of targets) await tx`insert into notice_recipients (notice_id, lp_id) values (${notice.id}, ${lpId})`;
    return { id: notice.id };
  });
}

async function lockDraft(tx: typeof sql, fundId: string, noticeId: string) {
  assertUuid(noticeId, "통지를");
  const [n] = await tx<{ id: string; notice_type: NoticeType; title: string; status: string }[]>`
    select id, notice_type, title, status from notices where id = ${noticeId} and fund_id = ${fundId} for update
  `;
  if (!n) throw notFound("통지를");
  if (n.status !== "draft") throw new AppError(409, "DOCUMENT_LOCKED", "발송한 통지는 수정·삭제할 수 없습니다. 정정이 필요하면 새 공지를 보내세요", "BR-NTC-01");
  return n;
}

// 발송: 잠그고 수신 LP마다 notice.sent 이벤트 (BR-NTC-01, BR-EVT-01)
export async function sendNotice(fundId: string, noticeId: string) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    await lockFund(t, fundId);
    const n = await lockDraft(t, fundId, noticeId);
    const [sent] = await tx<{ sent_at: Date }[]>`update notices set status = 'sent', sent_at = now() where id = ${n.id} returning sent_at`;
    const recipients = await tx<{ lp_id: string }[]>`select lp_id from notice_recipients where notice_id = ${n.id}`;
    for (const r of recipients) {
      await recordEvent(t, {
        event_type: "notice.sent",
        aggregate_type: "notice",
        aggregate_id: n.id,
        lp_id: r.lp_id,
        fund_id: fundId,
        data: { notice_id: n.id, notice_type: n.notice_type, title: n.title, sent_at: sent.sent_at },
      });
    }
  });
}

export async function deleteNoticeDraft(fundId: string, noticeId: string) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    await lockFund(t, fundId);
    const n = await lockDraft(t, fundId, noticeId);
    await tx`delete from notice_recipients where notice_id = ${n.id}`;
    await tx`delete from notices where id = ${n.id}`;
  });
}
