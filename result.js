// =========================================================
// What2Buy — result.js
// 1) recommend.html이 localStorage에 저장한 선택값을 읽는다.
// 2) /api/gift-ranking을 호출해 선물 키워드 랭킹을 받아온다.
// 3) 3장 카드 뒤집기 UI로 렌더링한다.
//
// 네이버 쇼핑 "검색" API가 2026-07-31 종료되어 상품(가격·이미지·구매링크)은 가져올 수 없다.
// 대신 쇼핑인사이트 데이터로 "이 연령·성별에게 인기 있는 선물 키워드"를 추천하고,
// 구매는 네이버 쇼핑 검색 결과 페이지로 연결한다.
// =========================================================

const PREFERENCES_STORAGE_KEY = "what2buy_preferences";
const SESSION_STORAGE_KEY = "what2buy_session_id";

// 조건 요약 문자열. 오류 안내와 검색 링크에서 재사용한다.
let conditionSummary = "";
// 이번 추천 조회의 id. 클릭 이벤트를 이 조회에 이어 붙이는 데 쓴다.
let currentRecommendationId = null;

// 익명 방문자 식별자. 로그인 기능이 없으므로 개인을 특정하지 않고,
// "같은 브라우저의 연속된 행동"을 묶는 용도로만 쓴다.
function getSessionId() {
  let id = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_STORAGE_KEY, id);
  }
  return id;
}

// 클릭 수집. 실패해도 사용자 흐름을 막지 않는다.
//
// 같은 행동을 두 곳에 보낸다.
//  - Supabase : 키워드·조건별로 직접 질의해 사전을 개선하는 용도
//  - GA       : 유입/전환을 다른 채널 지표와 함께 보는 용도
function track(action, keyword, position) {
  // GA 이벤트. gtag가 차단당했거나 아직 안 떴을 수 있으니 존재를 확인하고 부른다.
  if (typeof window.gtag === "function") {
    window.gtag("event", action === "shopping_link" ? "shopping_link_click" : "card_flip", {
      keyword,
      position,
      recommendation_id: currentRecommendationId,
    });
  }

  try {
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: getSessionId(),
        recommendationId: currentRecommendationId,
        keyword,
        action,
        position,
      }),
      keepalive: true, // 링크 클릭으로 페이지를 떠나도 전송이 끊기지 않게
    }).catch(() => {});
  } catch (error) {
    /* 수집 실패는 무시한다 */
  }
}

document.addEventListener("DOMContentLoaded", initResultPage);

