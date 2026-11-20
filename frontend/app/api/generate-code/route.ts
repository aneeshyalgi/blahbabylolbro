import { NextRequest } from "next/server";
import { forwardPost } from "@/lib/backend-forward";

/** AI code generation for the Code tab: writing and test-running the code takes up to a few minutes. */
export async function POST(req: NextRequest) {
  return forwardPost(req, "/api/generate-code");
}
