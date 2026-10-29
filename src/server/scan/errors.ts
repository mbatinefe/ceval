export class ScanError extends Error {
  code: string;
  status: 400 | 401 | 404 | 409 | 413 | 422 | 429 | 502 | 503 | 504;
  constructor(code: string, message: string, status: ScanError["status"]) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
