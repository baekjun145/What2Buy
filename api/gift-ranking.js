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

const { CATEGORY_NAMES, KEYWORDS, INTEREST_KEYWORDS } = require("../lib/gift-keywords");
const supabase = require("../lib/supabase");
const curator = require("../lib/curator");

// 취향에 맞는 후보가 이 개수 이상이면, 후보를 그것만으로 좁힌다.
//
// [왜 점수 배수가 아니라 후보 좁히기인가]
// 인기 데이터와 개인 취향은 자주 충돌한다. 실측하면 20대 여성 후보에서
// '게이밍마우스'는 26위(6.05점)이고 3위는 68.79점이라, 점수로 끌어올리려면
// 11배를 곱해야 한다. 그 정도 배수는 이미 필터나 마찬가지이고,
// 화면에 보여 주는 인기 지수와 실제 정렬 근거가 어긋나게 된다.
//
// 그래서 점수(= 카드에 적힌 지수)는 순수 인기순 그대로 두고,
// 후보 목록 단계에서 취향에 맞는 것만 남기는 방식을 쓴다.
const INTEREST_SLOTS = 3;

function buildInterestBoost(interests) {
  const boosted = new Set();
  for (const name of interests || []) {
    for (const keyword of INTEREST_KEYWORDS[name] || []) boosted.add(keyword);
  }
  return boosted;
}

// 카드에 표시할 이름. 브랜드 키워드를 일반명으로 바꿔 보여주기 위한 것이다.
// (순위·검색 링크·사진·통계는 전부 실제 keyword로 돌아간다)
// DB 사전에는 label 컬럼이 없으므로 코드 사전에서만 가져온다.
const LABELS = new Map(KEYWORDS.filter((k) => k.label).map((k) => [k.keyword, k.label]));
const displayName = (keyword) => LABELS.get(keyword) || keyword;

// 키워드 사전은 DB(gift_keywords)를 우선 쓰고, 못 읽으면 코드에 있는 사전으로 돌아간다.
// DB가 비었거나 장애여도 추천은 계속 동작해야 한다.
// 워밍된 인스턴스 안에서는 잠깐 캐시해 요청마다 DB를 때리지 않는다.
const DICTIONARY_TTL_MS = 5 * 60 * 1000;
let dictionaryCache = { keywords: null, loadedAt: 0, source: "code" };

async function loadKeywords() {
  const now = Date.now();
  if (dictionaryCache.keywords && now - dictionaryCache.loadedAt < DICTIONARY_TTL_MS) {
    return dictionaryCache;
  }

  if (supabase.isConfigured()) {
    try {
      const rows = await supabase.select(
        "gift_keywords",
        "select=keyword,category_id,category_name,audience,budgets,situations&is_active=eq.true"
      );
      if (Array.isArray(rows) && rows.length > 0) {
        dictionaryCache = {
          keywords: rows.map((row) => ({
            keyword: row.keyword,
            category: row.category_id,
            categoryName: row.category_name,
            audience: row.audience || "adult",
            budgets: row.budgets || [],
            situations: row.situations || [],
          })),
          loadedAt: now,
          source: "db",
        };
        return dictionaryCache;
      }
    } catch (error) {
      // DB를 못 읽으면 코드 사전으로 내려간다.
    }
  }

  dictionaryCache = { keywords: KEYWORDS, loadedAt: now, source: "code" };
  return dictionaryCache;
}

const API_BASE = "https://naverapihub.apigw.ntruss.com";
const MAX_KEYWORDS_PER_CALL = 5; // API 제한 (6개 이상은 400)
const MAX_CATEGORIES_PER_CALL = 3; // API 제한 (4개 이상은 400)

// 폼의 연령대 라벨 → 쇼핑인사이트 ages 파라미터.
// '영유아/아동'은 목록에 없다. 쇼핑인사이트의 ages는 10대~60대뿐이라 표현할 수 없어
// 연령 필터를 걸지 않고, 대신 사전의 audience로 후보를 가른다.
const AGE_PARAM = {
  "10대": ["10"],
  "20대": ["20"],
  "30대": ["30"],
  "40대": ["40"],
  "50대 이상": ["50", "60"],
};

const KIDS_AGE = "영유아/아동";

// '성별 무관'은 필터를 걸지 않는다는 뜻이므로 매핑이 없다.
const GENDER_PARAM = { 여성: "f", 남성: "m" };

