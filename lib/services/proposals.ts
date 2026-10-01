import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound, statusNotAllowed } from "@/lib/api/errors";
import { formatKRW, formatPercent } from "@/lib/format";
import {
  EDITABLE_FUND_STATUSES,
  FUND_TYPE_LABEL,
  PROPOSAL_STATUS_LABEL,
  type FundStatus,
  type FundType,
  type GpType,
  type LpType,
  type ProposalStatus,
} from "@/lib/labels";

export type DecidedVia = "gp" | "lp_system";
import { getFundMinimum } from "@/lib/rules/fund-minimums";
import type { CreateProposalInput, ProposalTransitionInput, UpdateProposalInput } from "@/lib/schemas/proposal";
import { recordEvent } from "@/lib/services/events";

// 출자 제안 서비스 (단계 2. LP 모집)
// · 확약(loc_amount)은 결성 전 약속이다. 법적 금액인 약정은 R2 조합원 명부 확정 때 원장에 기록된다
// · 제안 발송은 통지(notices)로 남기고, 같은 트랜잭션에서 LP 연동 이벤트를 만든다 (BR-PROP-03, BR-EVT-01)

export type ProposalItem = {
  id: string;
  lp_id: string;
  lp_name: string;
  lp_type: LpType;
  status: ProposalStatus;
  proposed_amount: number | null;
  loc_amount: number | null;
  proposed_date: string;
  decided_date: string | null;
  decided_via: DecidedVia | null; // 마지막으로 상태를 바꾼 곳. lp_system 이면 화면에 "LP 직접" (D45)
  memo: string | null; // GP 내부 메모 (LP 비공개)
  send_count: number;
  last_sent_at: Date | null;
};

export type FundraisingSummary = {
  target_amount: number;
  min_fund_amount: number | null;
  committed_amount: number; // 확약 금액 합 (BR-PROP-04)
  achievement_ratio: number; // 확약 합 ÷ 목표 결성액. 100%를 넘을 수 있다
  pipeline_amount: number; // 제안·검토 중인 제안 금액 합 (참고용)
  counts: Record<ProposalStatus, number>;
};

export type FundProposals = {
  fund_status: FundStatus;
  can_edit: boolean; // 기획·모집 중
  can_send: boolean; // 모집 중만 (BR-PROP-03)
  summary: FundraisingSummary;
  items: ProposalItem[];
};

export async function listProposals(fundId: string): Promise<FundProposals> {
  assertUuid(fundId, "조합을");
  const [fund] = await sql<{ status: FundStatus; target_amount: number; fund_type: FundType; gp_type: GpType }[]>`
    select status, target_amount, fund_type, gp_type from funds where id = ${fundId}
  `;
  if (!fund) throw notFound("조합을");

  const items = await sql<ProposalItem[]>`
    select p.id, p.lp_id, lp.name as lp_name, lp.lp_type, p.status, p.proposed_amount, p.loc_amount,
           p.proposed_date, p.decided_date, p.decided_via, p.memo,
           count(n.id)::int as send_count, max(n.sent_at) as last_sent_at
    from lp_proposals p
    join limited_partners lp on lp.id = p.lp_id
    left join notices n on n.source_type = 'lp_proposal' and n.source_id = p.id and n.status = 'sent'
    where p.fund_id = ${fundId}
    group by p.id, lp.id
    order by case p.status when 'committed' then 1 when 'reviewing' then 2 when 'proposed' then 3 else 4 end,
             coalesce(p.loc_amount, p.proposed_amount, 0) desc, lp.name
  `;

  const counts = { proposed: 0, reviewing: 0, committed: 0, declined: 0 } as Record<ProposalStatus, number>;
  let committed = 0;
  let pipeline = 0;
  for (const p of items) {
    counts[p.status] += 1;
    if (p.status === "committed") committed += p.loc_amount ?? 0;
    if (p.status === "proposed" || p.status === "reviewing") pipeline += p.proposed_amount ?? 0;
  }

  return {
    fund_status: fund.status,
    can_edit: EDITABLE_FUND_STATUSES.includes(fund.status),
    can_send: fund.status === "fundraising",
    summary: {
      target_amount: fund.target_amount,
      min_fund_amount: getFundMinimum(fund.fund_type, fund.gp_type).minFundAmount,
      committed_amount: committed,
      achievement_ratio: fund.target_amount > 0 ? committed / fund.target_amount : 0,
      pipeline_amount: pipeline,
      counts,
    },
    items,
  };
}

// ─── 공통 ──────────────────────────────────────────────────────────────────

