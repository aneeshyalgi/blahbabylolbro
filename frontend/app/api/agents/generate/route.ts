import { NextRequest } from "next/server";
import { forwardPost } from "@/lib/backend-forward";

/** Designing or refining an agent in the agent studio (the language model answers slower than the /backend proxy waits). */
export async function POST(req: NextRequest) {
  return forwardPost(req, "/api/agents/generate");
}
