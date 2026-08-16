-- =========================================================
-- What2Buy — 추천 결과 만족도(별점)
--
-- Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 실행하세요.
-- 0001_init.sql 을 먼저 실행했어야 합니다 (recommendation_events 를 참조합니다).
--
-- [왜 click_events 에 안 넣는가]
-- click_events.action 은 'flip' | 'shopping_link' 만 허용하는 CHECK 가 걸려 있고,
-- 별점은 값(1~5)을 함께 저장해야 해서 컬럼 구조가 다르다.
--
-- [한 번의 추천에 한 번만]
-- 별을 다시 눌러 점수를 바꿀 수 있어야 하므로, 추천 1건당 1행으로 두고
-- upsert 로 덮어쓴다. 같은 추천에 여러 행이 쌓이면 평균이 왜곡된다.
-- =========================================================

create table if not exists public.result_ratings (
  id                bigint      generated always as identity primary key,
  session_id        uuid        not null,
  recommendation_id bigint      references public.recommendation_events (id) on delete cascade,
  rating            smallint    not null check (rating between 1 and 5),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- 추천 1건당 한 행. 다시 매기면 이 행을 덮어쓴다.
  unique (recommendation_id)
);

create index if not exists result_ratings_created_idx
  on public.result_ratings (created_at desc);

-- RLS : 0001 과 같은 원칙. 켜두되 정책은 두지 않아 service_role 만 통과한다.
alter table public.result_ratings enable row level security;

-- ---------------------------------------------------------
-- 조건 조합별 만족도. 어떤 조합의 추천이 약한지 본다.
--   select * from public.rating_by_combo;
-- ---------------------------------------------------------
create or replace view public.rating_by_combo as
select
  r.age,
  r.gender,
  r.situation,
  r.budget,
  count(t.id)                       as ratings,
  round(avg(t.rating)::numeric, 2)  as avg_rating
from public.recommendation_events r
join public.result_ratings t on t.recommendation_id = r.id
group by r.age, r.gender, r.situation, r.budget
order by ratings desc;
