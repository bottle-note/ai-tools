import { config } from '../config.js';

export interface SearchResult {
  title: string;
  url: string;
  description: string;
  publishedDate?: string;
  source?: string;
}

const NAVER_BLOG_API_URL = 'https://openapi.naver.com/v1/search/blog';
const NAVER_NEWS_API_URL = 'https://openapi.naver.com/v1/search/news';

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

// HTML 태그 제거
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

// 네이버 블로그 검색
async function naverBlogSearch(query: string, count = 10): Promise<SearchResult[]> {
  if (!config.NAVER_CLIENT_ID || !config.NAVER_CLIENT_SECRET) {
    console.warn('Naver API not configured');
    return [];
  }

  const params = new URLSearchParams({
    query,
    display: String(count),
    sort: 'date', // 최신순
  });

  const response = await fetch(`${NAVER_BLOG_API_URL}?${params}`, {
    headers: {
      'X-Naver-Client-Id': config.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': config.NAVER_CLIENT_SECRET,
    },
  });

  if (!response.ok) {
    console.error(`Naver Blog API error: ${response.status} ${response.statusText}`);
    throw new Error(`Naver Blog Search failed: ${response.status}`);
  }

  const data = await response.json();
  return (data.items ?? []).map((item: any) => ({
    title: stripHtml(item.title),
    url: item.link,
    description: stripHtml(item.description),
    publishedDate: item.postdate,
    source: '블로그',
  }));
}

// 네이버 뉴스 검색
async function naverNewsSearch(query: string, count = 10): Promise<SearchResult[]> {
  if (!config.NAVER_CLIENT_ID || !config.NAVER_CLIENT_SECRET) {
    console.warn('Naver API not configured');
    return [];
  }

  const params = new URLSearchParams({
    query,
    display: String(count),
    sort: 'date',
  });

  const response = await fetch(`${NAVER_NEWS_API_URL}?${params}`, {
    headers: {
      'X-Naver-Client-Id': config.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': config.NAVER_CLIENT_SECRET,
    },
  });

  if (!response.ok) {
    console.error(`Naver News API error: ${response.status} ${response.statusText}`);
    throw new Error(`Naver News Search failed: ${response.status}`);
  }

  const data = await response.json();
  return (data.items ?? []).map((item: any) => ({
    title: stripHtml(item.title),
    url: item.link,
    description: stripHtml(item.description),
    publishedDate: item.pubDate,
    source: '뉴스',
  }));
}

// 기존 주제와 겹치는 결과 필터링
function filterExcludedTopics(results: SearchResult[], excludeTopics: string[]): SearchResult[] {
  if (!excludeTopics.length) return results;

  const excludeKeywords = excludeTopics
    .flatMap(topic => topic.split(/[\s,:\-—]+/))
    .filter(word => word.length >= 2)
    .map(word => word.toLowerCase());

  return results.filter(result => {
    const titleLower = result.title.toLowerCase();
    const descLower = result.description.toLowerCase();
    return !excludeKeywords.some(keyword =>
      titleLower.includes(keyword) || descLower.includes(keyword)
    );
  });
}

export async function searchWhiskyTrends(excludeTopics: string[] = []): Promise<SearchResult[]> {
  const year = new Date().getFullYear();

  // 순수 MZ 트렌드 검색 (위스키 키워드 없이)
  // AI가 나중에 선택된 트렌드와 위스키를 창의적으로 연결
  const query = `${year} MZ세대 트렌드 요즘 핫한 유행`;

  let results: SearchResult[] = [];
  try {
    // 블로그만 검색 (트렌드 키워드는 블로그가 더 풍부)
    results = await naverBlogSearch(query, 20);
  } catch (error) {
    console.error('Trend search failed:', error);
    return [];
  }

  const filtered = filterExcludedTopics(results, excludeTopics);
  return filtered.slice(0, 10);
}

export async function searchByKeyword(keyword: string, excludeTopics: string[] = []): Promise<SearchResult[]> {
  const query = `${keyword} 위스키`;

  let results: SearchResult[] = [];
  try {
    const [blogResults, newsResults] = await Promise.all([
      naverBlogSearch(query, 10),
      naverNewsSearch(query, 10),
    ]);

    results = [...newsResults, ...blogResults];
  } catch (error) {
    console.error(`Keyword search failed for: ${keyword}`, error);
    return [];
  }

  const filtered = filterExcludedTopics(results, excludeTopics);
  return filtered.slice(0, 10);
}
