import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "rwa_session";
const LOGIN_PATH = "/login";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow the login page and all auth API routes through without a session check
  if (
    pathname === LOGIN_PATH ||
    pathname.startsWith("/backend/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/EY_logo")
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get(COOKIE_NAME);
  if (!session?.value) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_PATH;
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run on all routes except Next.js internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
