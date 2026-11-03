type HttpErrorStatusCode = 400 | 404 | 409;

class HttpError extends Error {
  readonly statusCode: HttpErrorStatusCode;
  readonly code: string;

  constructor(statusCode: HttpErrorStatusCode, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export = HttpError;
