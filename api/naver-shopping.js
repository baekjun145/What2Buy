// Vercel 서버리스 함수
// 프론트엔드로부터 age/relationship/event/minPrice/maxPrice를 받아 서버에서 검색어를
// 직접 조합한 뒤 네이버 쇼핑 검색 API를 대신 호출한다. 클라이언트 코드에는 절대 노출되지
// 않도록 API 키는 오직 process.env 값으로만 사용하고, 응답은 카드 렌더링에 필요한 최소
// 필드(상품명, 가격, 썸네일, 구매 링크)만 정제해 상위 3개만 돌려준다.
//
// 네이버 쇼핑 검색 API는 가격 범위(minPrice~maxPrice) 파라미터를 자체 지원하지 않으므로,
// display=100으로 넉넉히 받아온 뒤 서버에서 lprice 기준으로 직접 필터링한다.
//
// 검색어가 구체적일수록(연령·관계까지 포함) 상위 100개의 가격 분포가 필터 구간을 벗어나
// 결과가 0개가 되는 "모수 부족" 현상이 생길 수 있다. 이를 막기 위해 1차 검색 결과가 3개
// 미만이면 연령·관계 등 구체적인 타겟팅을 제거한 범용 검색어로 2차 검색을 한 번 더 실행하고,
// 두 결과를 중복 제거해 병합함으로써 가능한 한 3개를 채워서 반환한다.

// 값이 없는 항목은 자동으로 건너뛰고, 남은 항목만 공백으로 이어붙인다.
function joinQueryParts(parts) {
  return parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" ");
}

// minPrice/maxPrice(원)를 "3만원대"와 같은 단일 구간 텍스트로 변환한다.
// "3~5만원대"처럼 범위를 그대로 이어붙인 텍스트는 실제 상품명에 거의 등장하지 않아
// 검색 결과가 0건이 되므로(실측 확인), 항상 구간을 대표하는 단일 "N만원대" 형태로만 만든다.
// 100만원 이상은 사실상 상한이 없는 것으로 간주한다.
function buildPriceText(minPrice, maxPrice) {
  const hasMin = Number.isFinite(minPrice) && minPrice > 0;
  const hasMax = Number.isFinite(maxPrice) && maxPrice < 1000000;

  if (!hasMin && !hasMax) return "";

  let tier;
  if (hasMax && !hasMin) {
    // 상한만 있는 경우, 상한 바로 아래의 만원 단위를 대표값으로 사용한다. (예: 3만원 미만 → "2만원대")
    tier = Math.max(Math.ceil((maxPrice + 1) / 10000) - 1, 0);
  } else {
    // 하한이 있는 경우(구간 또는 하한만 있는 경우), 하한의 만원 단위를 대표값으로 사용한다.
    tier = Math.floor(minPrice / 10000);
  }

  return `${tier}만원대`;
}

// 네이버 쇼핑 검색 API를 호출해 원본 item 배열을 반환한다.
async function searchNaver(keyword, clientId, clientSecret) {
  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=100&sort=sim`;

  const response = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  });

  if (!response.ok) {
    throw new Error(`네이버 쇼핑 API 요청이 실패했습니다. (status: ${response.status})`);
  }

  const data = await response.json();
  return data.items || [];
}

// lprice 기준으로 minPrice 이상, maxPrice 이하인 상품만 남긴다.
function filterByPrice(items, minPrice, maxPrice) {
  return items.filter((item) => {
    const price = Number(item.lprice);
    return price >= minPrice && price <= maxPrice;
  });
}

// 1차 결과를 우선하고, 2차(fallback) 결과로 부족분을 채우되 동일 상품(productId 또는 link
// 기준)은 한 번만 남긴다.
function mergeUnique(primaryItems, fallbackItems) {
  const seen = new Set();
  const merged = [];

  for (const item of [...primaryItems, ...fallbackItems]) {
    const key = item.productId || item.link;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged;
}

function toCardItem(item) {
  return {
    title: item.title.replace(/<\/?b>/g, ""),
    price: Number(item.lprice),
    image: item.image,
    link: item.link,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST 요청만 지원합니다." });
    return;
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.status(500).json({ error: "서버에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET이 설정되어 있지 않습니다." });
    return;
  }

  const body = req.body || {};

  // minPrice / maxPrice는 선택 값이다. 숫자가 아니거나 전달되지 않으면 해당 방향은 필터링하지 않는다.
  const rawMinPrice = body.minPrice;
  const rawMaxPrice = body.maxPrice;

  const minPrice = rawMinPrice !== undefined && rawMinPrice !== null && Number.isFinite(Number(rawMinPrice))
    ? Number(rawMinPrice)
    : 0;

  const maxPrice = rawMaxPrice !== undefined && rawMaxPrice !== null && Number.isFinite(Number(rawMaxPrice))
    ? Number(rawMaxPrice)
    : Infinity;

  const priceText = buildPriceText(minPrice, maxPrice);

  // 1차 검색어: 연령·관계·상황·가격대를 모두 포함한 구체적인 검색어
  const primaryKeyword = joinQueryParts([body.age, body.relationship, body.event, priceText, "선물"]);

  if (!primaryKeyword) {
    res.status(400).json({ error: "검색 키워드가 필요합니다." });
    return;
  }

  try {
    const primaryRawItems = await searchNaver(primaryKeyword, clientId, clientSecret);
    let items = filterByPrice(primaryRawItems, minPrice, maxPrice);

    // 1차 결과(가격 필터링 후)가 3개 미만이면, 구체적인 타겟팅(연령·관계)을 제거한
    // 범용 검색어로 2차 호출을 시도해 부족분을 채운다.
    if (items.length < 3) {
      const fallbackKeyword = joinQueryParts([priceText, body.event, "선물"]);

      try {
        const fallbackRawItems = await searchNaver(fallbackKeyword, clientId, clientSecret);
        const fallbackItems = filterByPrice(fallbackRawItems, minPrice, maxPrice);
        items = mergeUnique(items, fallbackItems);
      } catch (fallbackError) {
        // 2차 검색이 실패해도 1차 결과만으로 응답한다(완전 실패로 처리하지 않는다).
      }
    }

    res.status(200).json({ items: items.slice(0, 3).map(toCardItem) });
  } catch (error) {
    res.status(500).json({ error: "네이버 쇼핑 검색 중 오류가 발생했습니다." });
  }
};