// session_id는 uuid 컬럼이라 형식이 맞지 않으면 insert가 통째로 실패한다.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// 한 카테고리 안의 키워드 비율을 같은 척도로 모은다.
//
// [왜 그냥 5개씩 잘라 부르면 안 되는가]
// keywords 엔드포인트는 호출당 5개까지만 받는데, ratio가 호출 단위로 정규화된다.
// 그래서 6개 이상을 그냥 나눠 부르면 같은 키워드도 어느 청크에 들어갔느냐에 따라
// 값이 달라진다. 실측: '이솝핸드크림'이 2개짜리 청크에서 55.6, 향수와 같은 호출에서 15.5.
// 이 상태로 점수를 매기면 후보가 적게 묶인 청크의 키워드가 부당하게 높게 나온다.
//
// 그래서 카테고리 가중치와 같은 방법을 쓴다. 첫 호출에서 가장 값이 큰 키워드를
// 앵커로 잡고 이후 모든 청크에 끼워 넣은 뒤, 앵커 값의 비로 첫 호출의 척도에 맞춘다.
// (가장 큰 값을 앵커로 쓰는 이유: 0이거나 데이터가 없으면 나눌 수 없기 때문)
async function fetchKeywordRatios(categoryId, keywords, period, segment) {
  const ask = (list) =>
    callApi("/shopping/v1/category/keywords", {
      ...period,
      ...segment,
      category: categoryId,
      keyword: list.map((k) => ({ name: k, param: [k] })),
    });

  const collect = (json) => {
    const out = new Map();
    for (const result of json.results || []) {
      const ratio = latestRatio(result);
      if (ratio !== null) out.set(result.title, ratio); // 카테고리에 없는 키워드는 조용히 제외
    }
    return out;
  };

  // 5개 이하면 한 번에 끝나므로 정규화 문제 자체가 없다.
  if (keywords.length <= MAX_KEYWORDS_PER_CALL) {
    return { categoryId, ratios: collect(await ask(keywords)) };
  }

  const first = collect(await ask(keywords.slice(0, MAX_KEYWORDS_PER_CALL)));
  const ratios = new Map(first);

  // 첫 호출에서 값이 가장 큰 키워드를 앵커로 삼는다.
  let anchor = null;
  let anchorBase = 0;
  for (const [keyword, ratio] of first) {
    if (ratio > anchorBase) {
      anchor = keyword;
      anchorBase = ratio;
    }
  }

  const rest = keywords.slice(MAX_KEYWORDS_PER_CALL);
  const chunks = [];
  const perChunk = anchor ? MAX_KEYWORDS_PER_CALL - 1 : MAX_KEYWORDS_PER_CALL;
  for (let i = 0; i < rest.length; i += perChunk) {
    chunks.push(rest.slice(i, i + perChunk));
  }

  const results = await Promise.all(
    chunks.map((chunk) => ask(anchor ? [anchor, ...chunk] : chunk).then(collect))
  );

  for (const chunkRatios of results) {
    const here = anchor ? chunkRatios.get(anchor) : null;
    // 앵커가 이 호출에서 값을 못 받으면 맞출 기준이 없다. 원값을 그대로 쓴다.
    const scale = here && here > 0 ? anchorBase / here : 1;
    for (const [keyword, ratio] of chunkRatios) {
      if (keyword === anchor) continue; // 앵커 값은 첫 호출 것을 유지한다
      ratios.set(keyword, ratio * scale);
    }
  }

  return { categoryId, ratios };
}

// 추천 키워드를 네이버 쇼핑에서 여는 링크.
//
// [왜 통합검색(search.naver.com)으로 보내는가]
// 쇼핑 전용 검색(search.shopping.naver.com)은 외부 사이트에서 들어오는 링크를 막는다.
// "쇼핑 서비스 접속이 일시적으로 제한되었습니다" 화면이 뜨며, rel=noreferrer로 출처를
// 숨겨도 결과는 같았다(실제 클릭으로 확인). 반면 통합검색의 쇼핑 탭(where=shop)은
// 외부 유입으로도 정상적으로 열린다.
//
// [가격 필터는 링크로 걸 수 없다]
// 통합검색은 minPrice/maxPrice 파라미터를 무시한다(실제 클릭으로 확인).
// 그렇다고 "3~5만원대"를 검색어에 붙이면 네이버가 그걸 가격 조건이 아니라 상품명에
// 들어갈 낱말로 취급해서, 제목에 "3만원대"라고 적힌 엉뚱한 가격의 상품이 올라온다.
// 두 방법 다 안 되므로 링크에는 물건 이름만 넣고, 예산은 카드 화면에서 안내한다.
function buildShoppingUrl(keyword) {
  const params = new URLSearchParams({ where: "shop", query: `${keyword} 선물` });
  return `https://search.naver.com/search.naver?${params.toString()}`;
}

