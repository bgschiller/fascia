import { Resp } from "./definitions";

export class ControllerError extends Error {
  status_code: number;
  constructor(message: string, { status_code }: { status_code: number }) {
    super(message);
    this.status_code = status_code || 500;
  }
  toResponse(): Resp {
    return {
      body: this.message,
      status_code: this.status_code,
      headers: {}
    };
  }
}
export class ClientError extends ControllerError {
  constructor(message: string, { status_code }: { status_code: number }) {
    super(message, { status_code: status_code || 400 });
  }
}
