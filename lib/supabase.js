// =========================================================
// Supabase(PostgREST) 최소 클라이언트
//
// @supabase/supabase-js를 쓰지 않고 fetch로 직접 호출한다.
// 이 프로젝트는 빌드 단계가 없는 정적 사이트 + 서버리스 함수 구성이고,
// 여기서 필요한 건 insert / select 두 가지뿐이라 SDK를 얹을 이유가 없다.
//
// 호출은 전부 서버에서 service_role 키로만 한다. 모든 테이블에 RLS가 켜져 있어
// 브라우저에서 anon 키로는 아무것도 읽거나 쓸 수 없다.
// =========================================================

function credentials() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

// Supabase가 설정되지 않은 환경(로컬 초기 상태 등)에서도 앱이 죽지 않아야 한다.
function isConfigured() {
  return credentials() !== null;
}

function headers(extra = {}) {
  const { key } = credentials();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

// 행을 넣고, returning=representation이면 삽입된 행을 돌려받는다.
async function insert(table, rows, { returning = false } = {}) {
  const { url } = credentials();
  const response = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: headers({ Prefer: returning ? "return=representation" : "return=minimal" }),
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(`Supabase insert 실패 (${table}): ${response.status}`);
    error.detail = detail.slice(0, 300);
    throw error;
  }

  return returning ? response.json() : null;
}

// 있으면 덮어쓰고 없으면 넣는다. onConflict에는 unique 제약이 걸린 컬럼을 준다.
async function upsert(table, row, { onConflict }) {
  const { url } = credentials();
  const response = await fetch(
    `${url}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
    {
      method: "POST",
      headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(row),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(`Supabase upsert 실패 (${table}): ${response.status}`);
    error.detail = detail.slice(0, 300);
    throw error;
  }
}

// PostgREST 쿼리스트링을 그대로 받는다. 예: "select=*&is_active=eq.true"
async function select(table, query = "") {
  const { url } = credentials();
  const response = await fetch(`${url}/rest/v1/${table}?${query}`, { headers: headers() });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(`Supabase select 실패 (${table}): ${response.status}`);
    error.detail = detail.slice(0, 300);
    throw error;
  }

  return response.json();
}

module.exports = { isConfigured, insert, upsert, select };
