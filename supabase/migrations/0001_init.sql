-- =========================================================
-- What2Buy 초기 스키마
--
-- Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 실행하세요.
-- (PostgREST로는 테이블 생성이 불가능해 DDL만 수동 실행이 필요합니다)
--
-- 접근은 전부 서버(/api/*)에서 service_role 키로만 이뤄집니다.
-- 따라서 모든 테이블에 RLS를 켜고 정책은 만들지 않습니다.
-- (service_role은 RLS를 우회하므로 서버는 정상 동작하고, 브라우저에서
--  anon 키로 직접 접근하면 아무것도 읽거나 쓸 수 없습니다)
-- =========================================================

-- ---------------------------------------------------------
-- 1. 선물 키워드 사전
--    코드(lib/gift-keywords.js)에 있던 사전을 옮겨온다.
--    태그를 고칠 때 재배포가 필요 없어진다.
-- ---------------------------------------------------------
create table if not exists public.gift_keywords (
  id            bigint generated always as identity primary key,
  keyword       text        not null unique,
  category_id   text        not null,   -- 네이버 쇼핑 카테고리 ID (예: 50000001)
  category_name text        not null,
  budgets       text[]      not null default '{}',   -- 예: {3~5만원대,5~10만원대}
  situations    text[]      not null default '{}',   -- 예: {생일,1주년}
  is_active     boolean     not null default true,   -- 끄면 추천 후보에서 제외
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists gift_keywords_active_idx
  on public.gift_keywords (is_active);

-- ---------------------------------------------------------
-- 2. 추천 조회 이력
--    어떤 조건 조합이 많이 조회되는지, 어떤 조합이 후보 부족으로
--    조건 완화에 걸리는지를 본다. (완화가 잦은 조합 = 사전을 보강할 지점)
-- ---------------------------------------------------------
create table if not exists public.recommendation_events (
  id              bigint generated always as identity primary key,
  session_id      uuid        not null,   -- 브라우저 localStorage의 익명 식별자
  age             text,
  gender          text,
  relation        text,
  situation       text,
  budget          text,
  relaxed         text,                   -- null | 'budget' | 'all'
  result_keywords text[]      not null default '{}',
  candidate_count int,
  duration_ms     int,
  created_at      timestamptz not null default now()
);

create index if not exists recommendation_events_created_idx
  on public.recommendation_events (created_at desc);

create index if not exists recommendation_events_combo_idx
  on public.recommendation_events (age, gender, situation, budget);

create index if not exists recommendation_events_session_idx
  on public.recommendation_events (session_id);

-- ---------------------------------------------------------
-- 3. 클릭 이벤트
--    추천된 카드를 실제로 뒤집었는지, 쇼핑 링크까지 갔는지.
--    노출 대비 클릭 전환율을 키워드별로 볼 수 있다.
-- ---------------------------------------------------------
create table if not exists public.click_events (
  id                bigint generated always as identity primary key,
  session_id        uuid        not null,
  recommendation_id bigint      references public.recommendation_events (id) on delete set null,
  keyword           text        not null,
  action            text        not null check (action in ('flip', 'shopping_link')),
  position          int,                  -- 카드 순위 1~3
  created_at        timestamptz not null default now()
);

create index if not exists click_events_keyword_idx
  on public.click_events (keyword);

create index if not exists click_events_recommendation_idx
  on public.click_events (recommendation_id);

create index if not exists click_events_created_idx
  on public.click_events (created_at desc);

-- ---------------------------------------------------------
-- RLS : 켜두되 정책은 두지 않는다 (서버의 service_role만 통과)
-- ---------------------------------------------------------
alter table public.gift_keywords         enable row level security;
alter table public.recommendation_events enable row level security;
alter table public.click_events          enable row level security;

-- ---------------------------------------------------------
-- 분석용 뷰
-- ---------------------------------------------------------

-- 키워드별 성과 : 몇 번 노출됐고, 몇 번 뒤집혔고, 몇 번 쇼핑으로 나갔는지
create or replace view public.keyword_performance as
select
  k.keyword,
  k.category_name,
  count(distinct r.id)                                                as impressions,
  count(distinct c.id) filter (where c.action = 'flip')               as flips,
  count(distinct c.id) filter (where c.action = 'shopping_link')      as shopping_clicks,
  round(
    100.0 * count(distinct c.id) filter (where c.action = 'shopping_link')
    / nullif(count(distinct r.id), 0)
  , 1)                                                                as click_rate_pct
from public.gift_keywords k
left join public.recommendation_events r on k.keyword = any (r.result_keywords)
left join public.click_events c          on c.keyword = k.keyword
group by k.keyword, k.category_name;

-- 조건 조합별 수요 : 조회가 많은 조합과, 후보 부족으로 조건이 완화된 비율
create or replace view public.combo_demand as
select
  age,
  gender,
  situation,
  budget,
  count(*)                                             as searches,
  count(*) filter (where relaxed is not null)          as relaxed_count,
  round(100.0 * count(*) filter (where relaxed is not null) / count(*), 1)
                                                       as relaxed_pct
from public.recommendation_events
group by age, gender, situation, budget
order by searches desc;