// 조합 행을 잠그고 제안을 다룰 수 있는 상태인지 확인한다 (02 상태별 작업표: 기획·모집 중만)
async function lockFund(tx: typeof sql, fundId: string) {
  assertUuid(fundId, "조합을");
  const [fund] = await tx<{ status: FundStatus }[]>`select status from funds where id = ${fundId} for update`;
  if (!fund) throw notFound("조합을");
  if (!EDITABLE_FUND_STATUSES.includes(fund.status)) {
    throw statusNotAllowed("BR-FUND-08", "결성 이후에는 출자 제안을 바꿀 수 없습니다");
  }
  return fund;
}

type ProposalRow = { id: string; lp_id: string; status: ProposalStatus; proposed_amount: number | null; loc_amount: number | null; proposed_date: string };

async function lockProposal(tx: typeof sql, fundId: string, proposalId: string): Promise<ProposalRow> {
  assertUuid(proposalId, "출자 제안을");
  const [row] = await tx<ProposalRow[]>`
    select id, lp_id, status, proposed_amount, loc_amount, proposed_date from lp_proposals
    where id = ${proposalId} and fund_id = ${fundId}
    for update
  `;
  if (!row) throw notFound("출자 제안을");
  return row;
}

const closed = (message: string) => new AppError(409, "PROPOSAL_CLOSED", message, "BR-PROP-01");

// ─── 작성·수정 ─────────────────────────────────────────────────────────────

export async function createProposal(fundId: string, input: CreateProposalInput, userId: string) {
  return sql.begin(async (tx) => {
    await lockFund(tx as unknown as typeof sql, fundId);

    const [lp] = await tx<{ name: string }[]>`select name from limited_partners where id = ${input.lp_id}`;
    if (!lp) throw new AppError(422, "VALIDATION_ERROR", "출자자를 찾을 수 없습니다", undefined, { fields: { lp_id: "출자자를 다시 선택하세요" } });

    // 한 조합에 한 출자자는 제안 1건 (DB 유일 제약도 막지만, 기존 제안을 알려주려고 먼저 확인)
    const [dup] = await tx<{ id: string; status: ProposalStatus }[]>`
      select id, status from lp_proposals where fund_id = ${fundId} and lp_id = ${input.lp_id}
    `;
    if (dup) {
      throw new AppError(409, "DUPLICATE_PROPOSAL", `${lp.name}에게는 이미 이 조합의 출자 제안이 있습니다 (${PROPOSAL_STATUS_LABEL[dup.status]})`, "BR-PROP-05", {
        existing_proposal_id: dup.id,
        fields: { lp_id: "이미 제안한 출자자입니다" },
      });
    }

    const [created] = await tx<{ id: string }[]>`
      insert into lp_proposals ${tx({ ...input, fund_id: fundId, created_by: userId })}
      returning id
    `;
    return created;
  });
}

export async function updateProposal(fundId: string, proposalId: string, input: UpdateProposalInput) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    await lockFund(t, fundId);
    const p = await lockProposal(t, fundId, proposalId);
    if (p.status === "declined") throw closed("거절된 제안은 수정할 수 없습니다");

    // 확약 금액은 확약 상태에서만 있다. 확약된 제안은 결성 전까지 확약 금액을 고칠 수 있다 (BR-PROP-01, 02)
    if (p.status === "committed" && input.loc_amount === null) {
      throw new AppError(422, "LOC_AMOUNT_REQUIRED", "확약 금액을 입력하세요", "BR-PROP-02", { fields: { loc_amount: "확약 금액을 입력하세요" } });
    }
    if (p.status !== "committed" && input.loc_amount !== null) {
      throw new AppError(422, "VALIDATION_ERROR", "확약 금액은 확약으로 바꿀 때 입력합니다", "BR-PROP-02", {
        fields: { loc_amount: "확약 상태에서만 입력할 수 있습니다" },
      });
    }

    await tx`
      update lp_proposals set ${tx(input, "proposed_amount", "loc_amount", "memo")}
      where id = ${proposalId}
    `;
  });
}

// ─── 단계 이동 ─────────────────────────────────────────────────────────────

// BR-PROP-01: 제안 → 검토 중 → 확약 / 거절. 검토 중을 거치지 않고 바로 확약·거절할 수도 있다.
// 확약·거절은 되돌릴 수 없다
const NEXT: Record<ProposalStatus, ProposalStatus[]> = {
  proposed: ["reviewing", "committed", "declined"],
  reviewing: ["committed", "declined"],
  committed: [],
  declined: [],
};

