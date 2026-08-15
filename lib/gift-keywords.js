// =========================================================
// 선물 후보 키워드 사전
//
// category  : 네이버 쇼핑 카테고리 ID. 키워드가 이 카테고리에 실제로 속해야만
//             쇼핑인사이트가 데이터를 돌려준다. (틀리면 200 + 빈 배열이라 조용히 실패한다)
//             아래 키워드는 전부 실호출로 데이터가 나오는 것을 확인한 것들이다.
// audience  : 받는 사람 유형. 'adult' | 'kids'
//             연령대에서 '영유아/아동'을 고르면 kids만, 그 외에는 adult만 후보가 된다.
//             쇼핑인사이트의 ages 파라미터는 10대~60대만 있어 영유아를 표현할 수 없으므로
//             이 구분은 API가 아니라 사전에서 처리한다.
// budgets   : 가격대 태그. 쇼핑인사이트에는 가격 개념이 없어 직접 붙인 값이며,
//             실제 시세와 어긋날 수 있으므로 운영하며 조정이 필요하다.
// situations: 상황 태그. 마찬가지로 편집 판단이 들어간 값이다.
// label     : 카드에 표시할 이름. 없으면 keyword를 그대로 쓴다.
//             브랜드 키워드에만 붙인다. 순위·검색 링크·사진·통계는 전부 keyword로
//             돌아가고, 사용자에게 보이는 제목만 label로 바꾼다.
//             ('톰포드립스틱' 대신 '립스틱'으로 보이되, 링크는 톰포드로 간다)
//             DB(gift_keywords)에는 label 컬럼이 없으므로, 대시보드에서 키워드를
//             새로 추가하면 label 없이 keyword가 그대로 표시된다.
// =========================================================

const CATEGORY_NAMES = {
  "50000000": "패션의류",
  "50000001": "패션잡화",
  "50000002": "화장품/미용",
  "50000003": "디지털/가전",
  "50000004": "가구/인테리어",
  "50000005": "출산/육아",
  "50000006": "식품",
  "50000007": "스포츠/레저",
  "50000008": "생활/건강",
};

const BUDGET_TIERS = ["3만원 미만", "3~5만원대", "5~10만원대", "10만원 이상"];

const SITUATIONS = [
  "생일",
  "기념일",
  "명절",
  "졸업·입학",
  "승진·이직",
  "감사 인사",
  "집들이",
  "임신·출산",
  "응원·위로",
];

