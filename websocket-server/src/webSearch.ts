// 会話中にAIが「今日/明日の天気」「直近の試合結果」など、モデル自身が
// 知らない最新情報を聞かれたときに使うWeb検索。
// 通話中の待ち時間を短くしたいので、要約済みの結果を返せるプロバイダーを
// 優先しつつ、WEB_SEARCH_PROVIDER で切り替えて比較できるようにしている。

const TIMEOUT_MS = 6000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

interface SearchOutcome {
  provider: string;
  answer?: string;
  results: SearchResultItem[];
}

// Tavily: LLM/エージェント向けに要約済みの answer を返してくれるため、
// 音声応答に組み込みやすい（追加の要約ステップが不要）
async function searchTavily(query: string): Promise<SearchOutcome> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY not set");

  const res = await fetchWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      include_answer: true,
      max_results: 3,
    }),
  });
  if (!res.ok) throw new Error(`Tavily API error: ${res.status}`);
  const data = await res.json();

  return {
    provider: "tavily",
    answer: data.answer || undefined,
    results: (data.results || []).map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    })),
  };
}

// Brave Search: 独自インデックスによる生のSERPスニペットを返す。
// 要約はモデル側に任せる分、レスポンス自体は軽量・高速。
async function searchBrave(query: string): Promise<SearchOutcome> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) throw new Error("BRAVE_SEARCH_API_KEY not set");

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
    query
  )}&count=3`;
  const res = await fetchWithTimeout(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });
  if (!res.ok) throw new Error(`Brave Search API error: ${res.status}`);
  const data = await res.json();

  return {
    provider: "brave",
    results: (data.web?.results || []).map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
    })),
  };
}

const PROVIDERS: Record<string, (query: string) => Promise<SearchOutcome>> = {
  tavily: searchTavily,
  brave: searchBrave,
};

export async function runWebSearch(query: string): Promise<string> {
  const provider = (process.env.WEB_SEARCH_PROVIDER || "tavily").toLowerCase();
  const search = PROVIDERS[provider];
  if (!search) {
    return JSON.stringify({
      error: `Unknown WEB_SEARCH_PROVIDER "${provider}". Use "tavily" or "brave".`,
    });
  }

  try {
    const outcome = await search(query);
    return JSON.stringify({
      provider: outcome.provider,
      answer: outcome.answer,
      results: outcome.results.slice(0, 3),
    });
  } catch (err: any) {
    console.error(`[WebSearch:${provider}] failed:`, err.message);
    return JSON.stringify({
      error: `Web search failed (${provider}): ${err.message}`,
    });
  }
}
