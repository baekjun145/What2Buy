// =========================================================
// What2Buy — recommend.js
// 1) Chip 선택 상태 관리 (연령/관계, 상황, 예산)
// 2) 선택값 실시간 미리보기 조합 + 필수값 예외 처리
// 3) '결과 보기' 제출 시 선택값을 localStorage에 저장하고 result.html로 이동
// =========================================================

const PREFERENCES_STORAGE_KEY = "what2buy_preferences";

document.addEventListener("DOMContentLoaded", () => {
  initChipSelectors();
  initFormSubmit();
});

// 사용자가 고른 세 가지 기준 (연령은 관계에 포함되는 선택 사항)
const selection = {
  age: null,
  gender: null,
  relation: null,
  situation: null,
  budget: null,
};

/* ---------------------------------------------------------
   1) Chip 선택 : 같은 data-field 그룹 내에서는 단일 선택,
      이미 선택된 칩을 다시 누르면 선택 해제된다.
   --------------------------------------------------------- */
function initChipSelectors() {
  const rows = document.querySelectorAll(".chip-select-row");

  rows.forEach((row) => {
    const field = row.dataset.field;

    row.addEventListener("click", (event) => {
      const chip = event.target.closest(".chip-select");
      if (!chip) return;

      const alreadyActive = chip.classList.contains("is-active");

      row.querySelectorAll(".chip-select").forEach((btn) => {
        btn.classList.remove("is-active");
        btn.setAttribute("aria-pressed", "false");
      });

      if (alreadyActive) {
        selection[field] = null;
      } else {
        chip.classList.add("is-active");
        chip.setAttribute("aria-pressed", "true");
        selection[field] = chip.dataset.value;
      }

      // 연령대는 선택 항목이라 자기 오류가 없다. 같은 그룹의 관계 오류를 지운다.
      clearFieldError(field === "age" ? "relation" : field);
      updateKeywordPreview();
    });
  });
}

/* ---------------------------------------------------------
   2) 선택값 미리보기 (실제 검색 키워드 조합은 result.js에서 처리)
   --------------------------------------------------------- */
function updateKeywordPreview() {
  const previewEl = document.getElementById("keywordPreview");
  // 상품 검색어가 아니라 "선택한 조건" 요약이다.
  // 실제 추천은 이 문자열이 아니라 아래 구조화된 값으로 이뤄진다.
  const person = [selection.age, selection.gender].filter(Boolean).join(" ");
  const parts = [person, selection.relation, selection.situation, selection.budget].filter(Boolean);

  if (parts.length > 0) {
    previewEl.textContent = parts.join(" · ");
    previewEl.classList.add("has-keyword");
  } else {
    previewEl.textContent = "선택을 완료하면 여기에 표시돼요";
    previewEl.classList.remove("has-keyword");
  }
}

// 필수 항목(관계·상황·예산) 중 선택하지 않은 값이 있는지 검사
function getMissingFields() {
  const missing = [];
  if (!selection.gender) missing.push({ field: "gender", label: "성별" });
  if (!selection.relation) missing.push({ field: "relation", label: "관계" });
  if (!selection.situation) missing.push({ field: "situation", label: "상황" });
  if (!selection.budget) missing.push({ field: "budget", label: "예산" });
  return missing;
}

function showFieldError(field, message) {
  const errorEl = document.querySelector(`.field-error[data-error-for="${field}"]`);
  if (errorEl) errorEl.textContent = message;
}

function clearFieldError(field) {
  showFieldError(field, "");
}

function clearAllFieldErrors() {
  document.querySelectorAll(".field-error").forEach((el) => (el.textContent = ""));
}

/* ---------------------------------------------------------
   3) 폼 제출 : 새로고침 차단 → 선택값 객체 수집 → localStorage 저장 → result.html 이동
   --------------------------------------------------------- */
function initFormSubmit() {
  const form = document.getElementById("recommendForm");
  form.addEventListener("submit", handleSubmit);
}

function handleSubmit(event) {
  event.preventDefault();

  clearAllFieldErrors();
  const missing = getMissingFields();

  if (missing.length > 0) {
    missing.forEach(({ field, label }) => showFieldError(field, `${label} 항목을 선택해주세요.`));

    // 자기 이름의 그룹이 없는 항목(성별 등)은 자기 칩 행이 속한 그룹으로 이동한다.
    const firstGroup =
      document.querySelector(`[data-group="${missing[0].field}"]`) ||
      document.querySelector(`[data-field="${missing[0].field}"]`)?.closest(".form-group");
    if (firstGroup) firstGroup.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  // 화면에서 선택한 세 가지 기준을 하나의 객체로 수집
  const preferences = {
    age: selection.age,
    gender: selection.gender,
    relation: selection.relation,
    situation: selection.situation,
    budget: selection.budget,
  };

  localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  window.location.href = "result.html";
}
