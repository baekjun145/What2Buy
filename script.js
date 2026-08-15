// =========================================================
// What2Buy — script.js
// 1) 스크롤 시 내비게이션 배경 전환
// 2) IntersectionObserver를 이용한 섹션 등장 효과
// 3) 내비 링크 클릭 시 부드러운 스크롤
// 4) AI 선물 큐레이터 챗봇
// =========================================================

// 챗봇 시스템 프롬프트 (What2Buy AI 선물 큐레이터의 성격과 답변 규칙 정의)
const SYSTEM_PROMPT = `너는 선물 추천 서비스 'What2Buy'의 스마트한 AI 선물 큐레이터야. 방문자에게 밝고 정중하게, 센스 있는 쇼핑 어드바이저처럼 답해. 답은 2~4문장, 마크다운 기호 없이 평문으로만 작성해. 아래 서비스 지식을 근거로 답하되, 지식에 없는 과도한 요구나 구체적인 상품 결제 및 배송 질문이 오면 "자세한 상품 정보 및 결제는 추천해 드리는 해당 쇼핑몰 링크에서 직접 확인하실 수 있습니다!"로 자연스럽게 안내해. 존재하지 않는 제휴사나 허위 할인 혜택을 만들어내지 마.`;

document.addEventListener("DOMContentLoaded", () => {
  initNavbarScroll();
  initFadeInSections();
  initSmoothScroll();
  initChatWidget();
});

/* ---------------------------------------------------------
   1) 스크롤하면 내비게이션에 배경 + 그림자 부여
   --------------------------------------------------------- */
function initNavbarScroll() {
  const navbar = document.getElementById("navbar");

  const updateNavbar = () => {
    if (window.scrollY > 10) {
      navbar.classList.add("scrolled");
    } else {
      navbar.classList.remove("scrolled");
    }
  };

  updateNavbar();
  window.addEventListener("scroll", updateNavbar);
}

/* ---------------------------------------------------------
   2) 섹션이 화면에 들어오면 아래에서 부드럽게 나타나는 효과
   --------------------------------------------------------- */
function initFadeInSections() {
  const targets = document.querySelectorAll(".fade-in-section");

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  targets.forEach((target) => observer.observe(target));
}

/* ---------------------------------------------------------
   3) 내비 링크 클릭 시 해당 섹션으로 부드럽게 스크롤
   --------------------------------------------------------- */
function initSmoothScroll() {
  const links = document.querySelectorAll('a[href^="#"]');

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetId = link.getAttribute("href");
      const targetEl = document.querySelector(targetId);

      if (!targetEl) return;

      event.preventDefault();
      targetEl.scrollIntoView({ behavior: "smooth" });
    });
  });
}

/* ---------------------------------------------------------
   4) AI 선물 큐레이터 챗봇

   [키 처리 규칙]
   - location.protocol === "file:" (로컬에서 파일로 열었을 때)
     → localStorage에 저장된 Upstage 키로 Upstage API에 직접 요청
     → 저장된 키가 없으면 첫 질문 시점에 한 번만 물어보고 저장
     → 401 인증 오류가 오면 저장된 키를 지우고 안내 메시지 표시
   - 그 외 (배포된 사이트)
     → 같은 도메인의 /api/chat 으로 요청 (프론트에는 키가 등장하지 않음)
   --------------------------------------------------------- */
function initChatWidget() {
  const widget = document.getElementById("chatWidget");
  const toggleBtn = document.getElementById("chatToggle");
  const closeBtn = document.getElementById("chatClose");
  const messagesEl = document.getElementById("chatMessages");
  const formEl = document.getElementById("chatForm");
  const inputEl = document.getElementById("chatInput");
  const sendBtn = document.getElementById("chatSend");

  const UPSTAGE_KEY_STORAGE = "what2buy-upstage-key";
  const isLocalFile = location.protocol === "file:";

  // 대화 기록 (시스템 프롬프트로 시작)
  const history = [{ role: "system", content: SYSTEM_PROMPT }];
  let isSending = false;

  toggleBtn.addEventListener("click", () => {
    widget.classList.toggle("is-open");
    if (widget.classList.contains("is-open")) {
      inputEl.focus();
    }
  });

  closeBtn.addEventListener("click", () => {
    widget.classList.remove("is-open");
  });

  formEl.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSend();
  });

  // 사용자 입력을 전송하고 응답을 받아 채팅창에 표시
  async function handleSend() {
    const text = inputEl.value.trim();
    if (!text || isSending) return;

    // 로컬 파일 모드에서 저장된 키가 없으면 최초 1회 입력받기
    if (isLocalFile && !localStorage.getItem(UPSTAGE_KEY_STORAGE)) {
      const key = window.prompt("Upstage API 키를 붙여넣어 주세요 (up_으로 시작)");
      if (!key) return;
      localStorage.setItem(UPSTAGE_KEY_STORAGE, key.trim());
    }

    inputEl.value = "";
    appendMessage("user", text);
    history.push({ role: "user", content: text });

    setSending(true);
    const loadingEl = appendLoading();

    try {
      const reply = await requestChatCompletion(history);
      loadingEl.remove();
      appendMessage("bot", reply);
      history.push({ role: "assistant", content: reply });
    } catch (error) {
      loadingEl.remove();

      if (isLocalFile && error.code === "UNAUTHORIZED") {
        localStorage.removeItem(UPSTAGE_KEY_STORAGE);
        appendMessage("bot", "키가 올바르지 않아요. 다시 질문하시면 새로 입력받을게요", true);
      } else {
        appendMessage("bot", "잠시 후 다시 시도해 주세요", true);
      }
    } finally {
      setSending(false);
    }
  }

  // 실행 환경에 따라 Upstage 직접 호출 또는 /api/chat 호출로 분기
  async function requestChatCompletion(messages) {
    let response;

    if (isLocalFile) {
      const apiKey = localStorage.getItem(UPSTAGE_KEY_STORAGE);

      response = await fetch("https://api.upstage.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: "solar-pro3", messages }),
      });

      if (response.status === 401) {
        const authError = new Error("Upstage 인증에 실패했습니다.");
        authError.code = "UNAUTHORIZED";
        throw authError;
      }
    } else {
      response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
    }

    if (!response.ok) {
      throw new Error("챗봇 응답 요청이 실패했습니다.");
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  // 전송 중 입력창/버튼을 잠가 중복 클릭을 방지
  function setSending(sending) {
    isSending = sending;
    sendBtn.disabled = sending;
    inputEl.disabled = sending;
  }

  function appendMessage(role, text, isError) {
    const bubble = document.createElement("div");
    bubble.className = `chat-message chat-message-${role === "user" ? "user" : "bot"}`;
    if (isError) bubble.classList.add("chat-message-error");
    // pre-wrap 이므로 앞뒤 공백/줄바꿈이 그대로 보인다
    bubble.textContent = String(text ?? "").trim();
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return bubble;
  }

  function appendLoading() {
    const bubble = document.createElement("div");
    bubble.className = "chat-message chat-message-bot chat-message-loading";
    bubble.innerHTML =
      '<span class="chat-typing-dot"></span><span class="chat-typing-dot"></span><span class="chat-typing-dot"></span>';
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return bubble;
  }
}
