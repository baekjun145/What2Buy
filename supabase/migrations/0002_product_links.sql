-- =========================================================
-- What2Buy — 수동 큐레이션 상품 링크
--
-- Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 실행하세요.
-- 0001_init.sql 을 먼저 실행해야 합니다 (gift_keywords 를 참조합니다).
--
-- [왜 별도 테이블인가]
-- 같은 키워드라도 예산대마다 권할 상품이 다르다("목걸이" 3만원 미만 vs 10만원 이상).
-- gift_keywords 는 키워드당 한 행이라 예산별 링크를 담을 수 없어 따로 둔다.
--
-- [왜 수동인가]
-- 상품 링크를 주던 네이버 쇼핑 검색 API가 2026-07-31 종료되어 자동 수집이 불가능하다.
-- 남은 이미지 검색 API는 이미지 주소만 주고 상품 페이지 주소를 주지 않는다.
-- =========================================================

create table if not exists public.gift_product_links (
  id           bigint generated always as identity primary key,

  -- gift_keywords.keyword 와 정확히 같은 문자열이어야 한다 (예: 목걸이)
  keyword      text        not null references public.gift_keywords (keyword)
                             on update cascade on delete cascade,

  -- 폼의 예산 라벨과 정확히 같은 문자열이어야 한다
  budget       text        not null check (
                 budget in ('3만원 미만', '3~5만원대', '5~10만원대', '10만원 이상')
               ),

  -- [중요] smartstore.naver.com / brand.naver.com 상품 주소만 넣을 것.
  -- search.shopping.naver.com(가격비교) 주소는 외부 유입이 차단되어 열리지 않는다.
  product_url  text        not null check (
                 product_url ~ '^https://(smartstore|brand)\.naver\.com/'
               ),

  -- 카드에 띄울 상품 사진. 비워두면 기존처럼 이미지 검색 결과를 쓴다.
  -- (링크한 상품과 다른 사진이 나올 수 있으므로 되도록 채우는 것을 권장)
  image_url    text,

  -- 관리용 메모. 어떤 상품인지 나중에 알아보기 위한 것으로 화면에는 쓰지 않는다.
  product_name text,

  -- 품절·판매중지된 링크는 지우지 말고 여기를 false 로 내리면 검색 링크로 되돌아간다.
  is_active    boolean     not null default true,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- 키워드+예산 조합당 하나만 둔다. 바꾸고 싶으면 그 행을 수정한다.
  unique (keyword, budget)
);

-- 서버는 항상 (keyword, budget, is_active) 로 조회한다.
create index if not exists gift_product_links_lookup_idx
  on public.gift_product_links (keyword, budget)
  where is_active;

-- RLS : 0001 과 같은 원칙. 켜두되 정책은 두지 않아 service_role 만 통과한다.
alter table public.gift_product_links enable row level security;

-- ---------------------------------------------------------
-- 채움 현황 보기 : 아직 링크가 없는 (키워드 × 예산) 조합을 보여준다.
--   select * from public.product_link_todo;
-- 로 어디부터 채우면 되는지 확인할 수 있다.
-- ---------------------------------------------------------
create or replace view public.product_link_todo as
select
  k.keyword,
  k.category_name,
  b.budget,
  (l.id is not null) as has_link
from public.gift_keywords k
cross join lateral unnest(k.budgets) as b(budget)
left join public.gift_product_links l
  on l.keyword = k.keyword and l.budget = b.budget and l.is_active
where k.is_active
order by has_link, k.category_name, k.keyword;
