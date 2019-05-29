import { Connection, Resp } from './definitions';
import {
  RequestHandler,
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from 'express';
const httpMocks = require('node-mocks-http');
const emptyPromise = require('empty-promise');
import { MockResponse } from 'node-mocks-http';
import { errorHandler } from './errors';

export function createConnection(req: Request): Connection {
  return {
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

export function withConnection(
  handler: (conn: Promise<Connection>) => Promise<Resp>,
): RequestHandler {
  return function(req: Request, res: Response, next: NextFunction) {
    handler(Promise.resolve(createConnection(req)))
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

interface PossiblyCompleteResponse extends Resp {
  complete: boolean;
}

export function readRes(res: FakeResponse): PossiblyCompleteResponse {
  return {
    complete: res._isEndCalled(),
    body: res._getData(),
    status_code: res._getStatusCode(),
    headers: res._getHeaders(),
  };
}

export function nextToPromise() {
  const p = emptyPromise();
  function next(err?: any) {
    if (err) p.reject(err);
    else p.resolve();
  }
  return { next, p };
}

function isErrorRequestHandler(
  h: RequestHandler | ErrorRequestHandler,
): h is ErrorRequestHandler {
  return h.length === 4;
}

function mergeResponses(r1: Resp | undefined, r2: Resp): Resp {
  if (!r1) return r2;
  return {
    body: r1.body || r2.body,
    status_code: r1.status_code || r2.status_code,
    headers: {
      ...r1.headers,
      ...r2.headers,
    },
  };
}

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
