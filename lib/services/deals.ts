import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import { DEAL_NEXT, DEAL_STAGE_LABEL, FUND_STATUS_LABEL, type DealStage, type FundStatus } from "@/lib/labels";
import type { CreateDealInput, DealTransitionInput, UpdateDealInput } from "@/lib/schemas/deal";

// 딜 파이프라인 서비스 (BR-DEAL-01~05, D18)
// · 발굴 → 검토 → 투심위 → 투자 확정 / 어느 단계에서든 드롭. 투심위에서 검토로 되돌릴 수 있다 (보완 요청)
// · 투심위에 올리려면 메모 1건 이상 + 예상 투자 금액 (BR-DEAL-07), 투자 확정에는 투자 예정 조합 + 예상 금액 (BR-DEAL-04)
// · 투자 확정·드롭은 종료 상태. 드롭된 기업을 다시 보려면 새 딜을 만든다
// · 단계가 바뀔 때마다 이력을 남겨 단계별 소요 기간과 드롭 지점을 분석한다
// · 딜·메모는 GP 내부 정보라 LP 시스템에 보내지 않는다 (🔴, 03 DB 설계 7장)

export type DealListItem = {
  id: string;
  company_id: string;
  company_name: string;
  sector: string | null;
  stage: DealStage;
  target_fund_id: string | null;
  target_fund_name: string | null;
  expected_amount: number | null;
  owner_id: string;
  owner_name: string;
  sourced_date: string;
  stage_since: Date; // 현재 단계에 들어온 시각
  drop_reason: string | null;
  note_count: number;
  invested: boolean; // 이 딜로 신규 투자가 집행됐는지
};

export type DealDetail = DealListItem & {
  history: { from_stage: DealStage | null; to_stage: DealStage; changed_by_name: string | null; changed_at: Date }[];
  notes: { id: string; stage: DealStage; content: string; author_name: string | null; created_at: Date }[];
  other_deals: { id: string; stage: DealStage; sourced_date: string; drop_reason: string | null }[]; // 같은 기업의 다른 딜
};

// 투자 예정 조합으로 고를 수 있는 상태 (04 업무 규칙 2-2: 딜 파이프라인은 기획 ~ 운용)
const DEAL_FUND_STATUSES: FundStatus[] = ["planning", "fundraising", "formed", "operating"];

const selectDeals = (where: ReturnType<typeof sql>) => sql<DealListItem[]>`
  select d.id, d.company_id, c.name as company_name, c.sector, d.stage, d.target_fund_id, f.name as target_fund_name,
         d.expected_amount, d.owner_id, coalesce(s.name, u.name) as owner_name, d.sourced_date, d.drop_reason,
         coalesce((select max(h.changed_at) from deal_stage_history h where h.deal_id = d.id), d.created_at) as stage_since,
         (select count(*)::int from deal_notes n where n.deal_id = d.id) as note_count,
         exists (select 1 from investments i where i.deal_id = d.id and not i.is_follow_on) as invested
  from deals d
  join companies c on c.id = d.company_id
  join users u on u.id = d.owner_id
  left join staff s on s.user_id = u.id
  left join funds f on f.id = d.target_fund_id
  ${where}
  order by d.sourced_date desc, d.created_at desc
`;

export async function listDeals(filter: { stage?: DealStage | null; owner_id?: string | null; fund_id?: string | null } = {}) {
  const stage = filter.stage ?? null;
  const owner = filter.owner_id ?? null;
  const fund = filter.fund_id ?? null;
  return selectDeals(sql`
    where (${stage}::text is null or d.stage = ${stage})
      and (${owner}::uuid is null or d.owner_id = ${owner}::uuid)
      and (${fund}::uuid is null or d.target_fund_id = ${fund}::uuid)
  `);
}

// 파이프라인 통계: 단계별 건수, 단계별 평균 소요일(그 단계를 떠난 딜 기준), 드롭 사유
export async function dealStats() {
  const counts = await sql<{ stage: DealStage; count: number }[]>`select stage, count(*)::int as count from deals group by stage`;
  const durations = await sql<{ stage: DealStage; avg_days: number; samples: number }[]>`
    with h as (
      select deal_id, to_stage as stage, changed_at,
             lead(changed_at) over (partition by deal_id order by changed_at) as left_at
      from deal_stage_history
    )
    select stage, round(avg(extract(epoch from left_at - changed_at) / 86400)::numeric, 1)::float8 as avg_days, count(*)::int as samples
    from h where left_at is not null group by stage
  `;
  const drops = await sql<{ drop_reason: string; count: number }[]>`
    select drop_reason, count(*)::int as count from deals where stage = 'dropped' group by drop_reason order by count desc limit 5
  `;
  return { counts: Object.fromEntries(counts.map((c) => [c.stage, c.count])) as Partial<Record<DealStage, number>>, durations, drops };
}

