import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound, statusNotAllowed } from "@/lib/api/errors";
import { EDITABLE_FUND_STATUSES, FUND_STATUS_LABEL, FUND_STRATEGY_LABEL, PROPOSAL_STATUS_LABEL, type FundStatus, type FundStrategy, type ProposalStatus } from "@/lib/labels";
import { lpErpConfig, lpErpRequest } from "@/lib/lp-erp/client";

// LP ERP 출자사업 공고 보기 · 지원 (D47, LP L50~L55)
// · 공고는 LP ERP가 원본이다. GP는 볼 때마다 LP ERP 게시판(GP용 API)을 읽는다 — 저장하지 않는다
// · 지원 = 그 기관(출자자) 앞 출자 제안 하나 + 공고 · 부문 정보 (L53). 기획 중 · 모집 중 조합만 (L52)
// · 지원을 저장한 다음 LP ERP에 알린다. 접수 기간은 LP가 받은 시각으로 본다 (L54). 못 보내면 표시하고 다시 보낸다
// · 현업 ⚠️: 공고는 기관이 GP를 뽑는 절차다. 선정되면 나머지 출자자는 지금처럼 개별 출자 제안으로 모은다

export type LpCallTrack = {
  id: string;
  name: string;
  strategy: string;
  planned_amount: number;
  target_gp_count: number;
  min_fund_size_amount: number | null;
  max_commitment_ratio: number | null;
};

export type LpCall = {
  id: string;
  org_id: string;
  org_name: string;
  name: string;
  apply_start_date: string;
  apply_end_date: string;
  status: "open" | "reviewing";
  apply_guide: string | null;
  source: "internal" | "external";
  source_url: string | null;
  days_left: number | null;
  linked: boolean; // 이 GP와 연동된 기관 → GP ERP에서 바로 지원
  gp_lp_id: string | null; // 그 기관이 우리 출자자 목록의 누구인지 (연동된 기관만)
  tracks: LpCallTrack[];
};

export type MyApplication = {
  proposal_id: string;
  fund_id: string;
  fund_name: string;
  lp_name: string;
  lp_program_id: string;
  lp_track_id: string;
  program_name: string;
  track_name: string;
  status: ProposalStatus;
  proposed_amount: number | null;
  applied_at: Date;
  apply_sent_at: Date | null;
  apply_error_code: string | null;
  apply_error: string | null;
};

export const lpErpConfigured = () => lpErpConfig() !== null;

export async function listLpCalls(strategy?: string) {
  const q = strategy ? `?strategy=${encodeURIComponent(strategy)}` : "";
  const r = await lpErpRequest<{ items: LpCall[] }>("GET", `/api/gp/v1/programs${q}`);
  if (r.status !== 200 || !r.data) throw new AppError(502, "LP_ERP_REJECTED", `LP ERP 게시판을 읽지 못했습니다: ${r.error?.message ?? `HTTP ${r.status}`}`);
  return r.data.items;
}

export async function getLpCall(programId: string) {
  assertUuid(programId, "공고를");
  const r = await lpErpRequest<LpCall>("GET", `/api/gp/v1/programs/${programId}`);
  if (r.status === 404) throw notFound("공고를");
  if (r.status !== 200 || !r.data) throw new AppError(502, "LP_ERP_REJECTED", `LP ERP 공고를 읽지 못했습니다: ${r.error?.message ?? `HTTP ${r.status}`}`);
  return r.data;
}

export async function listMyApplications(programId?: string) {
  return sql<MyApplication[]>`
    select p.id as proposal_id, p.fund_id, f.name as fund_name, lp.name as lp_name, p.lp_program_id, p.lp_track_id, p.program_name, p.track_name,
           p.status, p.proposed_amount, p.applied_at, p.apply_sent_at, p.apply_error_code, p.apply_error
    from lp_proposals p join funds f on f.id = p.fund_id join limited_partners lp on lp.id = p.lp_id
    where p.applied_at is not null ${programId ? sql`and p.lp_program_id = ${programId}` : sql``}
    order by p.applied_at desc
  `;
}

// 지원할 수 있는 조합: 기획 중 · 모집 중 (L52)
export async function applicableFunds() {
  return sql<{ id: string; name: string; status: FundStatus; strategy: FundStrategy; target_amount: number }[]>`
    select id, name, status, strategy, target_amount from funds where status in ${sql(EDITABLE_FUND_STATUSES)} order by name
  `;
}

