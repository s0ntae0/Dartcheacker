// scripts/seed-corps.mjs
// OpenDART corpCode.xml(zip) → 상장사만 골라 Supabase corps 테이블에 upsert
// 실행: node scripts/seed-corps.mjs   (사전: npm i adm-zip @supabase/supabase-js dotenv)
// package.json에 "seed": "node scripts/seed-corps.mjs" 추가하면 npm run seed

import 'dotenv/config';
import AdmZip from 'adm-zip';
import { createClient } from '@supabase/supabase-js';

const { OPENDART_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!OPENDART_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('OPENDART_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요 (.env.local 또는 .env)');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// 1. zip 다운로드
const res = await fetch(`https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${OPENDART_KEY}`);
if (!res.ok) throw new Error(`OpenDART ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());

// 키 오류면 zip이 아니라 JSON/XML 에러 본문이 온다
if (buf.subarray(0, 2).toString() !== 'PK') throw new Error(`zip 아님: ${buf.toString().slice(0, 200)}`);

// 2. 압축 해제 → CORPCODE.xml
const zip = new AdmZip(buf);
const entry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith('.xml'));
if (!entry) throw new Error('xml 없음');
const xml = entry.getData().toString('utf8');

// 3. 파싱 (구조가 평면이라 정규식으로 충분)
const rows = [];
const re = /<list>\s*<corp_code>(.*?)<\/corp_code>\s*<corp_name>(.*?)<\/corp_name>(?:\s*<corp_eng_name>.*?<\/corp_eng_name>)?\s*<stock_code>(.*?)<\/stock_code>\s*<modify_date>(.*?)<\/modify_date>\s*<\/list>/gs;
for (const m of xml.matchAll(re)) {
  const stock = m[3].trim();
  if (!stock) continue; // 비상장 제외
  const d = m[4].trim(); // YYYYMMDD
  rows.push({
    corp_code: m[1].trim(),
    corp_name: m[2].trim(),
    stock_code: stock,
    modify_date: d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null,
  });
}
console.log(`상장사 ${rows.length}개 파싱`);
if (rows.length < 2000) throw new Error('개수가 너무 적음 — 정규식/데이터 확인');

// 4. 1000개씩 upsert
for (let i = 0; i < rows.length; i += 1000) {
  const chunk = rows.slice(i, i + 1000);
  const { error } = await supabase.from('corps').upsert(chunk, { onConflict: 'corp_code' });
  if (error) throw error;
  console.log(`upsert ${Math.min(i + 1000, rows.length)}/${rows.length}`);
}

// 5. 확인
const { count } = await supabase.from('corps').select('*', { count: 'exact', head: true });
console.log(`corps 총 ${count}건`);
