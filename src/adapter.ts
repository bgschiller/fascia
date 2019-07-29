import { RequestHandler, Request, Response, NextFunction } from 'express';
const httpMocks = require('node-mocks-http');
const emptyPromise = require('empty-promise');
import { MockResponse } from 'node-mocks-http';
import { errorHandler } from './errors';
import { EmptyPromise } from 'empty-promise';
import * as t from 'io-ts';
import * as tP from 'io-ts-promise';
import { IncomingHttpHeaders } from 'http';

export type Dictionary<V> = { [k: string]: V };

export interface Connection {
  body: unknown;
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  params: Dictionary<string>;
  query: Dictionary<string>;
  _req: Request;
}

export interface Resp {
  body: string;
  status_code: number;
  headers: { [h: string]: string };
  conn?: Connection;
}

interface JsonOptions {
  status_code?: number;
  headers?: Dictionary<string>;
}
export function json(
  conn: Connection,
  body: any,
  opts: JsonOptions = {},
): Resp {
  const headers = opts.headers || {};
  return {
    body: JSON.stringify(body),
    status_code: opts.status_code || 200,
    headers: { ...headers, 'content-type': 'application/json' },
    conn,
  };
}

export function createConnection(req: Request): Connection {
  return {
    body: req.body,
    headers: req.headers,
    method: req.method,
    params: req.params,
    path: req.path,
    query: req.query,
    _req: req,
  };
}

export function fireResponse(resp: Resp, res: Response): void {
  res.status(resp.status_code);
  for (const [k, v] of Object.entries(resp.headers)) {
    res.setHeader(k, v);
  }
  res.send(resp.body);
}

function asPromise<T>(valueOrP: T | Promise<T>): Promise<T> {
  // "upcast" a regular value into a promise.
  return Promise.resolve(valueOrP);
}

export function withConnection(
  handler: (conn: Connection) => Resp | Promise<Resp>,
): RequestHandler {
  return function(req: Request, res: Response, next: NextFunction) {
    asPromise(handler(createConnection(req)))
      .catch(errorHandler)
      .then(resp => fireResponse(resp, res))
      .catch(next);
  };
}

interface FakeResponse extends MockResponse<Response> {
  ended: Promise<void>;
}

export function fakeResponse(req: Request): FakeResponse {
  const res = httpMocks.createResponse({ req }) as FakeResponse;
  const p = emptyPromise();
  res.on('end', () => p.resolve());
  res.ended = p;
  return res;
}

export function readRes(res: FakeResponse): Resp {
  return {
    body: res._getData(),
    status_code: res._getStatusCode(),
    headers: res._getHeaders(),
  };
}

export function nextToPromise(): { next: NextFunction; p: EmptyPromise } {
  const p = emptyPromise();
  function next(err?: any) {
    if (err) p.reject(err);
    else p.resolve();
  }
  return { next, p };
}

export interface TypedBody<T> extends Connection {
  body: T;
}
export function decodeBody<T, C extends Connection>(
  validator: t.Decoder<unknown, T>,
): (conn: C) => Promise<C & TypedBody<T>> {
  return async function(conn) {
    const body = await tP.decode(validator, conn.body);
    return {
      ...conn,
      body,
    };
  };
}

// function isErrorRequestHandler(
//   h: RequestHandler | ErrorRequestHandler,
// ): h is ErrorRequestHandler {
//   return h.length === 4;
// }

// function mergeResponses(r1: Resp | undefined, r2: Resp): Resp {
//   if (!r1) return r2;
//   return {
//     body: r1.body || r2.body,
//     status_code: r1.status_code || r2.status_code,
//     headers: {
//       ...r1.headers,
//       ...r2.headers,
//     },
//   };
// }

// const REQUEST_ENDED = Symbol();
// export function fromExpressMiddleware(
//   handler: RequestHandlerParams,
// ): (c: Connection) => Promise<Connection> {
//   const handlers = Array.isArray(handler) ? handler : [handler];
//   return async function(conn_: Connection): Promise<Connection> {
//     let conn = conn_;
//     let err;
//     for (handler of handlers) {
//       const { next, p } = nextToPromise();
//       const res = fakeResponse(conn._req);

//       if (isErrorRequestHandler(handler)) {
//         if (err) {
//           handler(err, conn._req, res, next);
//           // error handler
//         }
//       } else {
//         handler(conn._req, res, next);
//       }

//       await Promise.race([p, res.ended.then(() => REQUEST_ENDED)]).then(
//         result => {
//           const resp = readRes(res);
//           if (result === REQUEST_ENDED) {
//             return { ...conn, response: resp };
//           }
//         },
//         error => {
//           const resp = readRes(res);
//           conn.response = mergeResponses(conn.response, resp);
//           err = error;
//         },
//       );
//     }
//   };
// }
