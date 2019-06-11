import knex, { QueryCallback } from 'knex';
import { Omit } from 'type-fest';
import { Connection, TypedBody } from './adapter';

export class ResourceError<C> extends Error {
  conn: C;
  constructor(conn: C, message: string) {
    super(message);
    this.conn = conn;
  }
}

export class RecordNotFound<C> extends ResourceError<C> {
  constructor(conn: C) {
    super(conn, 'Record was not found');
  }
}

export class DisallowedKeyError<C> extends ResourceError<C> {
  keys: (number | string | symbol)[];
  constructor(conn: C, keys: (number | string | symbol)[]) {
    super(conn, 'data contained a disallowed key');
    this.keys = keys;
  }
}

export interface ResourceOptions {
  db: knex;
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
export function mkFind<T extends ModelBase>({
  db,
  tableName,
}: ResourceOptions) {
  return async function find<C extends Connection & WithWhere<T>>(
    conn: C,
  ): Promise<C & WithRows<T>> {
    let p = db(tableName).select('*');
    if (conn.criterion) {
      p = p.where(conn.criterion);
    }
    return {
      ...conn,
      rows: await p,
    };
  };
}

export interface WithRow<T> {
  row: T;
}
export function mkGet<T>({ db, tableName }: ResourceOptions) {
  return async function get<C extends Connection>(
    conn: C,
  ): Promise<C & WithRow<T>> {
    const records = await db(tableName)
      .select('*')
      .where('id', conn.params.id)
      .limit(1);
    if (records.length === 0) throw new RecordNotFound(conn);
    return {
      ...conn,
      row: records[0],
    };
  };
}

export function mkCreate<T extends ModelBase>({
  db,
  tableName,
}: ResourceOptions) {
  return async function create<C extends TypedBody<Omit<T, 'id'>>>(
    conn: C,
  ): Promise<C & WithRow<T>> {
    const created = await db(tableName).insert(conn.body, '*');
    return {
      ...conn,
      row: created[0],
    };
  };
}

export function mkUpdate<T extends ModelBase>({
  db,
  tableName,
}: ResourceOptions) {
  return async function update<C extends TypedBody<Partial<Omit<T, 'id'>>>>(
    conn: C,
  ): Promise<C & WithRow<T>> {
    const updated = (await db(tableName)
      .where('id', conn.params.id)
      .returning('*')
      .update(conn.body, '*')) as T[];
    if (updated.length === 0) throw new RecordNotFound(conn);
    return { ...conn, row: updated[0] };
  };
}

export function mkDestroy({ db, tableName }: ResourceOptions) {
  return async function destroy<C extends Connection>(conn: C): Promise<C> {
    const numRemoved = await db(tableName)
      .where('id', conn.params.id)
      .delete();
    if (numRemoved === 0) throw new RecordNotFound(conn);
    return conn;
  };
}

export default function pgResource<T extends ModelBase>(
  options: ResourceOptions,
) {
  return {
    get: mkGet<T>(options),
    find: mkFind<T>(options),
    create: mkCreate<T>(options),
    update: mkUpdate<T>(options),
    destroy: mkDestroy(options),
  };
}
