export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: "unauthorized" | "forbidden" | "not_found" | "invalid_request" | "conflict" | "internal_error",
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function invalidRequest(message: string): never {
  throw new ApiError(400, "invalid_request", message);
}