// 손으로 큐레이션해 둔 상품 링크를 (키워드 × 예산)으로 찾는다.
//
// 상품 링크를 주던 쇼핑 검색 API가 종료되어 자동으로는 개별 상품에 연결할 수 없다.
// 그래서 gift_product_links 에 채워 둔 것만 상품으로 보내고, 없으면 검색으로 보낸다.
// 즉 표를 다 채우지 않아도 되고, 채운 만큼만 개별 상품 연결이 켜진다.
//
// 조회에 실패해도 추천은 그대로 나가야 하므로 빈 Map으로 넘어간다.
async function loadProductLinks(keywords, budget) {
  if (!supabase.isConfigured() || !budget || keywords.length === 0) return new Map();

  try {
    const inList = keywords.map((k) => `"${k.replace(/"/g, '""')}"`).join(",");
    const rows = await supabase.select(
      "gift_product_links",
      `select=keyword,product_url,image_url&is_active=eq.true` +
        `&budget=eq.${encodeURIComponent(budget)}` +
        `&keyword=in.(${encodeURIComponent(inList)})`
    );
    return new Map((rows || []).map((row) => [row.keyword, row]));
  } catch (error) {
    return new Map();
  }
}

// 상황·예산으로 후보를 좁힌다. 후보가 너무 적으면 예산 → 상황 순으로 조건을 푼다.
//
// audience는 절대 완화하지 않는다. 아기 선물을 찾는 사람에게 성인용 향수를 권하거나
// 그 반대가 되면 추천 자체가 무의미해지기 때문이다.
function selectCandidates(keywords, { age, situation, budget }) {
  const wantsKids = age === KIDS_AGE;
  const pool = keywords.filter((k) => (k.audience === "kids") === wantsKids);

  const bySituationAndBudget = pool.filter(
    (k) =>
      (!situation || k.situations.includes(situation)) &&
      (!budget || k.budgets.includes(budget))
  );
  if (bySituationAndBudget.length >= 6) {
    return { candidates: bySituationAndBudget, relaxed: null };
  }

  const bySituation = pool.filter((k) => !situation || k.situations.includes(situation));
  if (bySituation.length >= 6) {
    return { candidates: bySituation, relaxed: "budget" };
  }

  return { candidates: pool, relaxed: "all" };
}

