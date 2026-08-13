// Vercel 서버리스 함수 — 선물 키워드 랭킹
//
// 네이버 쇼핑 "검색" API는 2026-07-31 종료되어 상품(이름·가격·이미지·링크)을 가져올 수 없다.
// 대신 NAVER API HUB의 Data Lab 쇼핑인사이트로 "어떤 선물 키워드가 이 연령·성별에게
// 인기 있는지"를 조회해 상위 3개를 돌려준다.
//
// [점수 계산이 두 단계인 이유]
// 쇼핑인사이트의 ratio는 "호출 단위"로 정규화된다. 같은 키워드도 어떤 키워드들과 함께
// 조회했느냐에 따라 값이 달라지므로, 여러 번 나눠 호출한 결과를 그대로 합치면 순위가 틀린다.
// 게다가 category 파라미터는 호출당 하나뿐이라 서로 다른 카테고리의 키워드를 한 번에
// 비교할 수도 없다. 그래서 비교를 두 층으로 나눈다.
//
//   1) 카테고리 간 : /categories 를 한 번 호출하면 여러 카테고리가 같은 척도로 나온다.
//   2) 카테고리 내 : /category/keywords 를 카테고리별로 호출한다. 한 호출 안에서는
//                    키워드끼리 비교가 유효하다.
//
//   최종 점수 = 카테고리 가중치 × 카테고리 내 키워드 비율
//
// 두 호출 모두 ages/gender 필터를 받으므로 개인화는 API가 직접 해준다.

const { CATEGORY_NAMES, KEYWORDS } = require("../lib/gift-keywords");

const API_BASE = "https://naverapihub.apigw.ntruss.com";
const MAX_KEYWORDS_PER_CALL = 5; // API 제한 (6개 이상은 400)
const MAX_CATEGORIES_PER_CALL = 3; // API 제한 (4개 이상은 400)

// 폼의 연령대 라벨 → 쇼핑인사이트 ages 파라미터
const AGE_PARAM = {
  "10대": ["10"],
  "20대": ["20"],
  "30대": ["30"],
  "40대": ["40"],
  "50대 이상": ["50", "60"],
};

const GENDER_PARAM = { 여성: "f", 남성: "m" };

// 조회 기간 : 최근 3개월. 월 단위로 끊어 계절성은 살리되 표본은 확보한다.
function buildPeriod() {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - 3);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end), timeUnit: "month" };
}

function authHeaders() {
  return {
    "X-NCP-APIGW-API-KEY-ID": process.env.NAVER_CLIENT_ID,
    "X-NCP-APIGW-API-KEY": process.env.NAVER_CLIENT_SECRET,
    "Content-Type": "application/json",
  };
}

async function callApi(path, body) {
  const response = await fetch(API_BASE + path, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(`쇼핑인사이트 호출 실패 (status: ${response.status})`);
    error.status = response.status;
    error.detail = detail.slice(0, 300);
    throw error;
  }

  return response.json();
}

// 검색어에 그대로 넣기엔 어색한 연령 라벨을 다듬는다. ("50대 이상 남성 향수" → "50대 남성 향수")
const AGE_QUERY_TOKEN = { "50대 이상": "50대" };

// 이미지 검색은 상품 사진만 주지 않는다. 커뮤니티 게시글(뽐뿌·인스티즈), 블로그,
// 뉴스, 쇼핑몰 배너 이미지가 상위에 섞여 올라온다.
// 실측해보면 진짜 상품 사진은 예외 없이 네이버 쇼핑 상품 CDN에서 온다.
const PRODUCT_IMAGE_HOST = /^(shop\d*\.phinf\.naver\.net|shop-phinf\.pstatic\.net)$/;

function isProductImage(item) {
  try {
    return PRODUCT_IMAGE_HOST.test(new URL(item.link).hostname);
  } catch (error) {
    return false;
  }
}

const stripTags = (text) => (text || "").replace(/<\/?b>/g, "");
const squash = (text) => stripTags(text).replace(/\s+/g, "");

// 판매자들이 상품명에 "30대 남성 선물" 같은 문구를 도배해 두기 때문에,
// 인구집단 토큰만으로도 엉뚱한 상품이 상위에 올라온다.
// (예: "30대 남성 키보드 선물" → "30대남자장지갑 … 장지갑선물")
// 그래서 상품명에 키워드가 실제로 들어 있는지까지 확인한다.
function matchesKeyword(item, keyword) {
  return squash(item.title).includes(squash(keyword));
}

// 상품 CDN에서 왔고 상품명에 키워드가 들어 있는 첫 이미지를 고른다.
// requireKeyword=false면 CDN 조건만 본다 (마지막 수단).
async function searchProductImage(query, keyword, requireKeyword = true) {
  const url =
    `${API_BASE}/search/v1/image?query=${encodeURIComponent(query)}` +
    `&display=20&filter=large&sort=sim`;

  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) return null;

  const json = await response.json();
  const products = (json.items || []).filter(isProductImage);

  return (requireKeyword ? products.find((it) => matchesKeyword(it, keyword)) : products[0]) || null;
}