// 담당자 후보: 로그인 계정이 있고 중지되지 않은 사람 (구성원이면 구성원 이름)
export async function listOwnerOptions() {
  return sql<{ id: string; name: string; position: string | null }[]>`
    select u.id, coalesce(s.name, u.name) as name, s.position
    from users u left join staff s on s.user_id = u.id
    where u.disabled_at is null and (s.id is null or s.left_date is null)
    order by coalesce(s.name, u.name)
  `;
}

export async function listFundOptions() {
  return sql<{ id: string; name: string; status: FundStatus }[]>`
    select id, name, status from funds where status in ${sql(DEAL_FUND_STATUSES)} order by created_at desc
  `;
}

export async function getDeal(dealId: string): Promise<DealDetail> {
  assertUuid(dealId, "딜을");
  const [deal] = await selectDeals(sql`where d.id = ${dealId}`);
  if (!deal) throw notFound("딜을");
  const history = await sql<DealDetail["history"]>`
    select h.from_stage, h.to_stage, coalesce(s.name, u.name) as changed_by_name, h.changed_at
    from deal_stage_history h left join users u on u.id = h.changed_by left join staff s on s.user_id = u.id
    where h.deal_id = ${dealId} order by h.changed_at
  `;
  const notes = await sql<DealDetail["notes"]>`
    select n.id, n.stage, n.content, coalesce(s.name, u.name) as author_name, n.created_at
    from deal_notes n left join users u on u.id = n.created_by left join staff s on s.user_id = u.id
    where n.deal_id = ${dealId} order by n.created_at desc
  `;
  const other_deals = await sql<DealDetail["other_deals"]>`
    select id, stage, sourced_date, drop_reason from deals where company_id = ${deal.company_id} and id <> ${dealId} order by sourced_date desc
  `;
  return { ...deal, history, notes, other_deals };
}

// ─── 등록·수정 ─────────────────────────────────────────────────────────────

async function assertRefs(tx: typeof sql, input: { owner_id: string; target_fund_id: string | null }) {
  const [owner] = await tx`select 1 from users where id = ${input.owner_id} and disabled_at is null`;
  if (!owner) throw new AppError(422, "VALIDATION_ERROR", "담당자를 다시 선택하세요", undefined, { fields: { owner_id: "사용 중인 계정의 담당자를 고르세요" } });
  if (input.target_fund_id) {
    const [fund] = await tx<{ status: FundStatus }[]>`select status from funds where id = ${input.target_fund_id}`;
    if (!fund) throw new AppError(422, "VALIDATION_ERROR", "투자 예정 조합을 다시 선택하세요", undefined, { fields: { target_fund_id: "조합을 찾을 수 없습니다" } });
    if (!DEAL_FUND_STATUSES.includes(fund.status)) {
      const message = `${FUND_STATUS_LABEL[fund.status]} 상태의 조합에는 투자할 수 없습니다`;
      throw new AppError(422, "FUND_STATUS_NOT_ALLOWED", message, "BR-FUND-08", { fields: { target_fund_id: message } });
    }
  }
}

export async function createDeal(input: CreateDealInput, userId: string) {
  return sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const [company] = await tx`select 1 from companies where id = ${input.company_id}`;
    if (!company) throw new AppError(422, "VALIDATION_ERROR", "기업을 다시 선택하세요", undefined, { fields: { company_id: "기업을 찾을 수 없습니다" } });
    await assertRefs(t, input);
    const [deal] = await tx<{ id: string }[]>`insert into deals ${tx({ ...input, stage: "sourcing", created_by: userId })} returning id`;
    await tx`insert into deal_stage_history (deal_id, from_stage, to_stage, changed_by) values (${deal.id}, null, 'sourcing', ${userId})`; // BR-DEAL-05
    return deal;
  });
}

async function lockDeal(tx: typeof sql, dealId: string) {
  assertUuid(dealId, "딜을");
  const [deal] = await tx<{ stage: DealStage; target_fund_id: string | null; expected_amount: number | null }[]>`
    select stage, target_fund_id, expected_amount from deals where id = ${dealId} for update
  `;
  if (!deal) throw notFound("딜을");
  return deal;
}

const closed = (stage: DealStage) =>
  new AppError(409, "DEAL_CLOSED", `${DEAL_STAGE_LABEL[stage]}된 딜은 바꿀 수 없습니다. 다시 검토하려면 새 딜을 만드세요`, "BR-DEAL-02");

