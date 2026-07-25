// =========================================================
// What2Buy — result.js
// 1) DOM 로드 시 localStorage에서 recommend.html이 저장한 선택값을 읽어온다.
// 2) 읽어온 값을 하나의 검색어 문자열로 조합한다. (initResultPage)
// 3) /api/naver-shopping 호출 후 3장 카드 뒤집기 UI로 렌더링한다.
// =========================================================

const PREFERENCES_STORAGE_KEY = "what2buy_preferences";

// 예산 칩 라벨 → 백엔드에 전달할 가격 범위(원). { minPrice, maxPrice }
// 구간을 넓게 잡아 후가공 필터링 시 결과 없음(모수 부족) 리스크를 줄인다.
const BUDGET_PRICE_RANGE = {
  "3만원 미만": { minPrice: 0, maxPrice: 29999 },
  "3~5만원대": { minPrice: 30000, maxPrice: 49999 },
  "5~10만원대": { minPrice: 50000, maxPrice: 99999 },
  "10만원 이상": { minPrice: 100000, maxPrice: 9999999 },
};

document.addEventListener("DOMContentLoaded", initResultPage);

// localStorage에서 선택값을 읽어 검색 키워드로 조합하고, 추천 결과 조회를 시작한다.
function initResultPage() {
  const preferences = readPreferences();

  if (!preferences) {
    showResultError("선택하신 정보를 찾을 수 없어요. 이전 페이지에서 다시 선택해주세요.");
    return;
  }

  const keyword = buildKeyword(preferences);

  if (!keyword) {
    showResultError("선택하신 정보를 찾을 수 없어요. 이전 페이지에서 다시 선택해주세요.");
    return;
  }

  const priceRange = BUDGET_PRICE_RANGE[preferences.budget] || {};
  const { minPrice, maxPrice } = priceRange;

  const keywordLineEl = document.getElementById("resultKeywordLine");
  keywordLineEl.textContent = `“${keyword}” 검색 결과`;

  // 검색어 조합은 백엔드(buildSearchQuery)가 담당하므로, 원본 값(age/relationship/event)을 그대로 전달한다.
  fetchRecommendations(
    { age: preferences.age, relationship: preferences.relation, event: preferences.situation },
    minPrice,
    maxPrice
  );
}

// localStorage에 저장된 JSON을 안전하게 읽어온다. 값이 없거나 형식이 깨졌으면 null을 반환한다.
function readPreferences() {
  const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

// 예: { age: "20대", relation: "여자친구", situation: "생일", budget: "3~5만원대" }
// → "20대 여자친구 생일 3~5만원대 선물"
function buildKeyword(preferences) {
  const relationPart = [preferences.age, preferences.relation].filter(Boolean).join(" ");
  const parts = [relationPart, preferences.situation, preferences.budget].filter(Boolean);

  if (parts.length === 0) return "";
  return `${parts.join(" ")} 선물`;
}

async function fetchRecommendations({ age, relationship, event }, minPrice, maxPrice) {
  const loadingEl = document.getElementById("resultLoading");
  const errorEl = document.getElementById("resultError");
  const cardGrid = document.getElementById("cardGrid");

  loadingEl.hidden = false;
  errorEl.hidden = true;
  cardGrid.innerHTML = "";

  try {
    const response = await fetch("/api/naver-shopping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ age, relationship, event, minPrice, maxPrice }),
    });

    if (!response.ok) {
      throw new Error("추천 상품을 불러오지 못했습니다.");
    }

    const data = await response.json();
    renderCards(data.items || []);
  } catch (error) {
    showResultError("잠시 후 다시 시도해 주세요. (서버 연결이 필요한 기능입니다)");
  } finally {
    loadingEl.hidden = true;
  }
}

function showResultError(message) {
  const errorEl = document.getElementById("resultError");
  errorEl.querySelector("p").textContent = message;
  errorEl.hidden = false;
}

function renderCards(items) {
  const cardGrid = document.getElementById("cardGrid");
  cardGrid.innerHTML = "";

  if (items.length === 0) {
    const emptyEl = document.createElement("p");
    emptyEl.className = "result-empty";
    emptyEl.textContent = "조건에 맞는 상품을 찾지 못했어요. 다른 조합으로 시도해보세요.";
    cardGrid.appendChild(emptyEl);
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "card-flip";

    const priceText = Number.isFinite(item.price) ? `${item.price.toLocaleString()}원` : "가격 정보 없음";

    card.innerHTML = `
      <div class="card-flip-inner">
        <div class="card-face card-front">
          <img class="card-thumb" src="${item.image}" alt="${item.title}" loading="lazy" />
          <div class="card-body">
            <p class="card-title">${item.title}</p>
            <span class="card-flip-hint"><i class="fa-solid fa-rotate"></i> 가격·구매 보기</span>
          </div>
        </div>
        <div class="card-face card-back">
          <p class="card-back-price">${priceText}</p>
          <a class="btn btn-primary card-buy-btn" href="${item.link}" target="_blank" rel="noopener noreferrer">구매하러 가기</a>
          <span class="card-back-hint">다시 보기</span>
        </div>
      </div>
    `;

    card.addEventListener("click", (event) => {
      if (event.target.closest(".card-buy-btn")) return;
      card.classList.toggle("is-flipped");
    });

    cardGrid.appendChild(card);
  });
}