// 추천 키워드를 대표할 이미지를 한 장 가져온다.
//
// 응답의 link(원본)는 http 전용이라 https 배포에서 mixed content로 차단된다.
// 반면 thumbnail은 https(search.pstatic.net)이고 핫링크도 되므로 이쪽을 쓴다.
// 다만 기본 type=b150은 150px이라 카드에 쓰기엔 작아서 b400으로 올린다.
// (b400은 문서화된 값이 아니므로 실패하면 프론트에서 원본 썸네일로 되돌린다)
async function fetchKeywordImage(keyword, { age, gender }) {
  const ageToken = age ? AGE_QUERY_TOKEN[age] || age : "";

  // 좁은 검색어부터 시도하고, 조건에 맞는 상품 사진이 없으면 단계적으로 넓힌다.
  // 마지막 단계는 키워드만 남기므로 최소한 "그 물건 사진"은 보장된다.
  const attempts = [
    [ageToken, gender, keyword, "선물"],
    [gender, keyword, "선물"],
    [keyword, "선물"],
  ]
    .map((parts) => parts.filter(Boolean).join(" "))
    .filter((query, index, all) => all.indexOf(query) === index);

  try {
    let item = null;
    for (const query of attempts) {
      item = await searchProductImage(query, keyword);
      if (item) break;
    }
    // 그래도 못 찾으면 키워드 일치 조건을 풀고 상품 사진 아무거나 쓴다.
    if (!item) item = await searchProductImage(attempts[attempts.length - 1], keyword, false);

    if (!item || !item.thumbnail) return null;

    return {
      image: item.thumbnail.replace(/type=b150/, "type=b400"),
      imageFallback: item.thumbnail,
      imageAlt: stripTags(item.title) || keyword,
    };
  } catch (error) {
    return null; // 이미지는 부가 정보다. 실패해도 추천 자체는 그대로 내보낸다.
  }
}

// 시계열 중 가장 최근 값을 그 키워드/카테고리의 대표 점수로 쓴다.
function latestRatio(result) {
  const points = result?.data || [];
  if (points.length === 0) return null; // 그 카테고리에 없는 키워드
  return points[points.length - 1].ratio;
}

// 카테고리 간 가중치를 같은 척도로 모은다.
//
// categories 엔드포인트는 호출당 3개까지만 받는데, ratio는 호출 단위로 정규화되므로
// 4개 이상을 나눠 부르면 값끼리 비교할 수 없게 된다. 그래서 모든 호출에 같은
// "앵커 카테고리"를 하나씩 끼워 넣고, 앵커를 1.0으로 두어 나머지를 상대값으로 환산한다.
// (키워드와 달리 카테고리는 어느 호출에 넣어도 항상 값이 나오므로 앵커로 쓸 수 있다)
async function fetchCategoryWeights(categoryIds, period, segment) {
  const weights = new Map();
  if (categoryIds.length === 0) return weights;

  const toParam = (id) => ({ name: CATEGORY_NAMES[id] || id, param: [id] });

  // 3개 이하면 한 번의 호출로 끝나므로 정규화 문제 자체가 없다.
  if (categoryIds.length <= MAX_CATEGORIES_PER_CALL) {
    const json = await callApi("/shopping/v1/categories", {
      ...period,
      ...segment,
      category: categoryIds.map(toParam),
    });
    for (const result of json.results || []) {
      weights.set((result.category || [])[0], latestRatio(result) ?? 0);
    }
    return weights;
  }

  const anchor = categoryIds[0];
  const rest = categoryIds.slice(1);
  const chunks = [];
  for (let i = 0; i < rest.length; i += MAX_CATEGORIES_PER_CALL - 1) {
    chunks.push(rest.slice(i, i + MAX_CATEGORIES_PER_CALL - 1));
  }

  const responses = await Promise.all(
    chunks.map((chunk) =>
      callApi("/shopping/v1/categories", {
        ...period,
        ...segment,
        category: [anchor, ...chunk].map(toParam),
      })
    )
  );

  weights.set(anchor, 1);
  for (const json of responses) {
    const results = json.results || [];
    const anchorResult = results.find((r) => (r.category || [])[0] === anchor);
    const anchorRatio = latestRatio(anchorResult) ?? 0;

    for (const result of results) {
      const id = (result.category || [])[0];
      if (id === anchor) continue;
      const ratio = latestRatio(result) ?? 0;
      // 앵커가 0이면 이 묶음은 비교 기준이 없다. 순위에서 빠지도록 0으로 둔다.
      weights.set(id, anchorRatio > 0 ? ratio / anchorRatio : 0);
    }
  }

  return weights;
}

