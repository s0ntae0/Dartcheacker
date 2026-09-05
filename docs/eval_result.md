# 평가 결과 (gold 53건)

- 실행: 2026-09-05T18:40:48.500Z / 대상: http://localhost:3000

## 사기 32건
- expected_level 일치: 16/32
- level ≥ medium(uncertain 포함): 31/32
- expected_patterns recall(패턴 단위): 59/83 (71%)

## 정상 21건
- level = low: 20/21
- 오발동: 1건 — B10(medium, [P04,P10], 0.438)

## 지연
- 평균 3039ms / 오류 0건 / degraded 1건

## 상세

| id | label | expected | got | score | patterns | recall | claims | degraded | ms |
|---|---|---|---|---|---|---|---|---|---|
| S01 | scam | high | high | 1 | P01 P03 P04 | 3/4 | supply_contract:out_of_scope |  | 5999 |
| S02 | scam | high | medium | 0.35 | P08 | 1/2 | capital_increase:out_of_scope |  | 2294 |
| S03 | scam | high | high | 0.65 | P05 P15 | 2/3 |  |  | 3570 |
| S04 | scam | high | high | 0.55 | P07 | 1/2 |  |  | 2445 |
| S05 | scam | high | medium | 0.592 | P03 P09 P11 | 2/3 |  |  | 2598 |
| S06 | scam | high | medium | 0.584 | P02 P03 P12 | 3/4 |  |  | 2742 |
| S07 | scam | high | medium | 0.448 | P02 P13 | 2/3 |  |  | 3139 |
| S08 | scam | medium | high | 0.617 | P03 P04 P09 P10 | 3/3 |  |  | 3234 |
| S09 | scam | high | medium | 0.524 | P03 P15 P16 | 2/4 |  |  | 3333 |
| S10 | scam | high | high | 0.6 | P14 | 1/1 |  |  | 2800 |
| S11 | scam | high | medium | 0.545 | P01 P06 | 2/3 |  |  | 3692 |
| S12 | scam | high | high | 0.902 | P04 P08 P11 P13 | 4/4 |  |  | 2338 |
| S13 | scam | medium | low | 0.05 | P09 | 1/1 |  |  | 2626 |
| S14 | scam | high | high | 0.725 | P03 P08 P16 | 3/3 | supply_contract:out_of_scope |  | 2835 |
| S15 | scam | high | medium | 0.475 | P04 P06 | 2/3 |  |  | 3050 |
| S16 | scam | high | high | 0.666 | P02 P10 | 2/3 |  |  | 3824 |
| S17 | scam | high | high | 0.55 | P07 | 1/2 |  |  | 2432 |
| S18 | scam | medium | medium | 0.35 | P01 | 1/1 | insider_claim:out_of_scope |  | 2923 |
| S19 | scam | medium | medium | 0.588 | P03 P04 P13 | 3/3 |  |  | 1577 |
| S20 | scam | high | medium | 0.4 | P11 | 1/2 |  |  | 2814 |
| S21 | scam | high | medium | 0.448 | P01 P16 | 2/3 | merger:out_of_scope |  | 3016 |
| S22 | scam | high | medium | 0.3 | P15 | 1/2 |  |  | 2446 |
| S23 | scam | medium | medium | 0.32 | P03 P16 | 2/2 |  |  | 3050 |
| S24 | scam | high | high | 0.663 | P07 P10 | 1/3 |  |  | 2777 |
| S25 | scam | medium | medium | 0.35 | P01 | 1/2 | executive_rumor:not_disclosure_event |  | 2416 |
| S26 | scam | medium | medium | 0.363 | P04 P09 | 2/3 |  |  | 2880 |
| S27 | scam | high | high | 0.55 | P07 | 1/2 |  |  | 2136 |
| S28 | scam | high | medium | 0.438 | P04 P10 | 2/2 | capital_increase:out_of_scope | llm_timeout | 12015 |
| S29 | scam | medium | uncertain | 0.3 | P06 | 1/2 |  |  | 2408 |
| S30 | scam | high | uncertain | 0.3 | P15 | 1/2 | listing:out_of_scope |  | 1759 |
| B01 | benign | low | low | 0 |  | 0/0 | supply_contract:out_of_scope |  | 2831 |
| B02 | benign | low | low | 0 |  | 0/0 | capital_increase:out_of_scope |  | 2902 |
| B03 | benign | low | low | 0 |  | 0/0 |  |  | 1912 |
| B04 | benign | low | low | 0 |  | 0/0 | earnings:out_of_scope |  | 2539 |
| B05 | benign | low | low | 0 |  | 0/0 |  |  | 2593 |
| B06 | benign | low | low | 0 |  | 0/1 |  |  | 2558 |
| B07 | benign | low | low | 0 |  | 0/0 |  |  | 3417 |
| B08 | benign | low | low | 0.15 | P04 | 0/0 |  |  | 2148 |
| B09 | benign | low | low | 0 |  | 0/0 | ceo_change:out_of_scope |  | 1852 |
| B10 | benign | low | medium | 0.438 | P04 P10 | 0/0 |  |  | 1703 |
| B11 | benign | low | low | 0 |  | 0/0 | convertible_bond:out_of_scope |  | 2049 |
| B12 | benign | low | low | 0.1 | P03 | 0/0 |  |  | 7140 |
| B13 | benign | low | low | 0 |  | 0/0 | earnings:out_of_scope |  | 1721 |
| B14 | benign | low | low | 0 |  | 0/0 |  |  | 3142 |
| B15 | benign | low | low | 0 |  | 0/0 | listing:out_of_scope |  | 2603 |
| B16 | benign | low | low | 0 |  | 0/0 |  |  | 2091 |
| B17 | benign | low | low | 0 |  | 0/0 | supply_contract:out_of_scope |  | 2137 |
| B18 | benign | low | low | 0 |  | 0/0 |  |  | 2283 |
| B19 | benign | low | low | 0 |  | 0/0 | earnings:out_of_scope |  | 2374 |
| B20 | benign | low | low | 0 |  | 0/0 |  |  | 1896 |
| S01R | scam | high | high | 1 | P01 P03 P04 | 3/4 | supply_contract:unconfirmed |  | 4744 |
| B01R | benign | low | low | 0 |  | 0/0 | supply_contract:confirmed |  | 5976 |
| S28R | scam | high | medium | 0.438 | P04 P10 | 2/2 | capital_increase:partial |  | 3290 |

## 해석 (2026-09-06)

- STEP 6 완료 기준 충족: 정상 20건 오발동 1건(≤ 2), 사기 30건 level ≥ medium 29건(+실제 기업 사본 2건 모두 ≥ medium) (≥ 27).
- S13("대표님 말씀대로 … 12%네요")은 P09(weight 0.15) 단독이라 점수 규칙상 low가 상한이다. 가중치는 조정하지 않는다는 원칙에 따라 그대로 둔다.
- B10(피해 경험담)은 규칙층이 "VIP방·가입비"를 P04·P10으로 태깅해 medium. 점수 규칙이 규칙층 ∪ LLM 합집합이라 LLM Reflection만으로는 낮출 수 없다(허용 범위 내 오발동 1건).
- LLM(HCX-005)은 60 req/min·60k tokens/min 한도가 있어 평가는 `--gap 2000`으로 실행했다. 한도 초과 시에도 서비스는 규칙층 결과로 200을 반환하고 `degraded`에 표시한다(이전 실행에서 확인).
- S29·S30은 LLM이 `uncertain: true`로 판단해 "판단 유보"(medium 색)로 표시됐다.
