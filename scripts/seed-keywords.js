// 코드에 있는 키워드 사전을 Supabase gift_keywords 테이블로 밀어 넣는다.
//
//   node scripts/seed-keywords.js
//
// keyword가 unique라 upsert로 동작한다. 여러 번 돌려도 중복이 생기지 않고,
// 코드 사전을 고친 뒤 다시 돌리면 DB가 그 값으로 갱신된다.
// (DB에서 직접 수정한 값도 덮어쓰므로, DB를 손으로 고치기 시작한 뒤에는 주의)

const fs = require("fs");
const path = require("path");

// .env.local을 읽어 process.env에 채운다. 이 스크립트는 Next.js가 아니라 자동 로드가 안 된다.
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const { CATEGORY_NAMES, KEYWORDS } = require("../lib/gift-keywords");

const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다 (.env.local 확인)");
  process.exit(1);
}

const rows = KEYWORDS.map((k) => ({
  keyword: k.keyword,
  category_id: k.category,
  category_name: CATEGORY_NAMES[k.category] || k.category,
  audience: k.audience || "adult",
  budgets: k.budgets,
  situations: k.situations,
  is_active: true,
  updated_at: new Date().toISOString(),
}));

(async () => {
  const response = await fetch(`${url}/rest/v1/gift_keywords?on_conflict=keyword`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(rows),
  });

  const body = await response.text();

  if (!response.ok) {
    console.error(`실패 (HTTP ${response.status})`);
    console.error(body.slice(0, 500));
    process.exit(1);
  }

  const saved = JSON.parse(body);
  console.log(`gift_keywords 반영 완료: ${saved.length}개`);

  const byCategory = {};
  for (const row of saved) {
    byCategory[row.category_name] = (byCategory[row.category_name] || 0) + 1;
  }
  for (const [name, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name.padEnd(14)} ${count}개`);
  }
})();