// 상황·예산으로 후보를 좁힌다. 후보가 너무 적으면 예산 → 상황 순으로 조건을 푼다.
function selectCandidates(situation, budget) {
  const bySituationAndBudget = KEYWORDS.filter(
    (k) =>
      (!situation || k.situations.includes(situation)) &&
      (!budget || k.budgets.includes(budget))
  );
  if (bySituationAndBudget.length >= 6) {
    return { candidates: bySituationAndBudget, relaxed: null };
  }

  const bySituation = KEYWORDS.filter((k) => !situation || k.situations.includes(situation));
  if (bySituation.length >= 6) {
    return { candidates: bySituation, relaxed: "budget" };
  }

  return { candidates: KEYWORDS, relaxed: "all" };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST 요청만 지원합니다." });
    return;
  }

  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    res.status(500).json({
      error: "서버에 NAVER API HUB 키가 설정되어 있지 않습니다.",
      code: "MISSING_CREDENTIALS",
    });
    return;
  }

  const { age, gender, situation, budget } = req.body || {};

  const period = buildPeriod();
  const ages = AGE_PARAM[age] || [];
  const genderParam = GENDER_PARAM[gender] || "";
  // 필터가 비어 있으면 아예 넘기지 않는다. 빈 문자열/배열을 보내면 400이 날 수 있다.
  const segment = {};
  if (ages.length) segment.ages = ages;
  if (genderParam) segment.gender = genderParam;

  const { candidates, relaxed } = selectCandidates(situation, budget);

  // 후보를 카테고리별로 묶는다 (category 파라미터가 호출당 하나이므로)
  const byCategory = new Map();
  for (const item of candidates) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category).push(item);
  }
  const categoryIds = [...byCategory.keys()];

  try {
    // ---- 1단계 : 카테고리 간 가중치 (앵커로 같은 척도에 올린다) ----
    const rawWeights = await fetchCategoryWeights(categoryIds, period, segment);

    // 앵커 기준 상대값이라 스케일이 제각각일 수 있으므로 최댓값을 1로 맞춰둔다.
    // 순위는 그대로이고 score 숫자만 읽기 좋아진다.
    const maxWeight = Math.max(...rawWeights.values(), 0);
    const categoryWeight = new Map();
    for (const [id, value] of rawWeights) {
      categoryWeight.set(id, maxWeight > 0 ? value / maxWeight : 0);
    }

    // ---- 2단계 : 카테고리 내 키워드 비율 ----
    const calls = [];
    for (const [categoryId, items] of byCategory) {
      for (let i = 0; i < items.length; i += MAX_KEYWORDS_PER_CALL) {
        const chunk = items.slice(i, i + MAX_KEYWORDS_PER_CALL);
        calls.push(
          callApi("/shopping/v1/category/keywords", {
            ...period,
            ...segment,
            category: categoryId,
            keyword: chunk.map((k) => ({ name: k.keyword, param: [k.keyword] })),
          }).then((json) => ({ categoryId, json }))
        );
      }
    }

    const chunkResults = await Promise.all(calls);

    const scored = [];
    for (const { categoryId, json } of chunkResults) {
      for (const result of json.results || []) {
        const ratio = latestRatio(result);
        if (ratio === null) continue; // 카테고리에 없는 키워드는 조용히 제외

        const weight = categoryWeight.get(categoryId) ?? 0;
        scored.push({
          keyword: result.title,
          category: categoryId,
          categoryName: CATEGORY_NAMES[categoryId] || categoryId,
          keywordRatio: Number(ratio.toFixed(1)),
          categoryWeight: Number(weight.toFixed(2)),
          score: Number((weight * ratio).toFixed(2)),
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 3);

    // 상위 3개에만 이미지를 붙인다. 실패한 건 이미지 없이 그대로 나간다.
    const images = await Promise.all(
      top.map((item) => fetchKeywordImage(item.keyword, { age, gender }))
    );
    top.forEach((item, i) => Object.assign(item, images[i] || {}));

    res.status(200).json({
      items: top,
      meta: {
        candidateCount: candidates.length,
        scoredCount: scored.length,
        relaxed, // 조건을 완화했다면 어떤 축을 풀었는지
        segment: { age: age || null, gender: gender || null },
        period,
      },
    });
  } catch (error) {
    if (error.status === 401) {
      res.status(502).json({
        error: "NAVER API HUB 인증에 실패했습니다. API 키를 확인해주세요.",
        code: "AUTH_FAILED",
      });
      return;
    }

    res.status(500).json({
      error: "선물 추천 데이터를 불러오는 중 오류가 발생했습니다.",
      code: "INSIGHT_FAILED",
      detail: error.detail,
    });
  }
};
