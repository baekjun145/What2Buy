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
  const relationPart = [selection.age, selection.relation].filter(Boolean).join(" ");
  const parts = [relationPart, selection.situation, selection.budget].filter(Boolean);

  if (parts.length > 0) {
    previewEl.textContent = `${parts.join(" ")} 선물`;
    previewEl.classList.add("has-keyword");
  } else {
    previewEl.textContent = "선택을 완료하면 여기에 표시돼요";
    previewEl.classList.remove("has-keyword");
  }
}

// 필수 항목(관계·상황·예산) 중 선택하지 않은 값이 있는지 검사
function getMissingFields() {
  const missing = [];
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

    const firstGroup = document.querySelector(`[data-group="${missing[0].field}"]`);
    if (firstGroup) firstGroup.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  // 화면에서 선택한 세 가지 기준을 하나의 객체로 수집
  const preferences = {
    age: selection.age,
    relation: selection.relation,
    situation: selection.situation,
    budget: selection.budget,
  };

  localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  window.location.href = "result.html";
}
