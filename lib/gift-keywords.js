// =========================================================
// 선물 후보 키워드 사전
//
// category  : 네이버 쇼핑 카테고리 ID. 키워드가 이 카테고리에 실제로 속해야만
//             쇼핑인사이트가 데이터를 돌려준다. (틀리면 200 + 빈 배열이라 조용히 실패한다)
//             아래 키워드는 전부 실호출로 데이터가 나오는 것을 확인한 것들이다.
// budgets   : 가격대 태그. 쇼핑인사이트에는 가격 개념이 없어 직접 붙인 값이며,
//             실제 시세와 어긋날 수 있으므로 운영하며 조정이 필요하다.
// situations: 상황 태그. 마찬가지로 편집 판단이 들어간 값이다.
// =========================================================

const CATEGORY_NAMES = {
  "50000000": "패션의류",
  "50000001": "패션잡화",
  "50000002": "화장품/미용",
  "50000003": "디지털/가전",
  "50000004": "가구/인테리어",
  "50000006": "식품",
  "50000007": "스포츠/레저",
  "50000008": "생활/건강",
};

const BUDGET_TIERS = ["3만원 미만", "3~5만원대", "5~10만원대", "10만원 이상"];

// 예산 라벨 → 실제 가격 범위(원).
// 네이버 쇼핑 검색 링크의 가격 필터 파라미터로 넘긴다.
// 이전에는 "3~5만원대"를 검색어에 그대로 붙였는데, 그러면 가격으로 거르는 게 아니라
// 상품명에 "3만원대"가 들어간 상품을 찾게 되어 가격대가 뒤죽박죽이 됐다.
const BUDGET_PRICE_RANGE = {
  "3만원 미만": { minPrice: null, maxPrice: 30000 },
  "3~5만원대": { minPrice: 30000, maxPrice: 50000 },
  "5~10만원대": { minPrice: 50000, maxPrice: 100000 },
  "10만원 이상": { minPrice: 100000, maxPrice: null },
};

const SITUATIONS = ["생일", "1주년", "명절", "졸업·입학", "승진·이직", "감사 인사", "집들이"];

