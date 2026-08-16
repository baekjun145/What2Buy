// =========================================================
// 후보 재순위 + 추천 이유 생성 (Upstage solar-pro3)
//
// [역할 분담]
// 쇼핑인사이트가 "이 연령·성별에게 무엇이 인기인지"를 정하고,
// 여기서는 그 상위 후보 안에서만 "이 사람에게 무엇이 어울리는지"를 고른다.
// MBTI·관계처럼 클릭 데이터로는 표현할 수 없는 조건이 반영되는 지점이다.
//
// [지켜야 할 것]
// 1. 모델은 후보 목록 밖의 물건을 만들어 낼 수 없다. 응답에서 목록에 없는
//    키워드는 버리고, 3개가 안 차면 원래 점수 순으로 메운다.
// 2. 실패·지연·키 없음은 전부 조용히 원래 순서로 되돌아간다.
//    추천 자체가 막히면 안 된다.
// 3. 인기 지수는 손대지 않는다. 카드에 적히는 숫자는 계속 실제 클릭 데이터다.
// =========================================================

const API_URL = "https://api.upstage.ai/v1/chat/completions";
const MODEL = "solar-pro3";

// 모델에 넘길 후보 수. 너무 적으면 고를 여지가 없고,
// 너무 많으면 응답이 길어져 느려진다.
const SHORTLIST = 8;

// 이 시간을 넘기면 포기하고 데이터 순서를 쓴다.
const TIMEOUT_MS = 6000;

function isConfigured() {
  return Boolean(process.env.UPSTAGE_API_KEY);
}

function buildPrompt(candidates, context) {
  const { age, gender, relation, situation, budget, mbti, interests } = context;

  const who = [age, gender && gender !== "성별 무관" ? gender : null, relation]
    .filter(Boolean)
    .join(" ");

  const lines = [
    `받는 사람: ${who || "정보 없음"}`,
    `상황: ${situation || "정보 없음"}`,
    `예산: ${budget || "정보 없음"}`,
  ];
  if (mbti) lines.push(`MBTI: ${mbti}`);
  if (interests?.length) lines.push(`취미·성향: ${interests.join(", ")}`);

  const list = candidates
    .map((c, i) => `${i + 1}. ${c.label} (분야: ${c.categoryName}, 인기지수: ${c.keywordRatio})`)
    .join("\n");

  return [
    {
      role: "system",
      content: [
        "당신은 한국의 선물 큐레이터입니다.",
        "주어진 후보 목록에서만 3개를 골라야 합니다. 목록에 없는 물건은 절대 만들지 마세요.",
        "각 선택에 대해 받는 사람의 조건과 연결지어 한 문장(40자 이내)으로 이유를 씁니다.",
        "가격을 단정하거나 없는 기능을 지어내지 마세요.",
        'JSON만 출력하세요. 형식: {"picks":[{"name":"후보이름","reason":"이유"}]}',
      ].join("\n"),
    },
    {
      role: "user",
      content: `${lines.join("\n")}\n\n후보:\n${list}\n\n이 사람에게 어울리는 순서로 3개를 고르세요.`,
    },
  ];
}

function parsePicks(text) {
  if (!text) return [];
  // 코드펜스나 앞뒤 설명이 섞여 와도 첫 JSON 객체만 뽑아 쓴다.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed.picks) ? parsed.picks : [];
  } catch (error) {
    return [];
  }
}

// scored: 점수 내림차순 정렬된 후보 (label/keyword/categoryName/keywordRatio 포함)
// 반환: 재정렬된 배열 (실패하면 입력을 그대로 돌려준다)
async function curate(scored, context) {
  if (!isConfigured() || scored.length === 0) return { items: scored, source: "score" };

  const shortlist = scored.slice(0, SHORTLIST);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.UPSTAGE_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        messages: buildPrompt(shortlist, context),
      }),
    });

    if (!response.ok) return { items: scored, source: "score" };

    const data = await response.json();
    const picks = parsePicks(data?.choices?.[0]?.message?.content);
    if (picks.length === 0) return { items: scored, source: "score" };

    // 이름으로 후보를 되찾는다. 표시명(label)과 실제 키워드 둘 다 받아 준다.
    const byName = new Map();
    for (const c of shortlist) {
      byName.set(c.label, c);
      byName.set(c.keyword, c);
    }

    const chosen = [];
    const used = new Set();
    for (const pick of picks) {
      const found = byName.get(String(pick?.name || "").trim());
      if (!found || used.has(found.label)) continue;
      used.add(found.label);
      const reason = String(pick?.reason || "").trim();
      chosen.push(reason ? { ...found, reason } : { ...found });
      if (chosen.length === 3) break;
    }

    if (chosen.length === 0) return { items: scored, source: "score" };

    // 모델이 3개를 못 채웠으면 남은 자리는 점수 순으로 메운다.
    for (const c of scored) {
      if (chosen.length >= 3) break;
      if (used.has(c.label)) continue;
      used.add(c.label);
      chosen.push(c);
    }

    return { items: chosen, source: "llm" };
  } catch (error) {
    // 타임아웃(abort) 포함. 추천은 계속 나가야 한다.
    return { items: scored, source: "score" };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { curate, isConfigured };
