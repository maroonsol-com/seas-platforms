import { sessionCookieName } from "@saas/auth-core";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { selectClinicBusiness } from "@/server/auth";

export async function POST(request: Request) {
  const token = (await cookies()).get(sessionCookieName("clinic"))?.value ?? "";
  const form = await request.formData();
  const businessId = String(form.get("businessId") ?? "");
  const selected = token ? await selectClinicBusiness(token, businessId) : false;
  return NextResponse.redirect(new URL(selected ? "/dashboard" : "/select-business", process.env.APP_URL || "http://localhost:3001"), 303);
}
