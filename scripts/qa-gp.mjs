// GP 단독 QA (docs/96_qa_scenarios.md, 항목 원본 scripts/qa-gp-catalog.mjs). 배포 GP 데모에 실제로 요청을 보낸다
//
//   npm run qa:gp              실행 (배포 데모 데이터가 바뀐다)
//   npm run qa:gp -- --reset   실행 뒤 짝 맞춘 데모 갱신(GP → LP)으로 처음 상태로 되돌린다
//   npm run qa:gp-report       결과지 (docs/qa-reports/<날짜>.md · .xlsx · .csv · .json)
//
// 시작 상태는 데모 시드 그대로여야 한다 (매일 03:00 초기화 상태). 항목마다 따로 실행해 하나가 실패해도 나머지는 계속한다
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { GP_QA } from './qa-gp-catalog.mjs';

const GP = process.env.QA_GP_URL ?? 'https://vc-erp-gp.vercel.app';
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const 억 = 100_000_000;
const stamp = Date.now().toString(36).slice(-5);
const results = [];
const S = {}; // 항목 사이에 넘기는 값

async function session(login, body) {
  const r = await fetch(GP + login, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const call = async (method, path, data) => {
    const res = await fetch(GP + '/api/v1' + path, { method, headers: { cookie, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: data === undefined ? undefined : JSON.stringify(data) });
    const text = await res.text();
    try { return { status: res.status, ...JSON.parse(text) }; } catch { return { status: res.status, raw: text.slice(0, 200) }; }
  };
  call.loginStatus = r.status;
  call.cookie = cookie;
  return call;
}
const arr = (d) => (Array.isArray(d) ? d : d && typeof d === 'object' ? Object.values(d).find(Array.isArray) ?? [] : []);
const err = (r) => `${r.status} ${r.error?.code ?? ''} ${r.error?.message ?? ''}`.trim();
const is4xx = (r) => r.status >= 400 && r.status < 500;

async function t(id, fn) {
  const label = GP_QA.find((x) => x[0] === id)?.[4] ?? id;
  let ok = false;
  let detail = '';
  try {
    [ok, detail] = await fn();
  } catch (e) {
    detail = `오류: ${e.message}`;
  }
  results.push({ id, label, ok: Boolean(ok), detail: String(detail ?? '') });
  console.log(`${ok ? '✓' : '✕'} ${id} ${label}${detail ? ` — ${detail}` : ''}`);
}

const gp = await session('/api/v1/auth/demo-login');
const funds = arr((await gp('GET', '/funds')).data);
const fundOf = (n) => funds.find((f) => f.name.startsWith(n));
const AI = fundOf('AI 퓨처'), GREEN = fundOf('그린에너지'), LOCAL = fundOf('로컬크리에이터'), BRIDGE = fundOf('브릿지');
const lps = arr((await gp('GET', '/lps')).data);
const staff = arr((await gp('GET', '/staff')).data);
const TERMS = { primary_purpose: '업력 7년 이내 기술 기반 창업기업', unit_amount: 10_000_000, primary_purpose_min_ratio: 0.5, gp_commitment_min_ratio: 0.01, management_fee_rate: 0.02, management_fee_rate_after: 0.015, carry_rate: 0.2, hurdle_rate: 0.07, quorum_ratio: 0.5 };

console.log('\n── 1. 조합 기획');
await t('G1-1', async () => {
  const r = await gp('POST', '/funds', { fund: { name: `QA 검증 ${stamp} 벤처투자조합`, fund_type: 'venture', strategy: 'early', gp_type: 'venture_capital', target_amount: 50 * 억, term_years: 8, investment_period_years: 4 }, terms: TERMS });
  S.fund = r.data?.id ?? r.data?.fund?.id;
  const d = S.fund ? (await gp('GET', `/funds/${S.fund}`)).data : null;
  return [r.status === 201 && d?.status === 'planning' && d?.terms?.version === 1, `${err(r)} · ${d?.status} · 규약 v${d?.terms?.version}`];
});
await t('G1-2', async () => {
  const r = await gp('POST', '/funds', { fund: { name: `QA 미달 ${stamp}`, fund_type: 'venture', strategy: 'early', gp_type: 'venture_capital', target_amount: 10 * 억, term_years: 8, investment_period_years: 4 }, terms: TERMS });
  return [r.status === 422, err(r)];
});
await t('G1-3', async () => {
  const lead = staff.find((s) => !s.left_date);
  const r = await gp('POST', `/funds/${S.fund}/managers`, { staff_id: lead.id, role: 'lead', start_date: today });
  const m = (await gp('GET', `/funds/${S.fund}/managers`)).data;
  return [(r.status === 201 || r.status === 200) && m?.has_lead === true, `${err(r)} · has_lead ${m?.has_lead}`];
});
await t('G1-4', async () => {
  const c = (await gp('GET', `/funds/${S.fund}/transition-check?to=fundraising`)).data;
  const r = await gp('POST', `/funds/${S.fund}/transitions`, { to_status: 'fundraising' });
  const d = (await gp('GET', `/funds/${S.fund}`)).data;
  return [c?.ready && r.status === 200 && d.status === 'fundraising', `ready ${c?.ready} · ${err(r)} · ${d.status}`];
});

console.log('\n── 2. 출자자 모집');
const LP0 = lps.find((l) => l.name === '미래 연금기금') ?? lps[0];
await t('G2-1', async () => {
  const r = await gp('POST', `/funds/${S.fund}/proposals`, { lp_id: LP0.id, proposed_amount: 30 * 억, proposed_date: today, memo: 'QA' });
  S.proposal = arr(r.data?.items).find((p) => p.lp_id === LP0.id)?.id; // 응답은 제안 목록 전체
  const s = await gp('POST', `/funds/${S.fund}/proposals/${S.proposal}/send`, {});
  const item = arr((await gp('GET', `/funds/${S.fund}/proposals`)).data?.items).find((p) => p.id === S.proposal);
  return [r.status === 201 && s.status === 200 && item?.send_count === 1, `${err(r)} / 발송 ${s.status} · ${item?.send_count}회`];
});
await t('G2-2', async () => {
  const r = await gp('POST', `/funds/${S.fund}/proposals`, { lp_id: LP0.id, proposed_amount: 10 * 억, proposed_date: today, memo: null });
  return [r.status === 409 && r.error?.code === 'DUPLICATE_PROPOSAL', err(r)];
});
await t('G2-3', async () => {
  const r = await gp('POST', `/funds/${S.fund}/proposals/${S.proposal}/transitions`, { to_status: 'committed', loc_amount: 30 * 억, decided_date: today });
  const sum = (await gp('GET', `/funds/${S.fund}/proposals`)).data?.summary;
  return [r.status === 200 && Math.abs((sum?.achievement_ratio ?? 0) - 0.6) < 1e-9, `${err(r)} · 달성률 ${(sum?.achievement_ratio * 100).toFixed(1)}%`];
});
await t('G2-4', async () => {
  const r = await gp('POST', `/funds/${S.fund}/transitions`, { to_status: 'formed' });
  return [is4xx(r), err(r)];
});

console.log('\n── 3. 결성 (AI 퓨처 · 그린에너지)');
await t('G3-1', async () => {
  const c = (await gp('GET', `/funds/${AI.id}/transition-check?to=formed`)).data;
  const met = Object.fromEntries((c?.conditions ?? []).map((x) => [x.rule, x.met]));
  return [!c.ready && met['BR-MEM-01'] && met['BR-MGR-03'] && met['BR-FUND-02'] === false && met['D19'] === false, (c?.conditions ?? []).map((x) => `${x.met ? '✓' : '✗'}${x.label.slice(0, 10)}`).join(' ')];
});
const callBody = { total_call_amount: 30 * 억, call_all_unfunded: false, call_date: today, due_date: addDays(today, 14), purpose: 'QA 출자' };
// AI 퓨처에는 데모 시드가 만든 최초 납입 초안이 있다 (결성 전에는 최초 납입 1회만 — 새로 만들면 막힌다)
await t('G3-2', async () => {
  const draft = arr((await gp('GET', `/funds/${AI.id}/capital-calls`)).data?.calls).find((c) => c.is_initial && c.status === 'draft');
  S.initialCall = draft;
  const d = (await gp('GET', `/funds/${AI.id}/capital-calls/${draft.id}`)).data;
  const items = arr(d?.items);
  const sum = items.reduce((s, i) => s + Number(i.call_amount ?? 0), 0);
  return [items.length > 0 && sum === Number(draft.total_call_amount), `최초 납입 초안 ${draft.total_call_amount / 억}억 · 조합원 ${items.length}명 · 배분 합계 ${sum / 억}억`];
});
await t('G3-3', async () => {
  const again = await gp('POST', `/funds/${AI.id}/capital-calls`, { ...callBody, purpose: 'QA 두 번째 최초 납입' });
  const i = await gp('POST', `/funds/${AI.id}/capital-calls/${S.initialCall.id}/issue`, {});
  return [is4xx(again) && i.status === 200 && i.data?.status === 'issued', `결성 전 두 번째 요청 ${again.status} · 초안 발송 ${err(i)} · ${i.data?.status}`];
});
async function holdAllFor(fundId, body, beforeHold) {
  const m = await gp('POST', `/funds/${fundId}/meetings`, body);
  const mid = m.data?.id;
  if (!mid) return { m, cv: m, h: m, after: null, mid };
  const cv = await gp('POST', `/funds/${fundId}/meetings/${mid}/convene`, {});
  if (beforeHold) await beforeHold(mid);
  const d = (await gp('GET', `/funds/${fundId}/meetings/${mid}`)).data;
  for (const a of d.agendas) for (const v of d.voters) await gp('PUT', `/funds/${fundId}/meetings/${mid}/agendas/${a.id}/votes/${v.member_id}`, { choice: 'for' });
  const h = await gp('POST', `/funds/${fundId}/meetings/${mid}/hold`, {});
  const after = (await gp('GET', `/funds/${fundId}/meetings/${mid}`)).data;
  return { m, cv, h, after, mid };
}
// 데모 시드가 10/8 결성총회를 이미 소집해 두었다 → 총회일 전 개최는 막히는지 보고, 취소한 뒤 오늘 날짜로 다시 연다
await t('G3-4', async () => {
  const existing = arr((await gp('GET', `/funds/${AI.id}/meetings`)).data?.meetings).find((x) => x.meeting_type === 'formation' && x.status === 'scheduled');
  const early = existing && existing.meeting_date > today ? await gp('POST', `/funds/${AI.id}/meetings/${existing.id}/hold`, {}) : null;
  const cancel = existing ? await gp('POST', `/funds/${AI.id}/meetings/${existing.id}/cancel`, {}) : { status: 200 };
  const { m, cv, h, after } = await holdAllFor(AI.id, { meeting_type: 'formation', meeting_date: today, location: '본사 대회의실', agendas: [] });
  const formation = after?.agendas?.find((a) => a.agenda_type === 'formation');
  const earlyOk = !early || is4xx(early);
  return [earlyOk && cancel.status === 200 && m.status === 201 && cv.status === 200 && h.status === 200 && formation?.result === 'passed', `기존 ${existing?.meeting_date} 총회 · 총회일 전 개최 ${early ? early.status : '-'} · 취소 ${cancel.status} · 새 총회 ${m.status} / 소집 ${cv.status} / 개최 ${h.status} · 결성 안건 ${formation?.result}`];
});
await t('G3-5', async () => {
  const r = await gp('POST', `/funds/${AI.id}/transitions`, { to_status: 'formed' });
  const d = (await gp('GET', `/funds/${AI.id}`)).data;
  return [r.status === 200 && d.status === 'formed', `${err(r)} · ${d.status}`];
});
await t('G3-6', async () => {
  const g = (await gp('GET', `/funds/${GREEN.id}`)).data;
  const from = g.formation_date ?? addDays(today, -10);
  const reg = await gp('PUT', `/funds/${GREEN.id}/registration`, { registration_applied_date: from, registration_completed_date: today });
  const r = await gp('POST', `/funds/${GREEN.id}/transitions`, { to_status: 'operating' });
  const d = (await gp('GET', `/funds/${GREEN.id}`)).data;
  return [reg.status === 200 && r.status === 200 && d.status === 'operating', `${err(reg)} / ${err(r)} · ${d.status}`];
});

console.log('\n── 4. 운용 (로컬크리에이터)');
await t('G4-1', async () => {
  const r = await gp('POST', `/funds/${LOCAL.id}/capital-calls/preview`, { ...callBody, total_call_amount: 10_000 * 억, purpose: 'QA 초과' });
  return [is4xx(r), err(r)];
});
await t('G4-2', async () => {
  const before = arr((await gp('GET', `/funds/${LOCAL.id}/ledger?entry_type=contribution`)).data).reduce((s, e) => s + Number(e.amount), 0);
  const c = await gp('POST', `/funds/${LOCAL.id}/capital-calls`, { ...callBody, total_call_amount: 10 * 억, purpose: 'QA 출자 (투자 재원)' });
  const i = await gp('POST', `/funds/${LOCAL.id}/capital-calls/${c.data?.id}/issue`, {});
  const item = (i.data?.items ?? [])[0];
  const p = await gp('POST', `/funds/${LOCAL.id}/capital-calls/${c.data?.id}/items/${item.id}/payments`, { paid_amount: Number(item.call_amount), paid_date: today, memo: 'QA' });
  const after = arr((await gp('GET', `/funds/${LOCAL.id}/ledger?entry_type=contribution`)).data).reduce((s, e) => s + Number(e.amount), 0);
  return [p.status === 201 && after - before === Number(item.call_amount), `발송 ${i.status} · 납입 ${err(p)} · 원장 +${(after - before) / 억}억`];
});
await t('G4-3', async () => {
  const c = await gp('POST', '/companies', { name: `QA 테크 ${stamp}`, registration_no: null, sector: 'AI', ceo_name: '홍길동', founded_date: '2023-03-01' });
  S.company = c.data?.id;
  const me = (await gp('GET', '/auth/me')).data;
  const d = await gp('POST', '/deals', { company_id: S.company, target_fund_id: LOCAL.id, expected_amount: 5 * 억, owner_id: me.id, sourced_date: addDays(today, -30) });
  S.deal = d.data?.id;
  const move = (st) => gp('POST', `/deals/${S.deal}/transitions`, { to_stage: st, target_fund_id: LOCAL.id, expected_amount: 5 * 억 });
  await move('reviewing');
  const noNote = await move('ic'); // BR-DEAL-07: 투심위에는 검토 메모 1건 이상이 있어야 올린다
  const note = await gp('POST', `/deals/${S.deal}/notes`, { content: 'QA 검토 메모: 매출 성장률 · 팀 구성 확인' });
  await move('ic');
  const last = await move('approved');
  const det = (await gp('GET', `/deals/${S.deal}`)).data;
  const hist = arr(det?.history ?? det?.stage_history);
  return [c.status === 201 && d.status === 201 && noNote.status === 422 && note.status === 201 && last.status === 200 && det?.stage === 'approved' && hist.length >= 4, `기업 ${c.status} · 딜 ${d.status} · 메모 없이 투심 ${noNote.status} ${noNote.error?.code ?? ''} · 메모 ${note.status} · 승인 ${last.status} · ${det?.stage} · 이력 ${hist.length}`];
});
const inv = (amount) => ({ is_follow_on: false, deal_id: S.deal, company_id: null, investment_date: today, investment_amount: amount, security_type: 'rcps', shares: null, price_per_share: null, is_primary_purpose: true });
await t('G4-4', async () => {
  const sum = (await gp('GET', `/funds/${LOCAL.id}/investments`)).data.summary;
  S.investable = Number(sum.investable_amount);
  const r = await gp('POST', `/funds/${LOCAL.id}/investments`, inv(Math.ceil(S.investable / 억 + 1) * 억));
  return [r.status === 422, `${err(r)} · 투자 가능 ${(S.investable / 억).toFixed(2)}억`];
});
await t('G4-5', async () => {
  const r = await gp('POST', `/funds/${LOCAL.id}/investments`, inv(5 * 억));
  const sum = (await gp('GET', `/funds/${LOCAL.id}/investments`)).data.summary;
  const pf = arr((await gp('GET', `/funds/${LOCAL.id}/portfolio`)).data?.companies ?? (await gp('GET', `/funds/${LOCAL.id}/portfolio`)).data);
  const has = pf.some((x) => x.company_id === S.company || x.id === S.company);
  return [r.status === 201 && has && Math.round(S.investable - Number(sum.investable_amount)) === 5 * 억, `${err(r)} · 포트폴리오 ${has} · 잔액 −${((S.investable - Number(sum.investable_amount)) / 억).toFixed(2)}억`];
});
await t('G4-6', async () => {
  const r = await gp('POST', `/funds/${LOCAL.id}/valuations`, { company_id: S.company, valuation_date: today, fair_value_amount: 7 * 억, method: 'QA 최근 투자 단가' });
  const pfData = (await gp('GET', `/funds/${LOCAL.id}/portfolio`)).data;
  const row = arr(pfData?.companies ?? pfData).find((x) => x.company_id === S.company || x.id === S.company);
  const v = Number(row?.fair_value_amount ?? row?.current_value_amount ?? row?.latest_fair_value ?? NaN);
  return [r.status === 201 && v === 7 * 억, `${err(r)} · 평가액 ${v / 억}억`];
});
await t('G4-7', async () => {
  const r = await gp('POST', `/funds/${LOCAL.id}/management-fees/preview`, { year: 2026, quarter: 3 });
  const seg = r.data?.segments?.[0];
  const expect = Math.floor((Number(seg.basis_amount) * Number(seg.fee_rate) * seg.days) / 365);
  return [r.status === 200 && Math.abs(Number(seg.fee_amount) - expect) <= 1, `${(seg.basis_amount / 억).toFixed(1)}억 × ${seg.fee_rate * 100}% × ${seg.days}일 ÷ 365 = ${seg.fee_amount}원 (계산 ${expect})`];
});
await t('G4-8', async () => {
  const r = await gp('POST', `/funds/${LOCAL.id}/management-fees`, { year: 2026, quarter: 3, charged_date: today });
  return [is4xx(r), err(r)];
});

console.log('\n── 5. 보고 · 총회 · 규약 (로컬크리에이터)');
await t('G5-1', async () => {
  const c = await gp('POST', `/funds/${LOCAL.id}/reports`, { period_type: 'quarterly', year: 2026, period_no: 3 });
  const p = await gp('POST', `/funds/${LOCAL.id}/reports/${c.data?.id}/publish`, {});
  const d = (await gp('GET', `/funds/${LOCAL.id}/reports/${c.data?.id}`)).data;
  return [c.status === 201 && p.status === 200 && d?.status === 'published', `${err(c)} / ${err(p)} · ${d?.status}`];
});
await t('G5-2', async () => {
  const { m, h, after } = await holdAllFor(LOCAL.id, { meeting_type: 'extraordinary', meeting_date: today, location: '본사 대회의실', agendas: [{ agenda_type: 'terms_amendment', title: 'QA 규약 변경: 주목적 투자 분야 문구 정정', description: 'QA' }] }, async (mid) => {
    S.lateAgenda = await gp('POST', `/funds/${LOCAL.id}/meetings/${mid}/agendas`, { agenda_type: 'other', title: 'QA 소집 뒤 안건', description: null });
  });
  const a = after?.agendas?.find((x) => x.agenda_type === 'terms_amendment');
  S.termsAgenda = a?.id;
  return [m.status === 201 && h.status === 200 && a?.result === 'passed', `${err(m)} / 개최 ${h.status} · 안건 ${a?.result}`];
});
await t('G5-3', async () => [S.lateAgenda && is4xx(S.lateAgenda), S.lateAgenda ? err(S.lateAgenda) : '실행 안 됨']);
await t('G5-4', async () => {
  const before = arr((await gp('GET', `/funds/${LOCAL.id}/terms`)).data);
  const cur = (await gp('GET', `/funds/${LOCAL.id}`)).data.terms;
  const body = { ...Object.fromEntries(Object.keys(TERMS).map((k) => [k, cur[k]])), primary_purpose: `${cur.primary_purpose} (QA 정정)`, agenda_id: S.termsAgenda, effective_date: today };
  const r = await gp('POST', `/funds/${LOCAL.id}/terms`, body);
  const after = arr((await gp('GET', `/funds/${LOCAL.id}/terms`)).data);
  const eff = (await gp('GET', `/funds/${LOCAL.id}/terms/effective?date=${today}`)).data;
  return [r.status === 201 && after.length === before.length + 1 && String(eff?.primary_purpose ?? eff?.terms?.primary_purpose).includes('QA 정정'), `${err(r)} · 버전 ${before.length} → ${after.length}`];
});

console.log('\n── 6. 재무 · 회계');
const cashOf = async (id) => Number((await gp('GET', `/funds/${id}/finance`)).data?.summary?.cash_amount ?? (await gp('GET', `/funds/${id}/finance`)).data?.cash_amount);
await t('G6-1', async () => {
  const before = await cashOf(LOCAL.id);
  const r = await gp('POST', `/funds/${LOCAL.id}/expenses`, { expense_type: 'audit', description: 'QA 회계감사 보수', payee: '새길회계법인', amount: 10_000_000, paid_date: today });
  const after = await cashOf(LOCAL.id);
  return [r.status === 201 && before - after === 10_000_000, `${err(r)} · 현금 −${(before - after).toLocaleString()}원`];
});
await t('G6-2', async () => {
  const tb = arr((await gp('GET', `/funds/${LOCAL.id}/accounting/trial-balance`)).data);
  const dr = tb.reduce((s, x) => s + Number(x.debit ?? 0), 0), cr = tb.reduce((s, x) => s + Number(x.credit ?? 0), 0);
  return [tb.length > 0 && dr === cr, `차변 ${(dr / 억).toFixed(2)}억 · 대변 ${(cr / 억).toFixed(2)}억`];
});
await t('G6-3', async () => {
  // 자본에는 아직 결산하지 않은 당기 이익(unclosed_income)이 들어 있다
  const bs = (await gp('GET', `/funds/${LOCAL.id}/accounting/statements`)).data.balance_sheet;
  const a = Number(bs.total_assets), l = Number(bs.total_liabilities), e = Number(bs.total_equity);
  return [bs.balanced === true && a === l + e, `자산 ${(a / 억).toFixed(2)}억 = 부채 ${(l / 억).toFixed(2)}억 + 자본 ${(e / 억).toFixed(2)}억 (미결산 이익 ${(Number(bs.unclosed_income) / 억).toFixed(2)}억 포함)`];
});
await t('G6-4', async () => {
  const r = await gp('POST', `/funds/${LOCAL.id}/accounting/journal`, { entry_date: today, description: 'QA 불균형 분개', lines: [{ account: '1010', debit: 1000, credit: 0 }, { account: '2010', debit: 0, credit: 500 }] });
  return [is4xx(r), err(r)];
});
await t('G6-5', async () => {
  let closings = arr((await gp('GET', `/funds/${BRIDGE.id}/accounting/closings`)).data).filter((c) => !c.reopened_at);
  const year = Math.max(...closings.map((c) => Number(c.fiscal_year)));
  const r = await gp('POST', `/funds/${BRIDGE.id}/expenses`, { expense_type: 'other', description: 'QA 결산된 기간 비용', payee: null, amount: 1_000_000, paid_date: `${year}-12-31` });
  return [Number.isFinite(year) && is4xx(r), `${year}년 결산됨 · ${err(r)}`];
});

console.log('\n── 7. 회수 · 분배 · 청산 (브릿지 2호)');
await t('G7-1', async () => {
  const ex = (await gp('GET', `/funds/${BRIDGE.id}/exits`)).data;
  const h = arr(ex?.holdings)[0];
  const r = await gp('POST', `/funds/${BRIDGE.id}/exits`, { company_id: h.company_id, exit_type: 'trade_sale', exit_date: today, proceeds_amount: 8 * 억, full_exit: true, cost_basis_amount: null, memo: 'QA 잔여 지분 매각' });
  const after = (await gp('GET', `/funds/${BRIDGE.id}/exits`)).data;
  return [r.status === 201 && arr(after?.holdings).length === 0, `${err(r)} · ${h.company_name} 원가 ${h.remaining_cost_amount / 억}억 → 8억 · 남은 보유 ${arr(after?.holdings).length}`];
});
await t('G7-2', async () => {
  S.cash = await cashOf(BRIDGE.id);
  S.distBody = { distribution_date: today, distributable_amount: S.cash, is_final: true, memo: 'QA 청산 잔여 재산 분배' };
  const r = await gp('POST', `/funds/${BRIDGE.id}/distributions/preview`, S.distBody);
  const parts = arr(r.data?.tiers);
  const total = parts.reduce((s, x) => s + Number(x.this_amount ?? 0), 0);
  const names = parts.filter((x) => Number(x.this_amount) > 0).map((x) => `${x.component} ${(Number(x.this_amount) / 억).toFixed(2)}억`).join(' + ');
  return [r.status === 200 && parts.length === 4 && Math.abs(total - S.cash) < 1, `${names} = ${(total / 억).toFixed(2)}억 (분배 가능 ${(S.cash / 억).toFixed(2)}억)`];
});
await t('G7-3', async () => {
  const c = await gp('POST', `/funds/${BRIDGE.id}/distributions`, S.distBody);
  const cf = await gp('POST', `/funds/${BRIDGE.id}/distributions/${c.data?.id}/confirm`, {});
  const p = await gp('POST', `/funds/${BRIDGE.id}/distributions/${c.data?.id}/pay`, {});
  const cash = await cashOf(BRIDGE.id);
  return [c.status === 201 && cf.status === 200 && p.status === 200 && cash === 0, `${err(c)} / ${err(cf)} / ${err(p)} · 현금 ${cash}`];
});
await t('G7-4', async () => {
  const c = (await gp('GET', `/funds/${BRIDGE.id}/transition-check?to=liquidated`)).data;
  const r = await gp('POST', `/funds/${BRIDGE.id}/transitions`, { to_status: 'liquidated' });
  const d = (await gp('GET', `/funds/${BRIDGE.id}`)).data;
  return [c?.ready && r.status === 200 && d.status === 'liquidated', `조건 ${(c?.conditions ?? []).map((x) => (x.met ? '✓' : '✗')).join('')} · ${err(r)} · ${d.status}`];
});
await t('G7-5', async () => {
  const r = await gp('POST', `/funds/${BRIDGE.id}/expenses`, { expense_type: 'other', description: 'QA 청산 후 비용', payee: null, amount: 1_000_000, paid_date: today });
  return [is4xx(r), err(r)];
});

console.log('\n── 8. 공통');
await t('G8-1', async () => {
  const s = await gp('POST', '/staff', { employee_no: `QA-${stamp}`, name: 'QA 조회 계정', position: '인턴', department: null, email: `qa-${stamp}@vc-erp.dev`, phone: null, hired_date: today, create_account: true });
  const id = s.data?.staff?.id;
  const pw = s.data?.account?.temp_password; // 임시 비밀번호는 이 응답에서만 (BR-STF-03)
  const role = await gp('PUT', `/staff/${id}/account/role`, { role: 'viewer' });
  const viewer = await session('/api/v1/auth/login', { email: `qa-${stamp}@vc-erp.dev`, password: pw });
  const w = await viewer('POST', '/funds', { fund: { name: `QA 조회 ${stamp}`, fund_type: 'venture', strategy: 'early', gp_type: 'venture_capital', target_amount: 50 * 억, term_years: 8, investment_period_years: 4 }, terms: TERMS });
  S.viewerDenied = w.status === 403;
  return [s.status === 201 && role.status === 200 && viewer.loginStatus === 200 && w.status === 403, `계정 ${s.status} · 권한 ${role.status} · 로그인 ${viewer.loginStatus} · 쓰기 ${err(w)}`];
});
await t('G8-2', async () => {
  const logs = arr((await gp('GET', '/audit-logs?result=denied')).data);
  const hit = logs.find((l) => String(l.path).endsWith('/api/v1/funds') && Number(l.status) === 403);
  return [Boolean(hit), hit ? `${hit.user_name ?? ''} ${hit.method} ${hit.path} ${hit.status}` : `거부 기록 ${logs.length}건 중 없음`];
});
await t('G8-3', async () => {
  const a = await fetch(`${GP}/api/lp/v1/events`);
  const b = await fetch(`${GP}/api/lp/v1/events`, { headers: { Authorization: 'Bearer qa-wrong-key' } });
  return [a.status === 401 && b.status === 401, `키 없음 ${a.status} · 틀린 키 ${b.status}`];
});
await t('G8-4', async () => {
  const d = (await gp('GET', '/integration-events?status=failed')).data;
  return [Number(d?.counts?.failed ?? 0) === 0, `실패 ${d?.counts?.failed} · 대기 ${d?.counts?.pending} · 전송 ${d?.counts?.delivered}`];
});
await t('G8-5', async () => {
  const tabs = ['', '/profile', '/proposals', '/members', '/capital-calls', '/investments', '/portfolio', '/exits', '/distributions', '/finance', '/management-fees', '/carried-interest', '/accounting?view=statements', '/accounting?view=trial', '/accounting?view=closing', '/meetings', '/terms', '/reports', '/notices'];
  const pages = ['/', '/funds', '/calls', '/deals', '/companies', '/lps', '/staff', '/integrations', '/audit-logs', ...tabs.map((x) => `/funds/${LOCAL.id}${x}`)];
  const codes = await Promise.all(pages.map((p) => fetch(GP + p, { headers: { cookie: gp.cookie }, redirect: 'manual' }).then((r) => r.status)));
  const bad = pages.filter((_, i) => codes[i] !== 200);
  return [bad.length === 0, bad.length ? `실패 ${bad.join(', ')}` : `메뉴 9 + 조합 탭 ${tabs.length} = ${pages.length}개 모두 200`];
});

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed === results.length ? '✔' : '✖'} ${passed}/${results.length} 통과`);
for (const r of results.filter((x) => !x.ok)) console.log(`  ✕ ${r.id} ${r.label} — ${r.detail}`);
const commitOf = (cwd) => { try { return execSync('git rev-parse --short HEAD', { cwd, encoding: 'utf8' }).trim(); } catch { return null; } };
fs.writeFileSync(new URL('../.qa-result.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), gp: commitOf(new URL('../', import.meta.url)), lp: commitOf(new URL('../../lp/', import.meta.url)), passed, total: results.length, results }, null, 2));

if (process.argv.includes('--reset')) {
  console.log('\n데모 되돌리기: GP → LP 짝 맞춘 갱신');
  const gpOut = execSync('npm run db:demo-refresh -- --prune-backups', { encoding: 'utf8' });
  if (!gpOut.includes('✔ 데모 DB를 새로 고쳤습니다')) throw new Error('GP 데모 갱신 실패 — LP 갱신을 하지 않습니다');
  // node --env-file 은 이미 있는 환경 변수를 덮어쓰지 않는다. GP 값을 빼고 넘겨야 LP 갱신이 LP 프로젝트를 고친다
  const gpKeys = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.slice(0, l.indexOf('=')));
  const lpEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !gpKeys.includes(k)));
  execSync('npm run db:demo-refresh -- --prune-backups', { cwd: new URL('../../lp/', import.meta.url), env: lpEnv, encoding: 'utf8' });
  console.log('✔ 배포 데모를 처음 상태로 되돌렸습니다');
}
process.exitCode = passed === results.length ? 0 : 1;