function initResultPage() {
  const preferences = readPreferences();
  const summaryEl = document.getElementById("resultKeywordLine");

  if (!preferences || !preferences.relation) {
    showResultError("선택하신 정보를 찾을 수 없어요. 이전 페이지에서 다시 선택해주세요.");
    return;
  }

  conditionSummary = buildSummary(preferences);
  summaryEl.textContent = `${conditionSummary} 기준 추천이에요`;

  fetchRanking(preferences);
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

// 예: { age:"30대", gender:"여성", relation:"연인", situation:"생일", budget:"3~5만원대" }
// → "30대 여성 · 연인 · 생일 · 3~5만원대"
function buildSummary(preferences) {
  // '성별 무관'은 조건이 아니라 "안 따짐"이므로 요약에 굳이 적지 않는다.
  const genderLabel = preferences.gender === "성별 무관" ? null : preferences.gender;
  const person = [preferences.age, genderLabel].filter(Boolean).join(" ");
  return [person, preferences.relation, preferences.situation, preferences.budget]
    .filter(Boolean)
    .join(" · ");
}

// 쇼핑 링크는 서버(api/gift-ranking)가 가격 필터까지 붙여 내려준다.
// 혹시 없으면 통합검색 쇼핑 탭으로 대신 보낸다.
// (쇼핑 전용 검색은 외부 유입을 차단하므로 폴백도 통합검색이어야 한다)
function shoppingUrlFor(item) {
  if (item.searchUrl) return item.searchUrl;
  const query = encodeURIComponent(`${item.keyword} 선물`);
  return `https://search.naver.com/search.naver?where=shop&query=${query}`;
}

async function fetchRanking(preferences) {
  const loadingEl = document.getElementById("resultLoading");
  const errorEl = document.getElementById("resultError");
  const cardGrid = document.getElementById("cardGrid");

  loadingEl.hidden = false;
  errorEl.hidden = true;
  cardGrid.innerHTML = "";

  try {
    const response = await fetch("/api/gift-ranking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        age: preferences.age,
        gender: preferences.gender,
        relation: preferences.relation,
        situation: preferences.situation,
        budget: preferences.budget,
        sessionId: getSessionId(),
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (data.code === "AUTH_FAILED" || data.code === "MISSING_CREDENTIALS") {
        showResultError("추천 데이터 서버 설정에 문제가 있어요. 잠시 후 다시 시도해주세요.");
        return;
      }
      showResultError(data.error || "추천 결과를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }

    currentRecommendationId = data.recommendationId ?? null;
    renderCards(data.items || [], preferences, data.meta || {});
  } catch (error) {
    showResultError("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
  } finally {
    loadingEl.hidden = true;
  }
}

function showResultError(message) {
  const errorEl = document.getElementById("resultError");
  errorEl.querySelector("p").textContent = message;
  errorEl.hidden = false;
}

function renderCards(items, preferences, meta) {
  const cardGrid = document.getElementById("cardGrid");
  cardGrid.innerHTML = "";

  if (items.length === 0) {
    const emptyEl = document.createElement("p");
    emptyEl.className = "result-empty";
    emptyEl.textContent = "조건에 맞는 추천을 찾지 못했어요. 다른 조합으로 시도해보세요.";
    cardGrid.appendChild(emptyEl);
    return;
  }

  // 예산·상황 조건을 완화해서 뽑은 결과라면 그 사실을 알린다.
  if (meta.relaxed) {
    const notice = document.createElement("p");
    notice.className = "result-relaxed-notice";
    notice.textContent =
      meta.relaxed === "budget"
        ? "선택하신 예산대에 후보가 적어 가격대 조건을 넓혀 추천했어요."
        : "조건에 맞는 후보가 적어 전체 후보에서 추천했어요.";
    cardGrid.parentElement.insertBefore(notice, cardGrid);
  }

  const segment =
    [preferences.age, preferences.gender === "성별 무관" ? null : preferences.gender]
      .filter(Boolean)
      .join(" ") || "전체";

  // 네이버 검색 링크로는 가격을 걸 수 없다(통합검색이 minPrice/maxPrice를 무시함).
  // 그래서 어떤 가격대를 보면 되는지 카드에서 직접 알려준다.
  const budgetHint = preferences.budget
    ? `<p class="card-back-budget"><i class="fa-solid fa-tag"></i> 쇼핑에서 <strong>${preferences.budget}</strong>로 골라보세요</p>`
    : "";

  items.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "card-flip";

    const link = shoppingUrlFor(item);

    // 이미지 조회에 실패한 항목은 사진 영역 없이 렌더링한다.
    const photo = item.image
      ? `<div class="card-photo">
           <img class="card-photo-img" src="${item.image}" alt="${item.imageAlt || item.keyword}"
                data-fallback="${item.imageFallback || ""}" loading="lazy" />
           <span class="card-rank">추천 ${index + 1}</span>
         </div>`
      : `<div class="card-photo card-photo-empty"><span class="card-rank">추천 ${index + 1}</span></div>`;

    card.innerHTML = `
      <div class="card-flip-inner">
        <div class="card-face card-front">
          ${photo}
          <div class="card-rank-body">
            <p class="card-keyword">${item.keyword}</p>
            <span class="card-category">${item.categoryName}</span>
            <span class="card-flip-hint"><i class="fa-solid fa-rotate"></i> 추천 이유 보기</span>
          </div>
        </div>
        <div class="card-face card-back">
          <p class="card-back-label">${segment} 인기도</p>
          <p class="card-back-score">${item.keywordRatio}</p>
          <p class="card-back-desc">
            ${item.categoryName} 분야에서 ${segment}의<br />최근 3개월 검색 클릭 지표예요
          </p>
          ${budgetHint}
          <a class="btn btn-primary card-buy-btn" href="${link}" target="_blank" rel="noopener noreferrer">네이버 쇼핑에서 보기</a>
          <span class="card-back-hint">다시 보기</span>
        </div>
      </div>
    `;

    // b400 확대본이 없는 이미지는 원본 썸네일(b150)로 되돌린다.
    const img = card.querySelector(".card-photo-img");
    if (img) {
      img.addEventListener("error", function handleError() {
        const fallback = img.dataset.fallback;
        if (fallback && img.src !== fallback) {
          img.src = fallback;
        } else {
          img.closest(".card-photo").classList.add("card-photo-empty");
          img.remove();
        }
      });
    }

    const rank = index + 1;

    // 쇼핑 링크로 나가는 클릭
    card.querySelector(".card-buy-btn").addEventListener("click", () => {
      track("shopping_link", item.keyword, rank);
    });

    // 카드 뒤집기. 같은 카드를 여러 번 뒤집어도 첫 번째만 센다.
    let flipLogged = false;
    card.addEventListener("click", (event) => {
      if (event.target.closest(".card-buy-btn")) return;
      card.classList.toggle("is-flipped");
      if (!flipLogged) {
        flipLogged = true;
        track("flip", item.keyword, rank);
      }
    });

    cardGrid.appendChild(card);
  });
}
