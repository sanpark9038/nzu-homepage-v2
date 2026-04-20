const REVALIDATE_PATH = "/api/admin/revalidate-serving";

function resolveBaseUrl() {
  const candidates = [
    process.env.SERVING_REVALIDATE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ];

  for (const raw of candidates) {
    const value = String(raw || "").trim();
    if (!value) continue;
    if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/, "");
    return `https://${value.replace(/\/+$/, "")}`;
  }

  return null;
}

async function main() {
  const baseUrl = resolveBaseUrl();
  const secret = String(process.env.SERVING_REVALIDATE_SECRET || "").trim();

  if (!baseUrl || !secret) {
    const missing = [
      !baseUrl ? "base_url" : null,
      !secret ? "secret" : null,
    ].filter(Boolean);
    console.log(`[SKIP] revalidate_public_cache missing ${missing.join(", ")}`);
    return;
  }

  const response = await fetch(`${baseUrl}${REVALIDATE_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      secret,
      tags: ["public-players-list"],
    }),
  });

  const payload = await response.text();
  if (!response.ok) {
    throw new Error(
      `revalidate_public_cache failed (${response.status} ${response.statusText}): ${payload}`
    );
  }

  console.log(`[OK] revalidate_public_cache ${payload}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
