// Vercel 서버리스 함수
// 클라이언트가 보낸 messages 배열을 그대로 Upstage Chat Completions API로 전달하고,
// Upstage의 응답 JSON을 그대로 돌려준다. API 키는 오직 process.env.UPSTAGE_API_KEY 로만 사용한다.

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST 요청만 지원합니다." });
    return;
  }

  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "서버에 UPSTAGE_API_KEY가 설정되어 있지 않습니다." });
    return;
  }

  try {
    const upstageResponse = await fetch("https://api.upstage.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "solar-pro3",
        messages: req.body.messages,
      }),
    });

    const data = await upstageResponse.json();
    res.status(upstageResponse.status).json(data);
  } catch (error) {
    res.status(500).json({ error: "Upstage 요청 중 오류가 발생했습니다." });
  }
};
