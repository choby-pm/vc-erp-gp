-- =============================================================================
-- 004_rename_fund_to_johap_comments.sql — 한국어 표준어 "펀드" → "조합" (D30)
-- =============================================================================
-- 화면·문서의 한국어 표준어를 "조합"으로 통일한다.
-- 테이블·컬럼의 영어 이름(funds, fund_id 등)은 업계 관례대로 그대로 둔다.
-- 이 파일은 DB에 붙어 있는 설명(comment)만 바꾼다. 데이터와 구조는 바뀌지 않는다.
--
-- 참고: 이미 실행된 001~003 파일 안의 주석은 실행 기록이므로 고치지 않는다.
-- =============================================================================

comment on table funds          is '조합 (투자조합, 영어 코드명 fund)';
comment on table lp_proposals   is '출자 제안 (조합 × LP)';
comment on table capital_calls  is '출자 요청 (조합 단위)';
comment on table distributions  is '분배 (조합 단위)';
comment on view  v_portfolio    is '조합별 포트폴리오 (투자·회수·평가)';
comment on view  v_fund_summary is '조합 대시보드 요약';