export async function transitionProposal(fundId: string, proposalId: string, input: ProposalTransitionInput) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    await lockFund(t, fundId);
    const p = await lockProposal(t, fundId, proposalId);

    if (!NEXT[p.status].includes(input.to_status)) {
      throw new AppError(
        422,
        "INVALID_STAGE_TRANSITION",
        `${PROPOSAL_STATUS_LABEL[p.status]}에서 ${PROPOSAL_STATUS_LABEL[input.to_status]}(으)로 바꿀 수 없습니다`,
        "BR-PROP-01",
      );
    }

    if (input.to_status === "reviewing") {
      await tx`update lp_proposals set status = 'reviewing', decided_via = 'gp' where id = ${proposalId}`;
      return;
    }

    // 확약·거절은 결정일을 남긴다. 기본값은 오늘
    const decidedDate = input.decided_date ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    if (decidedDate < p.proposed_date) {
      const message = `결정일은 제안일(${p.proposed_date}) 이후여야 합니다`;
      throw new AppError(422, "INVALID_DATE", message, "BR-PROP-01", { fields: { decided_date: message } });
    }

    if (input.to_status === "committed") {
      // BR-PROP-02: 확약하려면 확약 금액이 필요하다
      if (input.loc_amount === null) {
        throw new AppError(422, "LOC_AMOUNT_REQUIRED", "확약하려면 확약 금액을 입력하세요", "BR-PROP-02", {
          fields: { loc_amount: "확약 금액을 입력하세요" },
        });
      }
      await tx`
        update lp_proposals set status = 'committed', loc_amount = ${input.loc_amount}, decided_date = ${decidedDate}, decided_via = 'gp'
        where id = ${proposalId}
      `;
    } else {
      await tx`update lp_proposals set status = 'declined', decided_date = ${decidedDate}, decided_via = 'gp' where id = ${proposalId}`;
    }
  });
}

// ─── LP 시스템의 응답 (D45) ────────────────────────────────────────────────

export type LpProposalDecision = "reviewing" | "committed" | "declined";

// LP 기관용 ERP가 심사 결과를 직접 알려준다: 검토 시작 / 확약(확약 금액) / 거절.
// · 같은 요청을 다시 보내면 결과가 같다: 이미 그 상태(확약이면 같은 금액)면 바꾸지 않고 changed = false
// · 확약·거절은 되돌릴 수 없다 (BR-PROP-01). 다른 결정·다른 금액으로 바꾸려 하면 PROPOSAL_CLOSED
// · 발송하지 않은 제안은 LP가 모르는 제안이라 "없음"으로 답한다
// · 이 변경은 LP 시스템이 한 것이라 연동 이벤트를 만들지 않는다 (D40 직접 투표와 같은 이유)
export async function respondFromLpSystem(
  lpId: string,
  proposalId: string,
  input: { decision: LpProposalDecision; loc_amount: number | null; decided_date: string | null },
) {
  assertUuid(proposalId, "출자 제안을");
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const [found] = await tx<{ fund_id: string }[]>`
      select p.fund_id from lp_proposals p
      where p.id = ${proposalId} and p.lp_id = ${lpId}
        and exists (select 1 from notices n where n.source_type = 'lp_proposal' and n.source_id = p.id and n.status = 'sent')
    `;
    if (!found) throw notFound("출자 제안을");

    // 다른 제안 작업과 같은 순서(조합 → 제안)로 잠근다
    const [fund] = await tx<{ status: FundStatus }[]>`select status from funds where id = ${found.fund_id} for update`;
    const p = await lockProposal(t, found.fund_id, proposalId);

    // 이미 원하는 상태면 그대로 (다시 보내기)
    const same =
      p.status === input.decision && (input.decision !== "committed" || p.loc_amount === input.loc_amount);
    if (same) return { changed: false };

    if (p.status === "committed" || p.status === "declined") {
      const detail = p.status === "committed" ? `${formatKRW(p.loc_amount ?? 0)}으로 확약된` : "거절된";
      throw closed(`이미 ${detail} 제안이라 바꿀 수 없습니다. 바꾸려면 GP에 요청하세요`);
    }
    if (!EDITABLE_FUND_STATUSES.includes(fund.status)) {
      throw statusNotAllowed("BR-FUND-08", "결성 이후에는 출자 제안을 바꿀 수 없습니다");
    }

    if (input.decision === "reviewing") {
      await tx`update lp_proposals set status = 'reviewing', decided_via = 'lp_system' where id = ${proposalId}`;
      return { changed: true };
    }

    const decidedDate = input.decided_date ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    if (decidedDate < p.proposed_date) {
      const message = `결정일은 제안일(${p.proposed_date}) 이후여야 합니다`;
      throw new AppError(422, "INVALID_DATE", message, "BR-PROP-01", { fields: { decided_date: message } });
    }
    if (input.decision === "committed") {
      await tx`
        update lp_proposals set status = 'committed', loc_amount = ${input.loc_amount}, decided_date = ${decidedDate}, decided_via = 'lp_system'
        where id = ${proposalId}
      `;
    } else {
      await tx`update lp_proposals set status = 'declined', decided_date = ${decidedDate}, decided_via = 'lp_system' where id = ${proposalId}`;
    }
    return { changed: true };
  });
}

