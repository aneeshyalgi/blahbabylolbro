import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const COOKIE_NAME = "rwa_session";

/**
 * Forwards a POST to the backend with the session cookie and returns the backend's JSON answer and status.
 * For requests that wait for a language model: the /backend rewrite proxy gives up after 30 seconds.
 * A request the page cancels is cancelled towards the backend too.
 */
export async function forwardPost(req: NextRequest, path: string): Promise<NextResponse> {
  const body = await req.text();
  const session = req.cookies.get(COOKIE_NAME)?.value;

  let backendRes: Response;
  try {
    backendRes = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Cookie: `${COOKIE_NAME}=${session}` } : {}),
      },
      body,
      signal: req.signal,
    });
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? `Backend unavailable: ${error.message}` : "Backend unavailable" },
      { status: 502 },
    );
  }

  const responseText = await backendRes.text();
  let data: unknown;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    data = { detail: responseText || backendRes.statusText || "Backend returned a non-JSON response" };
  }
  return NextResponse.json(data, { status: backendRes.status });
}
