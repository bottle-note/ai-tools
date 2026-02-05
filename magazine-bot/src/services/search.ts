import { config } from '../config.js';

export interface SearchResult {
  title: string;
  url: string;
  description: string;
  publishedDate?: string;
  source?: string;
}

const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search';

// 한국 트렌드/라이프스타일 사이트
const TREND_SITES = [
  'theqoo.net',
  'instagram.com',
  'twitter.com',
  'hypebeast.kr',
  'musinsa.com',
  'dispatch.co.kr',
  'news.naver.com',
  'wikitree.co.kr',
];


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

async function braveSearch(query: string, count = 10, lang = 'ko'): Promise<SearchResult[]> {
  if (!config.BRAVE_SEARCH_API_KEY) {
    console.warn('BRAVE_SEARCH_API_KEY not configured, returning empty results');
    return [];
  }

  const params = new URLSearchParams({
    q: query,
    count: String(count),
    text_decorations: 'false',
    search_lang: lang,
    country: 'kr',
    freshness: 'pw', // past week for fresher results
  });

  const response = await fetch(`${BRAVE_API_URL}?${params}`, {
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': config.BRAVE_SEARCH_API_KEY,
    },
  });

  if (!response.ok) {
    console.error(`Brave Search API error: ${response.status} ${response.statusText}`);
    throw new Error(`Brave Search failed: ${response.status}`);
  }

  const data = await response.json();
  const results: SearchResult[] = [];

  for (const item of data.web?.results ?? []) {
    results.push({
      title: item.title,
      url: item.url,
      description: item.description || '',
      publishedDate: item.age,
      source: new URL(item.url).hostname,
    });
  }

  return results;
}

export async function searchWhiskyTrends(): Promise<SearchResult[]> {
  const season = getCurrentSeason();
  const month = getCurrentMonth();

  // 일반 트렌드 검색 (위스키와 엮을 수 있는 핫이슈)
  const queries = [
    // 한국 핫이슈/트렌드
    '요즘 핫한 트렌드 MZ세대',
    '최신 바이럴 화제',
    `${month} 트렌드 이슈`,
    // 음식/음료 트렌드
    '요즘 핫한 디저트 음료',
    '힙한 술집 바 트렌드',
    // 시즌 트렌드
    `${season} 분위기 데이트`,
    // 라이프스타일
    '요즘 핫한 취미 MZ',
  ];

  const allResults: SearchResult[] = [];

  // 각 쿼리에서 2-3개씩 가져오기
  for (const query of queries) {
    try {
      const results = await braveSearch(query, 3);
      allResults.push(...results);
    } catch (error) {
      console.error(`Search failed for query: ${query}`, error);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = allResults.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  // 트렌드 사이트 우선
  return unique.sort((a, b) => {
    const aIsTrendSite = TREND_SITES.some(site => a.url.includes(site));
    const bIsTrendSite = TREND_SITES.some(site => b.url.includes(site));
    if (aIsTrendSite && !bIsTrendSite) return -1;
    if (!aIsTrendSite && bIsTrendSite) return 1;
    return 0;
  }).slice(0, 5);
}

export async function searchByKeyword(keyword: string): Promise<SearchResult[]> {
  const queries = [
    // 키워드 관련 트렌드 검색
    `${keyword} 트렌드 화제`,
    `${keyword} 인기 핫한`,
    // 키워드 + 위스키/술 연관
    `${keyword} 술 페어링`,
    `${keyword} 위스키`,
  ];

  const allResults: SearchResult[] = [];

  for (const query of queries) {
    try {
      const results = await braveSearch(query, 4);
      allResults.push(...results);
    } catch (error) {
      console.error(`Search failed for keyword: ${keyword}`, error);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = allResults.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  return unique.slice(0, 5);
}