export type ApplyInput = { fund_id: string; track_id: string; proposed_amount: number; memo: string | null };

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export async function applyToLpCall(programId: string, input: ApplyInput, userId: string) {
  const call = await getLpCall(programId);
  // 1) 공고 검사 (최종 판정은 LP가 받는 순간 다시 한다, L54)
  if (!call.linked || !call.gp_lp_id) {
    throw new AppError(422, "LP_NOT_LINKED", `${call.org_name}은(는) 이 GP와 연동되지 않은 기관입니다. 공고의 접수 방법대로 지원하세요`, "D47");
  }
  if (call.status !== "open" || call.apply_end_date < today() || call.apply_start_date > today()) {
    throw new AppError(422, "CALL_NOT_OPEN", "접수 기간이 아닌 공고입니다", "D47");
  }
  const track = call.tracks.find((t) => t.id === input.track_id);
  if (!track) throw new AppError(422, "VALIDATION_ERROR", "모집 부문을 다시 고르세요", undefined, { fields: { track_id: "이 공고의 부문이 아닙니다" } });

  const id = await sql.begin(async (tx) => {
    // 2) 조합: 기획 중 · 모집 중만 (L52)
    assertUuid(input.fund_id, "조합을");
    const [fund] = await tx<{ status: FundStatus; name: string; strategy: FundStrategy }[]>`select status, name, strategy from funds where id = ${input.fund_id} for update`;
    if (!fund) throw notFound("조합을");
    if (!EDITABLE_FUND_STATUSES.includes(fund.status)) {
      throw statusNotAllowed("D47", `${FUND_STATUS_LABEL[fund.status]} 조합으로는 공고에 지원할 수 없습니다 (기획 중 · 모집 중 조합만)`);
    }
    // 분야: 조합 분야와 부문 분야가 같아야 한다 (D47 보완, 마이그레이션 018)
    if (fund.strategy !== track.strategy) {
      const name = (s: string) => FUND_STRATEGY_LABEL[s as FundStrategy] ?? s;
      throw new AppError(422, "STRATEGY_MISMATCH", `${fund.name}은(는) ${name(fund.strategy)} 분야 조합이라 ${name(track.strategy)} 분야 부문 "${track.name}"에 지원할 수 없습니다`, "D47", { fields: { track_id: "조합 분야와 다른 부문입니다" } });
    }
    // 3) 그 기관 앞 제안은 조합마다 하나 (BR-PROP-05). 이미 개별 제안이 있으면 지원으로 바꾸지 않는다
    const [dup] = await tx<{ id: string; status: ProposalStatus; lp_program_id: string | null }[]>`
      select id, status, lp_program_id from lp_proposals where fund_id = ${input.fund_id} and lp_id = ${call.gp_lp_id}
    `;
    if (dup) {
      const what = dup.lp_program_id ? "이미 공고에 지원했습니다" : `이미 개별 출자 제안이 있습니다 (${PROPOSAL_STATUS_LABEL[dup.status]})`;
      throw new AppError(409, "DUPLICATE_PROPOSAL", `${fund.name}은(는) ${call.org_name}에 ${what}`, "BR-PROP-05", { existing_proposal_id: dup.id });
    }
    const [p] = await tx<{ id: string }[]>`
      insert into lp_proposals (fund_id, lp_id, status, proposed_amount, proposed_date, memo, created_by,
                                lp_program_id, lp_track_id, program_name, track_name, applied_at)
      values (${input.fund_id}, ${call.gp_lp_id}, 'proposed', ${input.proposed_amount}, ${today()}, ${input.memo}, ${userId},
              ${call.id}, ${track.id}, ${call.name}, ${track.name}, now())
      returning id
    `;
    return p.id;
  });
  // 4) 저장한 다음 LP ERP에 알린다 (실패해도 지원 기록은 남는다)
  const sent = await sendApplication(id);
  return { proposal_id: id, ...sent };
}

// LP ERP에 지원 알리기. 성공하면 apply_sent_at = LP가 받은 시각, 거부 · 실패면 이유를 남긴다
export async function sendApplication(proposalId: string) {
  const [p] = await sql<{ id: string; lp_id: string; fund_id: string; lp_program_id: string | null; lp_track_id: string | null; apply_sent_at: Date | null }[]>`
    select id, lp_id, fund_id, lp_program_id, lp_track_id, apply_sent_at from lp_proposals where id = ${proposalId}
  `;
  if (!p) throw notFound("출자 제안을");
  if (!p.lp_program_id) throw new AppError(422, "NOT_APPLICATION", "공고 지원으로 만든 제안이 아닙니다");
  if (p.apply_sent_at) return { status: "sent" as const, received_at: p.apply_sent_at };
  try {
    const r = await lpErpRequest<{ received_at: string; lp_proposal_id: string }>("POST", "/api/gp/v1/applications", {
      gp_proposal_id: p.id,
      gp_lp_id: p.lp_id,
      program_id: p.lp_program_id,
      track_id: p.lp_track_id,
    });
    if ((r.status === 200 || r.status === 201) && r.data) {
      await sql`update lp_proposals set apply_sent_at = ${r.data.received_at}, apply_error_code = null, apply_error = null where id = ${p.id}`;
      return { status: "sent" as const, received_at: r.data.received_at };
    }
    const code = r.error?.code ?? `HTTP_${r.status}`;
    const message = r.error?.message ?? `LP ERP가 지원을 받지 않았습니다 (HTTP ${r.status})`;
    await sql`update lp_proposals set apply_error_code = ${code}, apply_error = ${message} where id = ${p.id}`;
    return { status: "rejected" as const, error_code: code, error: message };
  } catch (err) {
    const code = err instanceof AppError ? err.code : "LP_ERP_UNAVAILABLE";
    const message = err instanceof Error ? err.message : "LP ERP에 연결하지 못했습니다";
    await sql`update lp_proposals set apply_error_code = ${code}, apply_error = ${message} where id = ${p.id}`;
    return { status: "failed" as const, error_code: code, error: message };
  }
}
