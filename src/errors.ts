import { Resp, Dictionary } from './adapter';
import { DecodeError, isDecodeError } from 'io-ts-promise';
import { failure as ioTsFailure } from 'io-ts/lib/PathReporter';

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
      headers: {},
    };
  }
}

interface EarlyResponseOptions {
  status_code: number;
  headers: Dictionary<string>;
}
export class EarlyResponse extends ControllerError {
  headers: Dictionary<string>;
  constructor(body: string, { status_code, headers }: EarlyResponseOptions) {
    super(body, { status_code });
    this.headers = headers;
  }
  toResponse(): Resp {
    return {
      body: this.message,
      status_code: this.status_code,
      headers: this.headers,
    };
  }
  static json(
    body: any,
    { status_code, headers }: EarlyResponseOptions,
  ): EarlyResponse {
    return new EarlyResponse(JSON.stringify(body), {
      status_code,
      headers: { ...headers, 'content-type': 'application/json' },
    });
  }
  static fromResp(resp: Resp) {
    return new EarlyResponse(resp.body, {
      status_code: resp.status_code,
      headers: resp.headers,
    });
  }
}
export class ClientError extends ControllerError {
  constructor(message: string, { status_code }: { status_code: number }) {
    super(message, { status_code: status_code || 400 });
  }
}
export class NotAuthorized extends ControllerError {
  constructor(message: string) {
    super(message, { status_code: 401 });
  }
}

function decodeErrorResponse(err: DecodeError): Resp {
  return {
    body: `errors:\n${ioTsFailure(err.errors).join('\n')}`,
    status_code: 422,
    headers: {},
  };
}

export function errorHandler(err: any): Resp {
  if (err instanceof ControllerError) return err.toResponse();
  if (isDecodeError(err)) return decodeErrorResponse(err);
  return {
    body: 'an error occurred',
    status_code: 500,
    headers: {},
  };
}
