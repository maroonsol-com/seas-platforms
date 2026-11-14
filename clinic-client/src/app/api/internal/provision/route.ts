import { handleProvisionRequest } from "@/server/internal-api";

export async function POST(request: Request) {
  return handleProvisionRequest(request);
}
