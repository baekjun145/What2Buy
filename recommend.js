// =========================================================
// What2Buy — recommend.js
// 1) 5단계 화면 전환 (한 번에 한 가지만 고르게 한다)
// 2) Chip 선택 상태 관리 (단일 선택 / 관심사만 다중 선택)
// 3) '결과 보기' 제출 시 선택값을 localStorage에 저장하고 result.html로 이동
// =========================================================

const PREFERENCES_STORAGE_KEY = "what2buy_preferences";

// 단계별로 반드시 골라야 하는 값. 여기 없는 단계는 건너뛸 수 있다.
// (연령대·MBTI·취미는 선택 항목)
const STEP_REQUIRED = {
  1: [
    { field: "gender", label: "성별" },
    { field: "relation", label: "관계" },
  ],
  2: [{ field: "situation", label: "상황" }],
  5: [{ field: "budget", label: "예산" }],
};

const STEP_HINTS = {
  1: "받는 분을 알려주세요",
  2: "어떤 상황인지 골라주세요",
  3: "모르면 건너뛰어도 괜찮아요",
  4: "최대 4개까지 고를 수 있어요",
  5: "마지막이에요",
};

const LAST_STEP = 5;

const selection = {
  age: null,
  gender: null,
  relation: null,
  situation: null,
  mbti: null,
  budget: null,
  interests: [],
};

let currentStep = 1;

document.addEventListener("DOMContentLoaded", () => {
  initChipSelectors();
  initStepNav();
  initFormSubmit();
  showStep(1);
});

/* ---------------------------------------------------------
   1) Chip 선택
      기본은 같은 data-field 안에서 단일 선택이고,
      data-multi가 붙은 행(관심사)만 그 숫자만큼 다중 선택된다.
      이미 고른 칩을 다시 누르면 해제된다.
   --------------------------------------------------------- */
function initChipSelectors() {
  document.querySelectorAll(".chip-select-row").forEach((row) => {
    const field = row.dataset.field;
    const multi = Number(row.dataset.multi) || 0;

    row.addEventListener("click", (event) => {
      const chip = event.target.closest(".chip-select");
      if (!chip) return;

      const value = chip.dataset.value;
      const active = chip.classList.contains("is-active");

      if (multi > 0) {
        if (active) {
          selection[field] = selection[field].filter((v) => v !== value);
        } else {
          // 한도를 넘으면 무시한다. 가장 오래된 것을 밀어내면 사용자가 뭘 잃었는지 모른다.
          if (selection[field].length >= multi) return;
          selection[field] = [...selection[field], value];
        }
        setChipState(chip, !active);
        updateMultiCount(row, multi);
      } else {
        // 같은 필드가 여러 줄로 나뉘어 있을 수 있으므로 필드 전체를 해제하고 다시 켠다.
        document
          .querySelectorAll(`.chip-select-row[data-field="${field}"] .chip-select`)
          .forEach((btn) => setChipState(btn, false));

        selection[field] = active ? null : value;
        if (!active) setChipState(chip, true);
      }

      clearFieldError(field);
      updateSummary();
    });
  });
}

function setChipState(chip, on) {
  chip.classList.toggle("is-active", on);
  chip.setAttribute("aria-pressed", on ? "true" : "false");
}

function updateMultiCount(row, max) {
  const counter = document.getElementById("interestCount");
  if (counter) counter.textContent = `${selection[row.dataset.field].length} / ${max}`;
}

/* ---------------------------------------------------------
   2) 단계 전환
   --------------------------------------------------------- */
function initStepNav() {
  document.getElementById("stepNext").addEventListener("click", () => {
    if (!validateStep(currentStep)) return;
    showStep(Math.min(currentStep + 1, LAST_STEP));
  });

  document.getElementById("stepBack").addEventListener("click", () => {
    showStep(Math.max(currentStep - 1, 1));
  });
}

function showStep(step) {
  currentStep = step;

  document.querySelectorAll(".form-step").forEach((el) => {
    el.hidden = Number(el.dataset.step) !== step;
  });

  document.getElementById("stepCurrent").textContent = String(step);
  document.getElementById("stepHint").textContent = STEP_HINTS[step] || "";

  const bar = document.getElementById("stepProgressBar");
  bar.style.width = `${(step / LAST_STEP) * 100}%`;
  bar.parentElement.setAttribute("aria-valuenow", String(step));

  document.getElementById("stepBack").hidden = step === 1;
  document.getElementById("stepNext").hidden = step === LAST_STEP;
  document.getElementById("submitBtn").hidden = step !== LAST_STEP;

  // 단계를 넘길 때마다 폼 위쪽이 보이게 한다. 스크롤이 남아 있으면
  // 새 단계의 제목이 화면 밖에 있어 아무것도 안 바뀐 것처럼 보인다.
  document.querySelector(".recommend-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

function validateStep(step) {
  const required = STEP_REQUIRED[step] || [];
  const missing = required.filter(({ field }) => !selection[field]);

  required.forEach(({ field }) => clearFieldError(field));
  missing.forEach(({ field, label }) => showFieldError(field, `${label} 항목을 선택해주세요.`));

  return missing.length === 0;
}

/* ---------------------------------------------------------
   3) 지금까지 고른 것 요약
   --------------------------------------------------------- */
function updateSummary() {
  const el = document.getElementById("keywordPreview");
  // '성별 무관'은 조건이 아니라 "안 따짐"이므로 요약에 적지 않는다.
  const genderLabel = selection.gender === "성별 무관" ? null : selection.gender;
  const person = [selection.age, genderLabel].filter(Boolean).join(" ");
  // 관심사는 쉼표로 잇는다. 구분자로 쓰는 '·'로 이으면
  // 'IT·가젯' 같은 값이 두 개로 갈라져 보인다.
  const parts = [
    person,
    selection.relation,
    selection.situation,
    selection.mbti,
    selection.interests.join(", "),
    selection.budget,
  ].filter(Boolean);

  el.textContent = parts.length > 0 ? parts.join(" · ") : "아직 고른 조건이 없어요";
  el.classList.toggle("has-keyword", parts.length > 0);
}

function showFieldError(field, message) {
  const errorEl = document.querySelector(`.field-error[data-error-for="${field}"]`);
  if (errorEl) errorEl.textContent = message;
}

function clearFieldError(field) {
  showFieldError(field, "");
}

/* ---------------------------------------------------------
   4) 제출 : 마지막 단계 검사 → localStorage 저장 → result.html
   --------------------------------------------------------- */
function initFormSubmit() {
  document.getElementById("recommendForm").addEventListener("submit", handleSubmit);
}

function handleSubmit(event) {
  event.preventDefault();

  // 마지막 단계뿐 아니라 앞 단계도 다시 확인한다.
  // 뒤로 갔다가 선택을 지운 채로 넘어왔을 수 있다.
  for (const step of Object.keys(STEP_REQUIRED).map(Number).sort((a, b) => a - b)) {
    if (!validateStep(step)) {
      showStep(step);
      return;
    }
  }

  localStorage.setItem(
    PREFERENCES_STORAGE_KEY,
    JSON.stringify({
      age: selection.age,
      gender: selection.gender,
      relation: selection.relation,
      situation: selection.situation,
      mbti: selection.mbti,
      interests: selection.interests,
      budget: selection.budget,
    })
  );
  window.location.href = "result.html";
}
