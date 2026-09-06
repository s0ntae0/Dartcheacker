export type RiskLevel = 'low' | 'medium' | 'high' | 'uncertain';
export type Verdict = 'confirmed' | 'partial' | 'unconfirmed' | 'not_disclosure_event' | 'out_of_scope';
export type ClaimType =
  | 'supply_contract' | 'capital_increase' | 'convertible_bond' | 'earnings' | 'major_holder'
  | 'ceo_change' | 'merger' | 'listing' | 'executive_rumor' | 'price_forecast' | 'insider_claim' | 'other';

export interface PatternHit {
  id: string;            // P01..P16
  label: string;
  category: string;
  spans: string[];       // 원문에서 그대로 인용된 구절 (하이라이트용)
  confidence: number;    // 0..1
  hard: boolean;
  legal_basis: string;
  next_step_hint: string | null;
  sources: { title: string; url: string }[];
}

export interface Claim {
  text: string;          // 주장 원문 구절
  corp?: { corp_code: string; corp_name: string; stock_code: string };
  type: ClaimType;
  amount?: { value: number; unit: '원'; raw: string };   // 정규화된 금액(원 단위)
  date_hint?: string;    // "어제", "9/3", "다음주" 등 원문 그대로
  verdict: Verdict;
  evidence?: { rcept_no: string; report_nm: string; rcept_dt: string; url: string; corrected: boolean };
  detail: string;        // 한 줄 설명
  note?: string;         // 공시 의무·기한 안내 등
}

/** 발신자가 자칭하는 소속(증권사·자문사·기관). 등록 여부는 판정하지 않고 파인 조회 링크만 제공 */
export interface SenderOrg {
  name: string;
  fine_fin: string;      // 파인 제도권 금융회사 조회
  fine_advisor: string;  // 파인 유사투자자문업자 신고현황
}

export interface CheckResponse {
  risk: {
    score: number;                 // 0..1
    level: RiskLevel;
    headline: string;              // verdict_copy[level]
    patterns: PatternHit[];
    benign: { id: string; label: string; spans: string[] }[];
    stage?: string;                // "④ 권위·기밀 → ⑤ 편취 직전"
    reflection?: string;           // LLM이 쓴 '정상일 가능성' 한 줄
  };
  claims: Claim[];
  sender_orgs: SenderOrg[];
  actions: string[];               // action_guide[level]
  contacts: { name: string; value: string; url: string }[];
  checked_at: string;              // ISO, KST 표시용
  disclaimer: string;
  degraded?: string[];             // ['llm_timeout', 'dart_unavailable'] 등
}
