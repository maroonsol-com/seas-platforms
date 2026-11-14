import { handleEntitlementRequest } from "@/server/internal-api";

export async function POST(request: Request) {
  return handleEntitlementRequest(request);
}
