// Vercel 서버리스 함수 — 추천 결과 만족도(별점) 수집
//
// 추천 1건당 1행이고, 다시 매기면 덮어쓴다(on_conflict=recommendation_id).
// 수집이 실패해도 사용자에게 오류로 돌려주지 않는다. 별점은 부가 기능이다.

const supabase = require("../lib/supabase");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST 요청만 지원합니다." });
    return;
  }

  if (!supabase.isConfigured()) {
    res.status(202).json({ ok: false, skipped: "supabase_not_configured" });
    return;
  }

  const { sessionId, recommendationId, rating } = req.body || {};
  const score = Number(rating);

  if (!UUID_PATTERN.test(String(sessionId || ""))) {
    res.status(400).json({ error: "sessionId 형식이 올바르지 않습니다." });
    return;
  }
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    res.status(400).json({ error: "rating은 1~5 사이 정수여야 합니다." });
    return;
  }
  // 추천 id가 없으면 어떤 추천에 대한 평가인지 알 수 없어 저장할 의미가 없다.
  if (!Number.isInteger(Number(recommendationId))) {
    res.status(202).json({ ok: false, skipped: "no_recommendation_id" });
    return;
  }

  try {
    await supabase.upsert(
      "result_ratings",
      {
        session_id: sessionId,
        recommendation_id: Number(recommendationId),
        rating: score,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "recommendation_id" }
    );

    res.status(201).json({ ok: true });
  } catch (error) {
    res.status(202).json({ ok: false });
  }
};
