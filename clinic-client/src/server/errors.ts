export class ClinicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClinicError";
  }
}

export function publicError(error: unknown, fallback: string): string {
  if (error instanceof ClinicError) return error.message;
  return fallback;
}
