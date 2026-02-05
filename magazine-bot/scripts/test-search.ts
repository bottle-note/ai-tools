#!/usr/bin/env tsx
/**
 * 네이버 검색 API 테스트
 *
 * 사용법:
 *   pnpm run search --trend           # 트렌드 모드 (Discord 버튼과 동일)
 *   pnpm run search "디저트"           # 키워드 모드
 *   pnpm run search --trend --raw     # 트렌드 Raw 응답
 *   pnpm run search "디저트" --raw    # 키워드 Raw 응답
 */

import 'dotenv/config';

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
  console.error('❌ NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 환경변수가 필요합니다.');
  console.log('\n.env 파일에 추가하세요:');
  console.log('NAVER_CLIENT_ID=your-client-id');
  console.log('NAVER_CLIENT_SECRET=your-client-secret');
  process.exit(1);
}

interface SearchResult {
  title: string;
  url: string;
  description: string;
  postdate?: string;
  source: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

async function naverBlogSearch(query: string, raw = false): Promise<SearchResult[] | any> {
  const params = new URLSearchParams({
    query,
    display: '10',
    sort: 'date',
  });

  const response = await fetch(`https://openapi.naver.com/v1/search/blog?${params}`, {
    headers: {
      'X-Naver-Client-Id': NAVER_CLIENT_ID!,
      'X-Naver-Client-Secret': NAVER_CLIENT_SECRET!,
    },
  });

  if (!response.ok) {
    throw new Error(`Naver Blog API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (raw) return data;

  return (data.items ?? []).map((item: any) => ({
    title: stripHtml(item.title),
    url: item.link,
    description: stripHtml(item.description),
    postdate: item.postdate,
    source: '블로그',
  }));
}

async function naverNewsSearch(query: string, raw = false): Promise<SearchResult[] | any> {
  const params = new URLSearchParams({
    query,
    display: '10',
    sort: 'date',
  });

  const response = await fetch(`https://openapi.naver.com/v1/search/news?${params}`, {
    headers: {
      'X-Naver-Client-Id': NAVER_CLIENT_ID!,
      'X-Naver-Client-Secret': NAVER_CLIENT_SECRET!,
    },
  });

  if (!response.ok) {
    throw new Error(`Naver News API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (raw) return data;

  return (data.items ?? []).map((item: any) => ({
    title: stripHtml(item.title),
    url: item.link,
    description: stripHtml(item.description),
    postdate: item.pubDate,
    source: '뉴스',
  }));
}

function printResults(results: SearchResult[], query: string) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🔍 "${query}" 검색 결과 (${results.length}개)`);
  console.log(`${'═'.repeat(60)}`);

  results.forEach((r, i) => {
    const date = r.postdate ? ` (${r.postdate})` : '';
    console.log(`\n${i + 1}. [${r.source}] ${r.title}`);
    console.log(`   🔗 ${r.url.slice(0, 60)}...${date}`);
    console.log(`   ${r.description.slice(0, 100)}${r.description.length > 100 ? '...' : ''}`);
  });
}

function getCurrentMonth(): string {
  const months = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  return months[new Date().getMonth()];
}

function getCurrentSeason(): string {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return '봄';
  if (month >= 5 && month <= 7) return '여름';
  if (month >= 8 && month <= 10) return '가을';
  return '겨울';
}

async function main() {
  const args = process.argv.slice(2);
  const isRaw = args.includes('--raw');
  const isTrend = args.includes('--trend');
  const keyword = args.filter(a => !a.startsWith('--')).join(' ');

  console.log('\n🧪 네이버 검색 API 테스트');
  console.log(`${'─'.repeat(60)}`);
  console.log(`📅 현재: ${getCurrentMonth()} (${getCurrentSeason()})`);
  if (isRaw) console.log(`📦 RAW 모드: 전체 API 응답 출력`);

  if (isTrend || !keyword) {
    console.log('\n🔥 트렌드 모드 (Discord [🔥 트렌드] 버튼 시뮬레이션)');
    console.log(`${'─'.repeat(60)}`);
    console.log('💡 위스키 없이 순수 MZ 트렌드만 검색 → AI가 위스키와 창의적 연결');

    const year = new Date().getFullYear();
    const query = `${year} MZ세대 트렌드 요즘 핫한 유행`;

    console.log(`\n1️⃣ 쿼리: "${query}"`);

    try {
      console.log(`\n2️⃣ 네이버 블로그 API 호출 (count=20)...`);

      if (isRaw) {
        const blogRaw = await naverBlogSearch(query, true);
        console.log('\n📦 Blog Raw Response:');
        console.log(JSON.stringify(blogRaw, null, 2));
        console.log(`\n${'═'.repeat(60)}`);
        console.log('✅ 테스트 완료');
        return;
      }

      const blogResults = await naverBlogSearch(query);
      console.log(`   → 블로그: ${blogResults.length}개`);

      const top10 = blogResults.slice(0, 10);

      console.log(`\n3️⃣ 상위 10개 선택:`);

      top10.forEach((r: SearchResult, i: number) => {
        console.log(`\n   📝 ${i + 1}. ${r.title}`);
        console.log(`      🔗 ${r.url.slice(0, 50)}...`);
        console.log(`      ${r.description.slice(0, 80)}...`);
      });

      console.log(`\n${'─'.repeat(60)}`);
      console.log(`📊 요약: ${blogResults.length}개 중 ${top10.length}개 선택`);

    } catch (error) {
      console.error(`❌ 검색 실패:`, error);
    }
  } else {
    console.log(`\n🎯 키워드 모드: "${keyword}"`);
    const query = `${keyword} 위스키`;
    console.log(`📝 쿼리: "${query}"`);

    try {
      if (isRaw) {
        const [blogRaw, newsRaw] = await Promise.all([
          naverBlogSearch(query, true),
          naverNewsSearch(query, true),
        ]);
        console.log('\n📦 Blog Raw:');
        console.log(JSON.stringify(blogRaw, null, 2));
        console.log('\n📦 News Raw:');
        console.log(JSON.stringify(newsRaw, null, 2));
      } else {
        const [blogResults, newsResults] = await Promise.all([
          naverBlogSearch(query),
          naverNewsSearch(query),
        ]);
        const combined = [...newsResults, ...blogResults];
        printResults(combined, query);
      }
    } catch (error) {
      console.error(`❌ 검색 실패:`, error);
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('✅ 테스트 완료');
}

main();
