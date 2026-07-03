const VAULT_SIZER_API_URL = "https://calculator.veeam.com/vse/api/VmAgent";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context: {
  request: Request;
}): Promise<Response> {
  const body: unknown = await context.request.json();

  const upstream = await fetch(VAULT_SIZER_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data: unknown = await upstream.json();

  return new Response(JSON.stringify(data), {
    status: upstream.ok ? 200 : upstream.status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}
