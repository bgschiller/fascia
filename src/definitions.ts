import express, { Request, Response } from 'express';

export type Dictionary<V> = { [k: string]: V };

export interface Connection {
  body: unknown;
  method: string;
  path: string;
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
