import { sql } from "@/lib/db";
import { AppError, assertUuid, notFound } from "@/lib/api/errors";
import type { FundStatus, LpType } from "@/lib/labels";
import type { LpInput, LpListQuery } from "@/lib/schemas/lp";

// 출자자(LP) 기준 정보 서비스.
// 출자자는 조합에 종속되지 않는다. 한 출자자가 여러 조합에 참여해도 한 행이다 (03 DB 설계 4-1)

export type LpListItem = {
  id: string;
  name: string;
  lp_type: LpType;
  registration_no: string | null;
  contact_name: string | null;
  proposal_count: number; // 출자 제안을 받은 조합 수
  member_fund_count: number; // 조합원으로 참여 중인 조합 수
  total_commitment_amount: number; // 전체 조합 약정액 합계
  created_at: Date;
};

export type LpDetail = {
  id: string;
  name: string;
  lp_type: LpType;
  registration_no: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  memo: string | null;
  created_at: Date;
  // 조합별 참여 현황: 제안 단계부터 조합원까지
  participations: {
    fund_id: string;
    fund_name: string;
    fund_status: FundStatus;
    proposal_status: string | null;
    loc_amount: number | null;
    commitment_amount: number | null;
    paid_amount: number | null;
  }[];
};

export async function listLps(query: LpListQuery) {
  // 검색어 안의 % _ \ 는 SQL 와일드카드가 아니라 글자 그대로 찾는다
  const pattern = query.q ? `%${query.q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%` : null;
  // 검색어는 이름·사업자등록번호·담당자명에서 찾는다
  const where = sql`
    where (${pattern}::text is null
           or lp.name ilike ${pattern} or lp.registration_no ilike ${pattern} or lp.contact_name ilike ${pattern})
      and (${query.lp_type ?? null}::text is null or lp.lp_type = ${query.lp_type ?? null})
  `;

  const [{ total }] = await sql<{ total: number }[]>`select count(*)::int as total from limited_partners lp ${where}`;

  const items = await sql<LpListItem[]>`
    select lp.id, lp.name, lp.lp_type, lp.registration_no, lp.contact_name, lp.created_at,
           (select count(*)::int from lp_proposals p where p.lp_id = lp.id)      as proposal_count,
           (select count(*)::int from fund_members m where m.lp_id = lp.id)      as member_fund_count,
           coalesce((select sum(b.commitment_amount) from v_member_balances b where b.lp_id = lp.id), 0)::bigint
                                                                                  as total_commitment_amount
    from limited_partners lp
    ${where}
    order by lp.name
    limit ${query.page_size} offset ${(query.page - 1) * query.page_size}
  `;

  return { items, meta: { page: query.page, page_size: query.page_size, total } };
}

export async function getLp(lpId: string): Promise<LpDetail> {
  assertUuid(lpId, "출자자를");

  const [lp] = await sql<Omit<LpDetail, "participations">[]>`
    select id, name, lp_type, registration_no, contact_name, contact_email, contact_phone, memo, created_at
    from limited_partners where id = ${lpId}
  `;
  if (!lp) throw notFound("출자자를");

  // 출자 제안(모집)과 조합원(결성 이후)을 조합 기준으로 합쳐서 보여준다
  const participations = await sql<LpDetail["participations"]>`
    select f.id as fund_id, f.name as fund_name, f.status as fund_status,
           p.status as proposal_status, p.loc_amount,
           b.commitment_amount, b.paid_amount
    from funds f
    left join lp_proposals p     on p.fund_id = f.id and p.lp_id = ${lpId}
    left join v_member_balances b on b.fund_id = f.id and b.lp_id = ${lpId}
    where p.id is not null or b.member_id is not null
    order by f.created_at desc
  `;

  return { ...lp, participations };
}

// 같은 사업자등록번호가 이미 있으면 어느 출자자인지 알려준다 (BR-LP-01)
async function assertRegistrationNoUnique(registrationNo: string | null, exceptId?: string) {
  if (!registrationNo) return;
  const [dup] = await sql<{ id: string; name: string }[]>`
    select id, name from limited_partners
    where registration_no = ${registrationNo} and id <> ${exceptId ?? "00000000-0000-0000-0000-000000000000"}
  `;
  if (dup) {
    throw new AppError(409, "DUPLICATE_REGISTRATION_NO", `이미 등록된 사업자등록번호입니다 (${dup.name})`, "BR-LP-01", {
      existing_lp_id: dup.id,
      fields: { registration_no: `이미 등록된 출자자입니다: ${dup.name}` },
    });
  }
}

const LP_COLUMNS = ["name", "lp_type", "registration_no", "contact_name", "contact_email", "contact_phone", "memo"] as const;

export async function createLp(input: LpInput, userId: string) {
  await assertRegistrationNoUnique(input.registration_no);
  const [created] = await sql<{ id: string }[]>`
    insert into limited_partners ${sql({ ...input, created_by: userId })}
    returning id
  `;
  return created;
}

export async function updateLp(lpId: string, input: LpInput) {
  assertUuid(lpId, "출자자를");
  await assertRegistrationNoUnique(input.registration_no, lpId);
  const [updated] = await sql<{ id: string }[]>`
    update limited_partners set ${sql(input, ...LP_COLUMNS)}
    where id = ${lpId}
    returning id
  `;
  if (!updated) throw notFound("출자자를");
}