// ─── 발송 ──────────────────────────────────────────────────────────────────

type FundForNotice = {
  name: string;
  fund_type: FundType;
  target_amount: number;
  term_years: number;
  investment_period_years: number;
  primary_purpose: string;
  unit_amount: number;
  management_fee_rate: string;
  carry_rate: string;
  hurdle_rate: string;
};

// 통지 본문. LP에게 공개되는 내용이므로 내부 메모는 넣지 않는다
function proposalNoticeBody(fund: FundForNotice, lpName: string, proposedAmount: number | null) {
  const lines = [
    `${lpName} 귀중`,
    "",
    `${fund.name}(${FUND_TYPE_LABEL[fund.fund_type]}) 출자를 제안드립니다.`,
    "",
    `· 목표 결성액: ${formatKRW(fund.target_amount)}`,
    ...(proposedAmount ? [`· 제안 출자 금액: ${formatKRW(proposedAmount)}`] : []),
    `· 존속 기간: ${fund.term_years}년 (투자 기간 ${fund.investment_period_years}년)`,
    `· 주목적 투자 분야: ${fund.primary_purpose}`,
    `· 1좌 금액: ${formatKRW(fund.unit_amount)}`,
    `· 관리보수율: 연 ${formatPercent(Number(fund.management_fee_rate))} · 성과보수율: ${formatPercent(Number(fund.carry_rate))} · 기준수익률: 연 ${formatPercent(Number(fund.hurdle_rate))}`,
    "",
    "검토 후 출자 확약 여부를 회신해 주시기 바랍니다.",
  ];
  return lines.join("\n");
}

// BR-PROP-03: 모집 중인 조합만. 해당 LP 한 곳을 수신자로 통지를 만든다.
// 제안서를 고쳐 다시 보내야 할 수 있어 재발송을 허용한다 (발송된 통지는 고치지 않고 새로 만든다, BR-NTC-01)
export async function sendProposal(fundId: string, proposalId: string, userId: string) {
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const { status } = await lockFund(t, fundId);
    if (status !== "fundraising") throw statusNotAllowed("BR-PROP-03", "모집 중인 조합만 출자 제안을 발송할 수 있습니다. 먼저 모집을 시작하세요");
    const p = await lockProposal(t, fundId, proposalId);
    if (p.status === "committed" || p.status === "declined") {
      throw closed(`이미 ${PROPOSAL_STATUS_LABEL[p.status]}된 제안은 발송할 수 없습니다`);
    }

    const [fund] = await tx<FundForNotice[]>`
      select f.name, f.fund_type, f.target_amount, f.term_years, f.investment_period_years,
             t.primary_purpose, t.unit_amount, t.management_fee_rate, t.carry_rate, t.hurdle_rate
      from funds f
      join fund_terms t on t.fund_id = f.id
      where f.id = ${fundId}
      order by t.version desc
      limit 1
    `;
    const [lp] = await tx<{ name: string }[]>`select name from limited_partners where id = ${p.lp_id}`;

    const title = `${fund.name} 출자 제안`;
    const [notice] = await tx<{ id: string; sent_at: Date }[]>`
      insert into notices (fund_id, notice_type, title, body, source_type, source_id, status, sent_at, created_by)
      values (${fundId}, 'proposal', ${title}, ${proposalNoticeBody(fund, lp.name, p.proposed_amount)},
              'lp_proposal', ${proposalId}, 'sent', now(), ${userId})
      returning id, sent_at
    `;
    await tx`insert into notice_recipients (notice_id, lp_id) values (${notice.id}, ${p.lp_id})`;
    await recordEvent(t, {
      event_type: "notice.sent",
      aggregate_type: "notice",
      aggregate_id: notice.id,
      lp_id: p.lp_id,
      fund_id: fundId,
      data: {
        notice_id: notice.id,
        notice_type: "proposal",
        title,
        sent_at: notice.sent_at,
        proposal: { status: p.status, proposed_amount: p.proposed_amount }, // 🟢 본인 제안의 상태·금액만
      },
    });
    return notice;
  });
}
