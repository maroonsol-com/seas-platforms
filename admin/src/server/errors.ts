export class AdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminError";
  }
}

export function publicError(error: unknown, fallback: string): string {
  if (error instanceof AdminError) {
    return error.message;
  }
  return fallback;
}