// 추천 조회를 기록하고 방금 만든 행의 id를 돌려준다.
// 이 id를 클릭 이벤트에 붙여야 "추천 → 클릭" 전환을 이어볼 수 있다.
// 기록에 실패해도 추천 자체는 그대로 내보낸다.
async function logRecommendation(payload) {
  if (!supabase.isConfigured()) return null;
  try {
    const rows = await supabase.insert("recommendation_events", payload, { returning: true });
    return rows?.[0]?.id ?? null;
  } catch (error) {
    return null;
  }
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

  const { age, gender, relation, situation, budget, mbti, sessionId } = req.body || {};
  // 관심사는 최대 4개. 그 이상 오면 앞에서 자른다.
  const interests = Array.isArray(req.body?.interests) ? req.body.interests.slice(0, 4) : [];
  const startedAt = Date.now();

  const period = buildPeriod();
  const ages = AGE_PARAM[age] || [];
  const genderParam = GENDER_PARAM[gender] || "";
  // 필터가 비어 있으면 아예 넘기지 않는다. 빈 문자열/배열을 보내면 400이 날 수 있다.
  const segment = {};
  if (ages.length) segment.ages = ages;
  if (genderParam) segment.gender = genderParam;

  const dictionary = await loadKeywords();
  const { candidates, relaxed } = selectCandidates(dictionary.keywords, { age, situation, budget });

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
    const chunkResults = await Promise.all(
      [...byCategory].map(([categoryId, items]) =>
        fetchKeywordRatios(categoryId, items.map((k) => k.keyword), period, segment)
      )
    );

    const boosted = buildInterestBoost(interests);

    const scored = [];
    for (const { categoryId, ratios } of chunkResults) {
      for (const [keyword, ratio] of ratios) {
        const weight = categoryWeight.get(categoryId) ?? 0;
        const matchesInterest = boosted.has(keyword);
        scored.push({
          keyword,
          label: displayName(keyword),
          matchesInterest, // 카드에 '관심사와 맞음' 표시를 붙이기 위해 내려보낸다
          category: categoryId,
          categoryName: CATEGORY_NAMES[categoryId] || categoryId,
          // 화면에는 '100 만점 지수'로 보여주므로 100을 넘지 않게 자른다.
          // 앵커로 다른 호출의 값을 끌어오는 과정에서 첫 호출의 최댓값을 넘을 수 있다.
          // (순위는 아래 score로 매기고 그쪽은 자르지 않는다)
          keywordRatio: Number(Math.min(ratio, 100).toFixed(1)),
          categoryWeight: Number(weight.toFixed(2)),
          score: Number((weight * ratio).toFixed(2)),
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    // ---- 3단계 : 후보를 좁히고, 큐레이터(LLM)가 그 안에서 3개를 고른다 ----
    //
    // [취향을 고른 경우]
    // 취향에 맞는 후보가 3개 이상이면 그것만 남긴다.
    // 3개가 안 되면 카드를 못 채우므로 전체 후보를 그대로 쓴다.
    const matched = scored.filter((item) => item.matchesInterest);
    const pool = boosted.size > 0 && matched.length >= INTEREST_SLOTS ? matched : scored;

    // 표시명이 같은 것은 한 장만 남긴다. 브랜드 키워드를 일반명으로 보여주기 때문에,
    // 그냥 위에서부터 자르면 '립스틱' 카드가 세 장 나올 수 있다.
    // 점수순으로 정렬돼 있으므로 먼저 만나는 쪽(= 가장 높은 점수)이 남는다.
    const shortlist = [];
    const shortlistLabels = new Set();
    for (const item of pool) {
      if (shortlistLabels.has(item.label)) continue;
      shortlistLabels.add(item.label);
      shortlist.push(item);
      if (shortlist.length >= 8) break;
    }

    // MBTI·관계처럼 클릭 데이터에 없는 조건은 여기서만 반영된다.
    const curated = await curator.curate(shortlist, {
      age,
      gender,
      relation,
      situation,
      budget,
      mbti,
      interests,
    });

    // LLM이 실패하면 같은 후보 목록의 상위 3개를 쓴다.
    // 예전에는 폴백만 다른 목록(취향 자리 배정 결과)을 써서, LLM 성공 여부에 따라
    // 취향 반영 정도가 달라졌다. 두 경로가 같은 후보에서 나오도록 맞춘다.
    const finalItems =
      curated.source === "llm" ? curated.items.slice(0, 3) : shortlist.slice(0, 3);

    // 큐레이션 링크를 먼저 본다. 사진까지 지정돼 있으면 이미지 검색을 건너뛴다.
    // (사진을 자동으로 가져오면 링크한 상품과 다른 물건이 찍혀 나올 수 있다)
    const productLinks = await loadProductLinks(
      finalItems.map((item) => item.keyword),
      budget
    );

    // 상위 3개에만 이미지를 붙인다. 실패한 건 이미지 없이 그대로 나간다.
    const images = await Promise.all(
      finalItems.map((item) =>
        productLinks.get(item.keyword)?.image_url
          ? null
          : fetchKeywordImage(item.keyword, { age, gender })
      )
    );

    finalItems.forEach((item, i) => {
      Object.assign(item, images[i] || {});

      const link = productLinks.get(item.keyword);
      if (link) {
        item.searchUrl = link.product_url;
        item.linkType = "product";
        if (link.image_url) {
          item.image = link.image_url;
          item.imageFallback = "";
          item.imageAlt = item.keyword;
        }
      } else {
        item.searchUrl = buildShoppingUrl(item.keyword);
        item.linkType = "search";
      }
    });

    // 조회 이력을 남기고 그 id를 함께 내려보낸다. 브라우저는 이후 클릭 이벤트에
    // 이 id를 붙여 보내고, 그걸로 "추천 → 클릭" 전환을 이어볼 수 있다.
    const recommendationId = await logRecommendation({
      session_id: UUID_PATTERN.test(String(sessionId || "")) ? sessionId : null,
      age: age || null,
      gender: gender || null,
      relation: relation || null,
      situation: situation || null,
      budget: budget || null,
      relaxed,
      result_keywords: finalItems.map((item) => item.keyword),
      candidate_count: candidates.length,
      duration_ms: Date.now() - startedAt,
    });

    res.status(200).json({
      items: finalItems,
      recommendationId,
      meta: {
        candidateCount: candidates.length,
        scoredCount: scored.length,
        relaxed, // 조건을 완화했다면 어떤 축을 풀었는지
        segment: { age: age || null, gender: gender || null },
        dictionarySource: dictionary.source, // 'db' | 'code'
        // 'llm' | 'score'. score면 detail에 되돌아간 이유가 담긴다
        // (no_key / http_4xx / err_AbortError / no_picks / name_mismatch)
        curatedBy: curated.source,
        curatorDetail: curated.detail || null,
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
