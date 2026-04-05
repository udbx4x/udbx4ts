export class UdbxError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "UdbxError";
  }
}

export class UdbxFormatError extends UdbxError {
  constructor(message?: string) {
    super(message);
    this.name = "UdbxFormatError";
  }
}

export class UdbxNotFoundError extends UdbxError {
  constructor(what: string, id?: number) {
    super(id !== undefined ? `${what} not found (id=${id})` : `${what} not found`);
    this.name = "UdbxNotFoundError";
  }
}

export class UdbxUnsupportedError extends UdbxError {
  constructor(what: string) {
    super(`Unsupported: ${what}`);
    this.name = "UdbxUnsupportedError";
  }
}

export class UdbxConstraintError extends UdbxError {
  constructor(what: string) {
    super(`Constraint violation: ${what}`);
    this.name = "UdbxConstraintError";
  }
}

export class UdbxIOError extends UdbxError {
  constructor(cause?: Error) {
    super(cause ? `IO error: ${cause.message}` : "IO error");
    this.name = "UdbxIOError";
  }
}
