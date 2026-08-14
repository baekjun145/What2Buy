// Vercel 서버리스 함수 — 클릭 이벤트 수집
//
// 브라우저가 Supabase를 직접 부르지 않고 이 엔드포인트를 경유한다.
// DB 키가 브라우저에 노출되지 않고, 어떤 값이 들어올 수 있는지도 여기서 통제한다.
//
// 추천 조회 이력은 /api/gift-ranking이 직접 남기고, 여기서는 그 이후의
// 사용자 행동(카드 뒤집기, 쇼핑 링크 클릭)만 받는다.

const supabase = require("../lib/supabase");

const ALLOWED_ACTIONS = ["flip", "shopping_link"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST 요청만 지원합니다." });
    return;
  }

  // 수집이 안 되더라도 사용자 경험은 영향받지 않아야 한다. 조용히 성공 처리한다.
  if (!supabase.isConfigured()) {
    res.status(202).json({ ok: false, skipped: "supabase_not_configured" });
    return;
  }

  const { sessionId, recommendationId, keyword, action, position } = req.body || {};

  if (!UUID_PATTERN.test(String(sessionId || ""))) {
    res.status(400).json({ error: "sessionId 형식이 올바르지 않습니다." });
    return;
  }
  if (!ALLOWED_ACTIONS.includes(action)) {
    res.status(400).json({ error: "지원하지 않는 action 입니다." });
    return;
  }
  if (!keyword || typeof keyword !== "string") {
    res.status(400).json({ error: "keyword가 필요합니다." });
    return;
  }

  const rank = Number(position);

  try {
    await supabase.insert("click_events", {
      session_id: sessionId,
      recommendation_id: Number.isInteger(Number(recommendationId)) ? Number(recommendationId) : null,
      keyword: keyword.slice(0, 100),
      action,
      position: Number.isInteger(rank) && rank >= 1 && rank <= 10 ? rank : null,
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    // 수집 실패를 사용자에게 오류로 돌려주지 않는다.
    res.status(202).json({ ok: false });
  }
};
