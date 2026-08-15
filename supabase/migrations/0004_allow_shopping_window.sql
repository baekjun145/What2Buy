-- =========================================================
-- What2Buy — product_url 제약 재조정 (쇼핑윈도 허용)
--
-- Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 실행하세요.
--
-- [왜 또 고치는가]
-- 0003 은 shopping.naver.com 으로 시작하는 주소를 전부 막았다.
-- 하지만 외부 유입 차단이 실제로 확인된 것은 검색 도메인
-- search.shopping.naver.com 하나뿐이고, 아래 두 가지는 성격이 다르다.
--
--   차단됨   https://search.shopping.naver.com/catalog/...   (가격비교 카탈로그)
--   상품페이지 https://shopping.naver.com/window-products/...  (쇼핑윈도 상품)
--
-- 그래서 호스트에 search 가 들어간 것만 막고 나머지는 연다.
-- (msearch.shopping.naver.com 같은 모바일 검색 호스트도 함께 걸린다)
-- =========================================================

alter table public.gift_product_links
  drop constraint if exists gift_product_links_product_url_check;

alter table public.gift_product_links
  add constraint gift_product_links_product_url_check check (
    -- https 만 받는다 (사이트가 https라 http 링크는 브라우저가 경고를 띄운다)
    product_url ~ '^https://'

    -- 네이버 쇼핑 '검색' 계열만 막는다.
    -- search.shopping.naver.com / msearch.shopping.naver.com 등이 걸린다.
    and product_url !~* '^https://[a-z0-9-]*search\.shopping\.naver\.com/'

    -- naver.me 단축 링크는 어디로 가는지 알 수 없어 막는다.
    -- 브라우저에서 한 번 열어 최종 주소를 넣을 것.
    and product_url !~* '^https://naver\.me/'
  );
