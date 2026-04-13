const buildId = (process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_REF || String(Date.now())).slice(0, 12);

export function GET() {
  return new Response(
    JSON.stringify({ buildId }),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0'
      }
    }
  );
}
