import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import type { DealStage, FundStatus } from "@/lib/labels";
import type { CompanyInput, CompanyListQuery } from "@/lib/schemas/deal";

// 기업 기준 정보 (검토 기업 + 투자 기업). 한 기업이 여러 딜·여러 조합의 투자로 이어질 수 있다

export type CompanyListItem = {
  id: string;
  name: string;
  registration_no: string | null;
  sector: string | null;
  ceo_name: string | null;
  deal_count: number;
  open_deal_count: number; // 진행 중인 딜 (종료 전)
  invested_amount: number; // 모든 조합의 누적 투자액
  created_at: Date;
};

export type CompanyDetail = Omit<CompanyListItem, "deal_count" | "open_deal_count" | "invested_amount"> & {
  founded_date: string | null;
  deals: { id: string; stage: DealStage; sourced_date: string; target_fund_name: string | null; expected_amount: number | null; owner_name: string; drop_reason: string | null }[];
  holdings: {
    fund_id: string;
    fund_name: string;
    fund_status: FundStatus;
    invested_amount: number;
    remaining_cost_amount: number;
    current_value_amount: number;
    holding_status: "holding" | "partially_exited" | "exited";
  }[];
};

export async function listCompanies(query: CompanyListQuery) {
  // 검색어 안의 % _ \ 는 글자 그대로 찾는다 (BR-LP-03 과 같은 방식)
  const pattern = query.q ? `%${query.q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%` : null;
  const where = sql`
    where (${pattern}::text is null or c.name ilike ${pattern} or c.registration_no ilike ${pattern} or c.sector ilike ${pattern} or c.ceo_name ilike ${pattern})
  `;
  const [{ total }] = await sql<{ total: number }[]>`select count(*)::int as total from companies c ${where}`;
  const items = await sql<CompanyListItem[]>`
    select c.id, c.name, c.registration_no, c.sector, c.ceo_name, c.created_at,
           (select count(*)::int from deals d where d.company_id = c.id) as deal_count,
           (select count(*)::int from deals d where d.company_id = c.id and d.stage not in ('approved', 'dropped')) as open_deal_count,
           coalesce((select sum(i.investment_amount) from investments i where i.company_id = c.id), 0)::bigint as invested_amount
    from companies c
    ${where}
    order by c.name
    limit ${query.page_size} offset ${(query.page - 1) * query.page_size}
  `;
  return { items, meta: { page: query.page, page_size: query.page_size, total } };
}

// 선택 목록용 (딜 등록 등)
export async function listCompanyOptions() {
  return sql<{ id: string; name: string; sector: string | null }[]>`select id, name, sector from companies order by name`;
}

export async function getCompany(companyId: string): Promise<CompanyDetail> {
  assertUuid(companyId, "기업을");
  const [company] = await sql<Omit<CompanyDetail, "deals" | "holdings">[]>`
    select id, name, registration_no, sector, ceo_name, founded_date, created_at from companies where id = ${companyId}
  `;
  if (!company) throw notFound("기업을");

  // 드롭된 뒤 다시 검토하면 새 딜이 생기므로 과거 딜 이력도 모두 보여준다 (D18)
  const deals = await sql<CompanyDetail["deals"]>`
    select d.id, d.stage, d.sourced_date, f.name as target_fund_name, d.expected_amount, coalesce(s.name, u.name) as owner_name, d.drop_reason
    from deals d
    join users u on u.id = d.owner_id
    left join staff s on s.user_id = u.id
    left join funds f on f.id = d.target_fund_id
    where d.company_id = ${companyId}
    order by d.sourced_date desc, d.created_at desc
  `;
  const holdings = await sql<CompanyDetail["holdings"]>`
    select p.fund_id, f.name as fund_name, f.status as fund_status, p.invested_amount, p.remaining_cost_amount,
           p.current_value_amount, p.holding_status
    from v_portfolio p join funds f on f.id = p.fund_id
    where p.company_id = ${companyId}
    order by p.first_investment_date
  `;
  return { ...company, deals, holdings };
}

async function assertRegistrationNoUnique(registrationNo: string | null, exceptId?: string) {
  if (!registrationNo) return;
  const [dup] = await sql<{ id: string; name: string }[]>`
    select id, name from companies where registration_no = ${registrationNo} and id <> ${exceptId ?? "00000000-0000-0000-0000-000000000000"}
  `;
  if (dup) {
    throw new AppError(409, "DUPLICATE_REGISTRATION_NO", `이미 등록된 사업자등록번호입니다 (${dup.name})`, "BR-CO-01", {
      existing_company_id: dup.id,
      fields: { registration_no: `이미 등록된 기업입니다: ${dup.name}` },
    });
  }
}

export async function createCompany(input: CompanyInput, userId: string) {
  await assertRegistrationNoUnique(input.registration_no);
  const [created] = await sql<{ id: string }[]>`insert into companies ${sql({ ...input, created_by: userId })} returning id`;
  return created;
}

export async function updateCompany(companyId: string, input: CompanyInput) {
  assertUuid(companyId, "기업을");
  await assertRegistrationNoUnique(input.registration_no, companyId);
  const [updated] = await sql`
    update companies set ${sql(input, "name", "registration_no", "sector", "ceo_name", "founded_date")}
    where id = ${companyId} returning id
  `;
  if (!updated) throw notFound("기업을");
}
