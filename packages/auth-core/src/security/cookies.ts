export type SessionApplication = "admin" | "clinic";

const SESSION_COOKIE_NAMES = {
  admin: "saas_admin_session",
  clinic: "saas_clinic_session",
} as const satisfies Record<SessionApplication, string>;

export function sessionCookieName(application: SessionApplication): string {
  return SESSION_COOKIE_NAMES[application];
}

export function sessionCookieOptions(input: {
  secure: boolean;
  maxAgeSeconds: number;
}) {
  return {
    httpOnly: true,
    secure: input.secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: input.maxAgeSeconds,
  };
}