const KEYWORDS = [
  // ---- 패션의류 ----
  { keyword: "니트", category: "50000000", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["생일", "졸업·입학"] },
  { keyword: "코트", category: "50000000", audience: "adult", budgets: ["5~10만원대", "10만원 이상"], situations: ["생일", "기념일"] },
  { keyword: "잠옷", category: "50000000", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["생일", "기념일", "감사 인사", "임신·출산"] },
  { keyword: "티셔츠", category: "50000000", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["생일", "졸업·입학"] },
  { keyword: "홈웨어", category: "50000000", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["응원·위로", "생일", "기념일", "임신·출산"] },
  { keyword: "카디건", category: "50000000", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["응원·위로", "생일"] },

  // ---- 패션잡화 ----
  // 연인 기념일 선물로는 어울리지 않아 기념일에서 뺐다. 승진·졸업 선물로는 그대로 둔다.
  { keyword: "지갑", category: "50000001", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["생일", "승진·이직", "졸업·입학"] },
  // 선물로 주고받는 목걸이·반지는 3만원대에 잘 없다. 그 아래는 귀걸이가 받는다.
  { keyword: "목걸이", category: "50000001", audience: "adult", budgets: ["5~10만원대", "10만원 이상"], situations: ["생일", "기념일"] },
  { keyword: "시계", category: "50000001", audience: "adult", budgets: ["5~10만원대", "10만원 이상"], situations: ["생일", "승진·이직", "졸업·입학", "기념일"] },
  { keyword: "귀걸이", category: "50000001", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["생일"] },
  { keyword: "가방", category: "50000001", audience: "adult", budgets: ["5~10만원대", "10만원 이상"], situations: ["생일", "승진·이직", "기념일"] },
  { keyword: "벨트", category: "50000001", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["승진·이직", "생일"] },
  { keyword: "머플러", category: "50000001", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["생일", "감사 인사"] },
  { keyword: "선글라스", category: "50000001", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["생일", "졸업·입학"] },
  { keyword: "반지", category: "50000001", audience: "adult", budgets: ["5~10만원대", "10만원 이상"], situations: ["기념일", "생일"] },
  { keyword: "모자", category: "50000001", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["생일", "졸업·입학"] },
  { keyword: "카드지갑", category: "50000001", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["승진·이직", "감사 인사", "졸업·입학"] },
  { keyword: "넥타이", category: "50000001", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["승진·이직", "감사 인사"] },
  { keyword: "명함지갑", category: "50000001", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["승진·이직"] },
  { keyword: "서류가방", category: "50000001", audience: "adult", budgets: ["5~10만원대", "10만원 이상"], situations: ["승진·이직"] },

  // ---- 화장품/미용 ----
  // 3만원대는 30ml 미니어처 정도라 선물로 주고받는 크기가 아니다. 목걸이·반지와 같은 판단.
  { keyword: "향수", category: "50000002", audience: "adult", budgets: ["5~10만원대", "10만원 이상"], situations: ["생일", "기념일", "감사 인사"] },
  // 일반 '핸드크림'은 3천원짜리까지 딸려 나와 선물로 안 어울린다.
  // 브랜드를 지정해 가격대와 격을 함께 고정한다. 총칭이 필요할 땐 '고급핸드크림'이 받는다.
  { keyword: "고급핸드크림", category: "50000002", audience: "adult", label: "핸드크림", budgets: ["3~5만원대", "5~10만원대"], situations: ["감사 인사", "생일", "명절"] },
  { keyword: "이솝핸드크림", category: "50000002", audience: "adult", label: "핸드크림", budgets: ["3~5만원대", "5~10만원대"], situations: ["감사 인사", "생일"] },
  { keyword: "논픽션핸드크림", category: "50000002", audience: "adult", label: "핸드크림", budgets: ["3~5만원대"], situations: ["감사 인사", "생일"] },
  // 핸드크림 중에서는 이게 가장 강하다(20대 여성 기준 24.9 vs 이솝 15.5, 논픽션 3.6).
  { keyword: "록시땅핸드크림", category: "50000002", audience: "adult", label: "핸드크림", budgets: ["3만원 미만", "3~5만원대"], situations: ["감사 인사", "명절", "생일"] },

  // 립스틱은 브랜드에 따라 가격대가 갈린다. 맥은 3만원대, 샤넬·디올·입생로랑은
  // 5만원 전후, 톰포드는 9만원대라 예산 태그를 각각 다르게 붙였다.
  { keyword: "립스틱", category: "50000002", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["생일"] },
  { keyword: "맥립스틱", category: "50000002", audience: "adult", label: "립스틱", budgets: ["3~5만원대"], situations: ["생일", "기념일"] },
  { keyword: "샤넬립스틱", category: "50000002", audience: "adult", label: "립스틱", budgets: ["3~5만원대", "5~10만원대"], situations: ["생일", "기념일"] },
  { keyword: "디올립스틱", category: "50000002", audience: "adult", label: "립스틱", budgets: ["3~5만원대", "5~10만원대"], situations: ["생일", "기념일"] },
  { keyword: "입생로랑립스틱", category: "50000002", audience: "adult", label: "립스틱", budgets: ["3~5만원대", "5~10만원대"], situations: ["생일", "기념일"] },
  { keyword: "톰포드립스틱", category: "50000002", audience: "adult", label: "립스틱", budgets: ["5~10만원대", "10만원 이상"], situations: ["기념일", "생일"] },
  { keyword: "바디로션", category: "50000002", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["감사 인사", "생일", "임신·출산"] },
  { keyword: "바디오일", category: "50000002", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["임신·출산", "감사 인사"] },
  { keyword: "헤어에센스", category: "50000002", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["감사 인사", "생일"] },
  { keyword: "스킨케어세트", category: "50000002", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["명절", "감사 인사", "생일"] },
  { keyword: "선크림", category: "50000002", audience: "adult", budgets: ["3만원 미만"], situations: ["감사 인사", "생일"] },
  { keyword: "마스크팩", category: "50000002", audience: "adult", budgets: ["3만원 미만"], situations: ["감사 인사", "명절"] },
  { keyword: "아로마오일", category: "50000002", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["응원·위로", "집들이"] },
  { keyword: "바디미스트", category: "50000002", audience: "adult", budgets: ["3만원 미만"], situations: ["응원·위로", "감사 인사"] },
  { keyword: "수분크림", category: "50000002", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["응원·위로", "감사 인사"] },

  // ---- 디지털/가전 ----
  { keyword: "무선이어폰", category: "50000003", audience: "adult", budgets: ["5~10만원대", "10만원 이상"], situations: ["생일", "졸업·입학", "승진·이직"] },
  { keyword: "블루투스스피커", category: "50000003", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["생일", "집들이"] },
  { keyword: "보조배터리", category: "50000003", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["졸업·입학", "생일"] },
  { keyword: "스마트워치", category: "50000003", audience: "adult", budgets: ["10만원 이상"], situations: ["생일", "승진·이직", "졸업·입학"] },
  { keyword: "무선키보드", category: "50000003", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["승진·이직", "졸업·입학"] },
  { keyword: "무선마우스", category: "50000003", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["승진·이직", "졸업·입학"] },
  { keyword: "태블릿", category: "50000003", audience: "adult", budgets: ["10만원 이상"], situations: ["졸업·입학", "생일"] },
  { keyword: "헤드폰", category: "50000003", audience: "adult", budgets: ["5~10만원대", "10만원 이상"], situations: ["생일", "졸업·입학"] },
  { keyword: "노트북거치대", category: "50000003", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["승진·이직", "졸업·입학"] },
  { keyword: "무선충전기", category: "50000003", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["승진·이직", "졸업·입학"] },
  { keyword: "커피머신", category: "50000003", audience: "adult", budgets: ["5~10만원대", "10만원 이상"], situations: ["집들이", "승진·이직", "감사 인사"] },
  { keyword: "에어프라이어", category: "50000003", audience: "adult", budgets: ["5~10만원대", "10만원 이상"], situations: ["집들이"] },
  { keyword: "무선청소기", category: "50000003", audience: "adult", budgets: ["10만원 이상"], situations: ["집들이", "임신·출산"] },
  { keyword: "전기그릴", category: "50000003", audience: "adult", budgets: ["5~10만원대", "10만원 이상"], situations: ["집들이"] },
  { keyword: "전기포트", category: "50000003", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["집들이"] },
  { keyword: "가습기", category: "50000003", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["집들이", "응원·위로", "임신·출산"] },

  // ---- 가구/인테리어 ----
  { keyword: "디퓨저", category: "50000004", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["집들이", "감사 인사", "생일", "기념일"] },
  { keyword: "무드등", category: "50000004", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["집들이", "생일", "기념일"] },
  { keyword: "쿠션", category: "50000004", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["집들이"] },
  { keyword: "액자", category: "50000004", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["집들이", "기념일"] },
  { keyword: "러그", category: "50000004", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["집들이"] },
  { keyword: "캔들", category: "50000004", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["집들이", "감사 인사", "기념일"] },
  { keyword: "수납장", category: "50000004", audience: "adult", budgets: ["5~10만원대", "10만원 이상"], situations: ["집들이"] },
  { keyword: "꽃병", category: "50000004", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["응원·위로", "집들이"] },
  { keyword: "방향제", category: "50000004", audience: "adult", budgets: ["3만원 미만"], situations: ["응원·위로", "집들이"] },
  { keyword: "스탠드조명", category: "50000004", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["집들이"] },
  { keyword: "행거", category: "50000004", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["집들이"] },
  { keyword: "수납선반", category: "50000004", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["집들이"] },
  { keyword: "테이블", category: "50000004", audience: "adult", budgets: ["10만원 이상"], situations: ["집들이"] },

  // ---- 출산/육아 (영유아·아동 / 임신·출산) ----
  { keyword: "신생아선물세트", category: "50000005", audience: "kids", budgets: ["3~5만원대", "5~10만원대"], situations: ["임신·출산"] },
  { keyword: "배냇저고리", category: "50000005", audience: "kids", budgets: ["3만원 미만", "3~5만원대"], situations: ["임신·출산"] },
  { keyword: "기저귀케이크", category: "50000005", audience: "kids", budgets: ["3~5만원대", "5~10만원대"], situations: ["임신·출산"] },
  // 아래 산모용 키워드는 받는 사람이 아기가 아니라 어른이다.
  // audience를 kids로 두면 '영유아/아동'을 고른 사람에게만 보여서, 정작
  // 산모 선물을 찾는(= 연령대를 20~40대로 고르는) 사람에게 후보가 하나도 없게 된다.
  { keyword: "수유쿠션", category: "50000005", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["임신·출산"] },
  { keyword: "임산부선물", category: "50000005", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["임신·출산"] },
  { keyword: "수유브라", category: "50000005", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["임신·출산"] },
  { keyword: "임산부방석", category: "50000005", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["임신·출산"] },
  { keyword: "산모용품", category: "50000005", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["임신·출산"] },
  { keyword: "임산부선물세트", category: "50000005", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["임신·출산"] },
  { keyword: "아기띠", category: "50000005", audience: "kids", budgets: ["5~10만원대", "10만원 이상"], situations: ["임신·출산"] },
  { keyword: "유모차", category: "50000005", audience: "kids", budgets: ["10만원 이상"], situations: ["임신·출산"] },
  { keyword: "아기장난감", category: "50000005", audience: "kids", budgets: ["3만원 미만", "3~5만원대"], situations: ["생일", "임신·출산", "응원·위로", "명절"] },
  { keyword: "미끄럼틀", category: "50000005", audience: "kids", budgets: ["5~10만원대", "10만원 이상"], situations: ["생일"] },
  { keyword: "아기체육관", category: "50000005", audience: "kids", budgets: ["3~5만원대", "5~10만원대"], situations: ["생일", "임신·출산"] },
  { keyword: "카시트", category: "50000005", audience: "kids", budgets: ["5~10만원대", "10만원 이상"], situations: ["임신·출산", "생일"] },
  { keyword: "유아텐트", category: "50000005", audience: "kids", budgets: ["3~5만원대", "5~10만원대", "10만원 이상"], situations: ["생일"] },
  { keyword: "아기욕조", category: "50000005", audience: "kids", budgets: ["3만원 미만", "3~5만원대"], situations: ["임신·출산"] },
  { keyword: "유아한복", category: "50000005", audience: "kids", budgets: ["3~5만원대", "5~10만원대"], situations: ["명절"] },
  { keyword: "유아자전거", category: "50000005", audience: "kids", budgets: ["5~10만원대", "10만원 이상"], situations: ["생일"] },
  { keyword: "유아책상", category: "50000005", audience: "kids", budgets: ["5~10만원대", "10만원 이상"], situations: ["졸업·입학", "생일"] },
  { keyword: "아동복", category: "50000005", audience: "kids", budgets: ["3만원 미만", "3~5만원대"], situations: ["생일", "명절", "졸업·입학"] },
  { keyword: "원목장난감", category: "50000005", audience: "kids", budgets: ["3~5만원대", "5~10만원대", "10만원 이상"], situations: ["생일"] },
  { keyword: "유아신발", category: "50000005", audience: "kids", budgets: ["3만원 미만", "3~5만원대"], situations: ["생일", "명절"] },
  { keyword: "역할놀이", category: "50000005", audience: "kids", budgets: ["3~5만원대", "5~10만원대"], situations: ["생일"] },
  { keyword: "킥보드", category: "50000005", audience: "kids", budgets: ["3~5만원대", "5~10만원대"], situations: ["생일"] },
  { keyword: "블록장난감", category: "50000005", audience: "kids", budgets: ["3만원 미만", "3~5만원대"], situations: ["생일", "졸업·입학"] },
  { keyword: "학습교구", category: "50000005", audience: "kids", budgets: ["3만원 미만", "3~5만원대"], situations: ["졸업·입학", "생일"] },
  { keyword: "유아복", category: "50000005", audience: "kids", budgets: ["3만원 미만", "3~5만원대"], situations: ["생일", "임신·출산", "명절"] },
  { keyword: "아기치발기", category: "50000005", audience: "kids", budgets: ["3만원 미만"], situations: ["임신·출산", "생일"] },
  { keyword: "돌잔치선물", category: "50000005", audience: "kids", budgets: ["3만원 미만", "3~5만원대", "5~10만원대"], situations: ["생일", "임신·출산"] },
  { keyword: "유아식기세트", category: "50000005", audience: "kids", budgets: ["3만원 미만", "3~5만원대"], situations: ["생일", "임신·출산", "집들이", "명절"] },
  { keyword: "아기내의", category: "50000005", audience: "kids", budgets: ["3만원 미만"], situations: ["생일", "명절", "임신·출산"] },

  // ---- 식품 ----
  { keyword: "홍삼", category: "50000006", audience: "adult", budgets: ["5~10만원대", "10만원 이상"], situations: ["명절", "감사 인사", "응원·위로"] },
  { keyword: "견과류", category: "50000006", audience: "adult", budgets: ["3~5만원대"], situations: ["명절", "감사 인사"] },
  { keyword: "커피원두", category: "50000006", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["감사 인사", "집들이"] },
  { keyword: "차선물세트", category: "50000006", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["명절", "감사 인사", "집들이"] },
  { keyword: "초콜릿", category: "50000006", audience: "adult", budgets: ["3만원 미만"], situations: ["생일", "기념일", "감사 인사"] },
  { keyword: "과일선물세트", category: "50000006", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["명절", "감사 인사"] },
  { keyword: "한우세트", category: "50000006", audience: "adult", budgets: ["10만원 이상"], situations: ["명절", "감사 인사", "응원·위로", "임신·출산"] },
  { keyword: "꿀", category: "50000006", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["명절", "감사 인사"] },
  { keyword: "영양제", category: "50000006", audience: "adult", budgets: ["3~5만원대", "5~10만원대", "10만원 이상"], situations: ["응원·위로", "감사 인사", "명절", "임신·출산"] },
  { keyword: "홍삼스틱", category: "50000006", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["응원·위로", "명절", "감사 인사"] },
  { keyword: "과일바구니", category: "50000006", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["응원·위로", "감사 인사", "임신·출산"] },
  { keyword: "죽선물세트", category: "50000006", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["응원·위로", "임신·출산"] },
  { keyword: "전복", category: "50000006", audience: "adult", budgets: ["5~10만원대", "10만원 이상"], situations: ["명절", "감사 인사"] },
  { keyword: "곶감", category: "50000006", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["명절", "감사 인사"] },
  { keyword: "참기름세트", category: "50000006", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["명절", "감사 인사"] },
  { keyword: "김세트", category: "50000006", audience: "adult", budgets: ["3만원 미만"], situations: ["명절", "감사 인사"] },
  { keyword: "갈비세트", category: "50000006", audience: "adult", budgets: ["10만원 이상"], situations: ["명절", "감사 인사"] },
  { keyword: "굴비세트", category: "50000006", audience: "adult", budgets: ["10만원 이상"], situations: ["명절", "감사 인사"] },

  // ---- 스포츠/레저 ----
  { keyword: "텀블러", category: "50000007", audience: "adult", budgets: ["3만원 미만"], situations: ["감사 인사", "생일", "졸업·입학"] },
  { keyword: "요가매트", category: "50000007", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["생일", "집들이"] },
  { keyword: "등산화", category: "50000007", audience: "adult", budgets: ["5~10만원대", "10만원 이상"], situations: ["생일", "명절"] },
  { keyword: "캠핑의자", category: "50000007", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["생일", "집들이"] },
  { keyword: "골프공", category: "50000007", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["승진·이직", "감사 인사"] },
  { keyword: "자전거헬멧", category: "50000007", audience: "adult", budgets: ["3~5만원대"], situations: ["생일"] },
  { keyword: "런닝화", category: "50000007", audience: "adult", budgets: ["5~10만원대", "10만원 이상"], situations: ["생일", "졸업·입학"] },
  { keyword: "물통", category: "50000007", audience: "adult", budgets: ["3만원 미만"], situations: ["졸업·입학", "감사 인사"] },
  { keyword: "골프장갑", category: "50000007", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["승진·이직", "감사 인사"] },
  { keyword: "헬스장갑", category: "50000007", audience: "adult", budgets: ["3만원 미만"], situations: ["응원·위로"] },
  { keyword: "요가블럭", category: "50000007", audience: "adult", budgets: ["3만원 미만"], situations: ["응원·위로"] },
  { keyword: "스포츠타월", category: "50000007", audience: "adult", budgets: ["3만원 미만"], situations: ["응원·위로", "감사 인사"] },

  // ---- 생활/건강 ----
  { keyword: "칫솔살균기", category: "50000008", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["집들이", "감사 인사"] },
  { keyword: "안마기", category: "50000008", audience: "adult", budgets: ["5~10만원대", "10만원 이상"], situations: ["명절", "감사 인사", "생일", "응원·위로", "임신·출산"] },
  { keyword: "수건세트", category: "50000008", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["집들이", "감사 인사"] },
  { keyword: "주방세제선물세트", category: "50000008", audience: "adult", budgets: ["3만원 미만"], situations: ["집들이", "감사 인사"] },
  { keyword: "공기청정기", category: "50000008", audience: "adult", budgets: ["10만원 이상"], situations: ["집들이", "명절", "응원·위로", "임신·출산"] },
  { keyword: "안마의자", category: "50000008", audience: "adult", budgets: ["10만원 이상"], situations: ["응원·위로", "명절", "감사 인사", "임신·출산"] },
  { keyword: "냄비세트", category: "50000008", audience: "adult", budgets: ["5~10만원대", "10만원 이상"], situations: ["집들이"] },
  { keyword: "식기세트", category: "50000008", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["집들이"] },
  { keyword: "족욕기", category: "50000008", audience: "adult", budgets: ["3~5만원대", "5~10만원대"], situations: ["명절", "감사 인사", "응원·위로", "임신·출산"] },
  { keyword: "수면안대", category: "50000008", audience: "adult", budgets: ["3만원 미만"], situations: ["응원·위로", "임신·출산"] },
  { keyword: "좌욕기", category: "50000008", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["임신·출산"] },
  { keyword: "찜질기", category: "50000008", audience: "adult", budgets: ["3만원 미만", "3~5만원대"], situations: ["응원·위로", "명절"] },
];

module.exports = {
  CATEGORY_NAMES,
  BUDGET_TIERS,
  SITUATIONS,
  KEYWORDS,
};
