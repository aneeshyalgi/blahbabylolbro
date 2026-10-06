import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const COOKIE_NAME = "rwa_session";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const session = req.cookies.get(COOKIE_NAME)?.value;

  let backendRes: Response;
  try {
    backendRes = await fetch(`${BACKEND_URL}/api/agents/runs/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Cookie: `${COOKIE_NAME}=${session}` } : {}),
      },
      body,
      // Aborting the browser request (Stop) cancels the backend run as well.
      signal: req.signal,
    });
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? `Backend unavailable: ${error.message}` : "Backend unavailable" },
      { status: 502 },
    );
  }

  if (!backendRes.ok || !backendRes.body) {
    const responseText = await backendRes.text();
    let data: unknown;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch {
      data = { detail: responseText || backendRes.statusText || "Backend returned a non-JSON response" };
    }
    return NextResponse.json(data, { status: backendRes.status || 502 });
  }

  return new Response(backendRes.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
