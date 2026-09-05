// UI 예시 버튼 3개. STEP 6에서 실제 상장사·실제 공시 기준으로 교체.
export const EXAMPLES: { key: 'high' | 'confirmed' | 'partial'; label: string; text: string }[] = [
  {
    key: 'high',
    label: '위험 높음 예시',
    text: '형님들 대류테크 내일 미국 대형 수주 발표 확정입니다. 아직 외부 공개 안 된 정보라 여기서만 말씀드려요. 오늘 종가 전에 무조건 들어가세요. 자세한 건 텔레방에서 https://t.me/xxxx',
  },
  {
    key: 'confirmed',
    label: '공시 확인됨 예시',
    text: '한빛전자 9/3 단일판매·공급계약체결 공시 났네요. 계약금액 1,180억, 최근 매출 대비 12.3%. 원문: https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20260903000123',
  },
  {
    key: 'partial',
    label: '일부 상이 예시',
    text: '청운바이오 어제 500억 3자배정 유증 공시 났죠? 이제 시작입니다. VIP방에서 다음 타깃 공개하니 가입비 300 입금하세요.',
  },
];
