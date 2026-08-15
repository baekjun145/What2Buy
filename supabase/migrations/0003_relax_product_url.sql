-- =========================================================
-- What2Buy — product_url 제약 완화
--
-- Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 실행하세요.
-- 0002_product_links.sql 을 먼저 실행했어야 합니다.
--
-- [왜 고치는가]
-- 0002 는 smartstore/brand.naver.com 만 허용했는데, 네이버 쇼핑 검색 결과에는
-- SSG·11번가·G마켓 같은 외부 쇼핑몰 상품이 그대로 섞여 나온다.
-- 그 링크들은 네이버와 무관한 별개 사이트라 외부 유입 차단과 아무 상관이 없다.
-- 실제로 막히는 건 shopping.naver.com 계열 하나뿐이므로, 그것만 막고 나머지는 연다.
-- =========================================================

alter table public.gift_product_links
  drop constraint if exists gift_product_links_product_url_check;

alter table public.gift_product_links
  add constraint gift_product_links_product_url_check check (
    -- https 만 받는다 (사이트가 https라 http 링크는 브라우저가 경고를 띄운다)
    product_url ~ '^https://'

    -- 네이버 쇼핑 검색/카탈로그는 외부에서 클릭하면 차단 화면이 뜬다.
    -- search.shopping / msearch.shopping / shopping.naver.com 을 모두 막는다.
    -- (스마트스토어 smartstore.naver.com 은 도메인이 달라 그대로 허용된다)
    and product_url !~* '^https://([a-z0-9-]+\.)*shopping\.naver\.com/'

    -- naver.me 단축 링크는 어디로 가는지 알 수 없어 막는다.
    -- 브라우저에서 한 번 열어 최종 주소를 넣을 것.
    and product_url !~* '^https://naver\.me/'
  );