export async function updateDeal(dealId: string, input: UpdateDealInput) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const deal = await lockDeal(t, dealId);
    if (DEAL_NEXT[deal.stage].length === 0) throw closed(deal.stage);
    await assertRefs(t, input);
    await tx`update deals set ${tx(input, "target_fund_id", "expected_amount", "owner_id", "sourced_date")} where id = ${dealId}`;
  });
}

export async function transitionDeal(dealId: string, input: DealTransitionInput, userId: string) {
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    const deal = await lockDeal(t, dealId);
    if (DEAL_NEXT[deal.stage].length === 0) throw closed(deal.stage);
    // BR-DEAL-01: 허용된 이동만 (단계 건너뛰기 불가)
    if (!DEAL_NEXT[deal.stage].includes(input.to_stage)) {
      throw new AppError(422, "INVALID_STAGE_TRANSITION", `${DEAL_STAGE_LABEL[deal.stage]}에서 ${DEAL_STAGE_LABEL[input.to_stage]}(으)로 바로 옮길 수 없습니다`, "BR-DEAL-01");
    }

    if (input.to_stage === "dropped") {
      // BR-DEAL-03: 드롭 사유 필수
      if (!input.drop_reason) {
        throw new AppError(422, "DROP_REASON_REQUIRED", "드롭 사유를 입력하세요", "BR-DEAL-03", { fields: { drop_reason: "드롭 사유를 입력하세요" } });
      }
      await tx`update deals set stage = 'dropped', drop_reason = ${input.drop_reason} where id = ${dealId}`;
    } else if (input.to_stage === "approved") {
      // BR-DEAL-04: 투자 예정 조합과 예상 금액 필수 (이번 요청에서 정하거나 이미 입력된 값)
      const fundId = input.target_fund_id ?? deal.target_fund_id;
      const amount = input.expected_amount ?? deal.expected_amount;
      const fields: Record<string, string> = {};
      if (!fundId) fields.target_fund_id = "투자 예정 조합을 선택하세요";
      if (!amount) fields.expected_amount = "예상 투자 금액을 입력하세요";
      if (Object.keys(fields).length > 0) throw new AppError(422, "APPROVAL_REQUIREMENTS", "투자 확정에는 투자 예정 조합과 예상 금액이 필요합니다", "BR-DEAL-04", { fields });
      const [owner] = await tx<{ owner_id: string }[]>`select owner_id from deals where id = ${dealId}`;
      await assertRefs(t, { owner_id: owner.owner_id, target_fund_id: fundId });
      await tx`update deals set stage = 'approved', target_fund_id = ${fundId}, expected_amount = ${amount} where id = ${dealId}`;
    } else if (input.to_stage === "ic") {
      // BR-DEAL-07: 투심위에 올리려면 검토 메모 1건 이상과 예상 투자 금액이 있어야 한다 (금액은 이번 요청에서 정해도 된다)
      const amount = input.expected_amount ?? deal.expected_amount;
      const [{ notes }] = await tx<{ notes: number }[]>`select count(*)::int as notes from deal_notes where deal_id = ${dealId}`;
      const fields: Record<string, string> = {};
      if (notes === 0) fields.note = "딜 메모를 1건 이상 작성하세요";
      if (!amount) fields.expected_amount = "예상 투자 금액을 입력하세요";
      if (Object.keys(fields).length > 0) {
        throw new AppError(422, "IC_REQUIREMENTS", `투심위에 올리려면 ${Object.values(fields).map((f) => f.replace(/하세요$/, "해야 합니다")).join(", ")}`, "BR-DEAL-07", {
          fields,
          missing: Object.keys(fields),
        });
      }
      await tx`update deals set stage = 'ic', expected_amount = ${amount} where id = ${dealId}`;
    } else {
      await tx`update deals set stage = ${input.to_stage} where id = ${dealId}`;
    }
    await tx`insert into deal_stage_history (deal_id, from_stage, to_stage, changed_by) values (${dealId}, ${deal.stage}, ${input.to_stage}, ${userId})`;
  });
}

// 메모는 작성 시점의 단계를 함께 남긴다. 종료된 딜에도 사후 메모를 남길 수 있다
export async function addDealNote(dealId: string, content: string, userId: string) {
  assertUuid(dealId, "딜을");
  const [deal] = await sql<{ stage: DealStage }[]>`select stage from deals where id = ${dealId}`;
  if (!deal) throw notFound("딜을");
  await sql`insert into deal_notes (deal_id, stage, content, created_by) values (${dealId}, ${deal.stage}, ${content}, ${userId})`;
}
