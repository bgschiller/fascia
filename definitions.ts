import express from "express";
import { JsonValue } from "type-fest";

export interface Resp {
  body: string;
  status_code: number;
  headers: { [h: string]: string };
}

export type Handler<T> = (ctx: T) => Promise<Resp>;

export interface Context {
  request: express.Request;
}

export interface Ticket {
  _tag: "ticket";
  id: number;
  purchaser_id: number;
}

export interface User {
  _tag: "user";
  id: number;
}

export function sendEmailReminder(t: any) {}
export function json(t: JsonValue): Resp {
  return {
    body: JSON.stringify(t),
    status_code: 200,
    headers: {}
  };
}

export function getTicket(ticketId: number): Promise<Ticket> {
  return Promise.resolve({
    _tag: "ticket",
    id: ticketId,
    purchaser_id: 5
  });
}

export function verifyJWT(r: express.Request): User {
  // here we would actually do a check on the req
  // to find out if the user is logged in.
  return { id: 5, _tag: "user" };
}
