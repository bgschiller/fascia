import db from "./db";
import { QueryCallback } from "knex";
import { Omit } from "type-fest";

export class ResourceError<C> extends Error {
  conn: C;
  constructor(conn: C, message: string) {
    super(message);
    this.conn = conn;
  }
}

export class RecordNotFound<C> extends ResourceError<C> {
  constructor(conn: C) {
    super(conn, "Record was not found");
  }
}

export class DisallowedKeyError<C> extends ResourceError<C> {
  keys: (number | string | symbol)[];
  constructor(conn: C, keys: (number | string | symbol)[]) {
    super(conn, "data contained a disallowed key");
    this.keys = keys;
  }
}

export interface ResourceOptions {
  tableName: string;
}
interface ModelBase {
  id: string | number;
}

export interface WithWhere<T> {
  criterion?: QueryCallback | Partial<T>;
}
export interface WithRows<T> {
  rows: T[];
}
export function mkFind<T extends ModelBase>({ tableName }: ResourceOptions) {
  return async function find<C extends WithWhere<T>>(
    conn: C
  ): Promise<C & WithRows<T>> {
    let p = db(tableName).select("*");
    if (conn.criterion) {
      p = p.where(conn.criterion);
    }
    return {
      ...conn,
      rows: await p
    };
  };
}

export interface WithId {
  id: string | number;
}
export interface WithRow<T> {
  row: T;
}
export function mkGet<T extends ModelBase>({ tableName }: ResourceOptions) {
  return async function get<C extends WithId>(
    conn: C
  ): Promise<C & WithRow<T>> {
    const records = await db(tableName)
      .select("*")
      .where("id", conn.id)
      .limit(1);
    if (records.length === 0) throw new RecordNotFound(conn);
    return { ...conn, row: records[0] };
  };
}

export interface WithData<T extends ModelBase> {
  data: Omit<T, "id">;
}
export function mkCreate<T extends ModelBase>({ tableName }: ResourceOptions) {
  return async function create<C extends WithData<T>>(
    conn: C
  ): Promise<C & WithRow<T>> {
    const created = (await db(tableName).insert(conn.data, "*")) as T[];
    return { ...conn, row: created[0] };
  };
}

export function mkUpdate<T extends ModelBase>({ tableName }: ResourceOptions) {
  return async function update<C extends WithData<T> & WithId>(
    conn: C
  ): Promise<C & WithRow<T>> {
    const updated = (await db(tableName)
      .where("id", conn.id)
      .returning("*")
      .update(conn.data, "*")) as T[];
    if (updated.length === 0) throw new RecordNotFound(conn);
    return { ...conn, row: updated[0] };
  };
}

export function mkDestroy({ tableName }: ResourceOptions) {
  return async function destroy<C extends WithId>(conn: C): Promise<C> {
    const numRemoved = await db(tableName)
      .where("id", conn.id)
      .delete();
    if (numRemoved === 0) throw new RecordNotFound(conn);
    return conn;
  };
}

export default function pgResource<T extends ModelBase>(
  options: ResourceOptions
) {
  return {
    get: mkGet<T>(options),
    find: mkFind<T>(options),
    create: mkCreate<T>(options),
    update: mkUpdate<T>(options),
    destroy: mkDestroy(options)
  };
}
