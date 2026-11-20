import { NextRequest } from "next/server";
import { forwardPost } from "@/lib/backend-forward";

/** The AI draft of the code-generation instructions (the answer takes longer than the /backend proxy allows). */
export async function POST(req: NextRequest) {
  return forwardPost(req, "/api/generate-column-instructions");
}