const KEYWORDS = [
  // ---- 패션의류 ----
  { keyword: "니트", category: "50000000", budgets: ["3~5만원대", "5~10만원대"], situations: ["생일", "졸업·입학"] },
  { keyword: "코트", category: "50000000", budgets: ["5~10만원대", "10만원 이상"], situations: ["생일", "1주년"] },
  { keyword: "잠옷", category: "50000000", budgets: ["3만원 미만", "3~5만원대"], situations: ["생일", "1주년", "감사 인사"] },
  { keyword: "티셔츠", category: "50000000", budgets: ["3만원 미만", "3~5만원대"], situations: ["생일", "졸업·입학"] },

  // ---- 패션잡화 ----
  { keyword: "지갑", category: "50000001", budgets: ["3~5만원대", "5~10만원대"], situations: ["생일", "승진·이직", "졸업·입학"] },
  { keyword: "목걸이", category: "50000001", budgets: ["3~5만원대", "5~10만원대"], situations: ["생일", "1주년"] },
  { keyword: "시계", category: "50000001", budgets: ["5~10만원대", "10만원 이상"], situations: ["생일", "승진·이직", "졸업·입학"] },
  { keyword: "귀걸이", category: "50000001", budgets: ["3만원 미만", "3~5만원대"], situations: ["생일", "1주년"] },
  { keyword: "가방", category: "50000001", budgets: ["5~10만원대", "10만원 이상"], situations: ["생일", "승진·이직"] },
  { keyword: "벨트", category: "50000001", budgets: ["3만원 미만", "3~5만원대"], situations: ["승진·이직", "생일"] },
  { keyword: "머플러", category: "50000001", budgets: ["3만원 미만", "3~5만원대"], situations: ["생일", "감사 인사"] },
  { keyword: "선글라스", category: "50000001", budgets: ["3~5만원대", "5~10만원대"], situations: ["생일", "졸업·입학"] },
  { keyword: "반지", category: "50000001", budgets: ["3~5만원대", "5~10만원대"], situations: ["1주년", "생일"] },
  { keyword: "모자", category: "50000001", budgets: ["3만원 미만", "3~5만원대"], situations: ["생일", "졸업·입학"] },

  // ---- 화장품/미용 ----
  { keyword: "향수", category: "50000002", budgets: ["5~10만원대", "10만원 이상"], situations: ["생일", "1주년", "감사 인사"] },
  { keyword: "핸드크림", category: "50000002", budgets: ["3만원 미만"], situations: ["감사 인사", "생일", "명절"] },
  { keyword: "립스틱", category: "50000002", budgets: ["3만원 미만", "3~5만원대"], situations: ["생일", "1주년"] },
  { keyword: "바디로션", category: "50000002", budgets: ["3만원 미만", "3~5만원대"], situations: ["감사 인사", "생일"] },
  { keyword: "헤어에센스", category: "50000002", budgets: ["3만원 미만", "3~5만원대"], situations: ["감사 인사", "생일"] },
  { keyword: "스킨케어세트", category: "50000002", budgets: ["3~5만원대", "5~10만원대"], situations: ["명절", "감사 인사", "생일"] },
  { keyword: "선크림", category: "50000002", budgets: ["3만원 미만"], situations: ["감사 인사", "생일"] },
  { keyword: "마스크팩", category: "50000002", budgets: ["3만원 미만"], situations: ["감사 인사", "명절"] },

  // ---- 디지털/가전 ----
  { keyword: "무선이어폰", category: "50000003", budgets: ["5~10만원대", "10만원 이상"], situations: ["생일", "졸업·입학", "승진·이직"] },
  { keyword: "블루투스스피커", category: "50000003", budgets: ["3~5만원대", "5~10만원대"], situations: ["생일", "집들이"] },
  { keyword: "보조배터리", category: "50000003", budgets: ["3만원 미만", "3~5만원대"], situations: ["졸업·입학", "생일"] },
  { keyword: "스마트워치", category: "50000003", budgets: ["10만원 이상"], situations: ["생일", "승진·이직", "졸업·입학"] },
  { keyword: "무선키보드", category: "50000003", budgets: ["3~5만원대", "5~10만원대"], situations: ["승진·이직", "졸업·입학"] },
  { keyword: "무선마우스", category: "50000003", budgets: ["3만원 미만", "3~5만원대"], situations: ["승진·이직", "졸업·입학"] },
  { keyword: "태블릿", category: "50000003", budgets: ["10만원 이상"], situations: ["졸업·입학", "생일"] },
  { keyword: "헤드폰", category: "50000003", budgets: ["5~10만원대", "10만원 이상"], situations: ["생일", "졸업·입학"] },

  // ---- 가구/인테리어 ----
  { keyword: "디퓨저", category: "50000004", budgets: ["3만원 미만", "3~5만원대"], situations: ["집들이", "감사 인사", "생일"] },
  { keyword: "무드등", category: "50000004", budgets: ["3만원 미만", "3~5만원대"], situations: ["집들이", "생일"] },
  { keyword: "쿠션", category: "50000004", budgets: ["3만원 미만", "3~5만원대"], situations: ["집들이"] },
  { keyword: "액자", category: "50000004", budgets: ["3만원 미만", "3~5만원대"], situations: ["집들이", "1주년"] },
  { keyword: "러그", category: "50000004", budgets: ["3~5만원대", "5~10만원대"], situations: ["집들이"] },
  { keyword: "캔들", category: "50000004", budgets: ["3만원 미만"], situations: ["집들이", "감사 인사", "1주년"] },
  { keyword: "수납장", category: "50000004", budgets: ["5~10만원대", "10만원 이상"], situations: ["집들이"] },

  // ---- 식품 ----
  { keyword: "홍삼", category: "50000006", budgets: ["5~10만원대", "10만원 이상"], situations: ["명절", "감사 인사"] },
  { keyword: "견과류", category: "50000006", budgets: ["3~5만원대"], situations: ["명절", "감사 인사"] },
  { keyword: "커피원두", category: "50000006", budgets: ["3만원 미만", "3~5만원대"], situations: ["감사 인사", "집들이"] },
  { keyword: "차선물세트", category: "50000006", budgets: ["3만원 미만", "3~5만원대"], situations: ["명절", "감사 인사", "집들이"] },
  { keyword: "초콜릿", category: "50000006", budgets: ["3만원 미만"], situations: ["생일", "1주년", "감사 인사"] },
  { keyword: "과일선물세트", category: "50000006", budgets: ["3~5만원대", "5~10만원대"], situations: ["명절", "감사 인사"] },
  { keyword: "한우세트", category: "50000006", budgets: ["10만원 이상"], situations: ["명절", "감사 인사"] },
  { keyword: "꿀", category: "50000006", budgets: ["3만원 미만", "3~5만원대"], situations: ["명절", "감사 인사"] },

  // ---- 스포츠/레저 ----
  { keyword: "텀블러", category: "50000007", budgets: ["3만원 미만"], situations: ["감사 인사", "생일", "졸업·입학"] },
  { keyword: "요가매트", category: "50000007", budgets: ["3만원 미만", "3~5만원대"], situations: ["생일", "집들이"] },
  { keyword: "등산화", category: "50000007", budgets: ["5~10만원대", "10만원 이상"], situations: ["생일", "명절"] },
  { keyword: "캠핑의자", category: "50000007", budgets: ["3~5만원대", "5~10만원대"], situations: ["생일", "집들이"] },
  { keyword: "골프공", category: "50000007", budgets: ["3만원 미만", "3~5만원대"], situations: ["승진·이직", "감사 인사"] },
  { keyword: "자전거헬멧", category: "50000007", budgets: ["3~5만원대"], situations: ["생일"] },
  { keyword: "런닝화", category: "50000007", budgets: ["5~10만원대", "10만원 이상"], situations: ["생일", "졸업·입학"] },
  { keyword: "물통", category: "50000007", budgets: ["3만원 미만"], situations: ["졸업·입학", "감사 인사"] },

  // ---- 생활/건강 ----
  { keyword: "칫솔살균기", category: "50000008", budgets: ["3만원 미만", "3~5만원대"], situations: ["집들이", "감사 인사"] },
  { keyword: "안마기", category: "50000008", budgets: ["5~10만원대", "10만원 이상"], situations: ["명절", "감사 인사", "생일"] },
  { keyword: "수건세트", category: "50000008", budgets: ["3만원 미만", "3~5만원대"], situations: ["집들이", "감사 인사"] },
  { keyword: "주방세제선물세트", category: "50000008", budgets: ["3만원 미만"], situations: ["집들이", "감사 인사"] },
  { keyword: "공기청정기", category: "50000008", budgets: ["10만원 이상"], situations: ["집들이", "명절"] },
  { keyword: "족욕기", category: "50000008", budgets: ["3~5만원대", "5~10만원대"], situations: ["명절", "감사 인사"] },
];

module.exports = { CATEGORY_NAMES, BUDGET_TIERS, BUDGET_PRICE_RANGE, SITUATIONS, KEYWORDS };
