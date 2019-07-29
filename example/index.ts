import express from 'express';
import {
  fakeResponse,
  createConnection,
  fireResponse,
  nextToPromise,
  withConnection,
  decodeBody,
  TypedBody,
  readRes,
  Connection,
  Resp,
  json,
} from '../src/adapter';
import {
  errorHandler,
  NotAuthorized,
  ControllerError,
  EarlyResponse,
} from '../src/errors';
import passport from 'passport';
import { pgResource, WithItemId, itemIdFromUrl } from '../src/pg-resource';
import db from './db';
import * as t from 'io-ts';

const app = express();

interface WithUser {
  user: any;
}
async function requiresLogin(conn: Connection): Promise<Connection & WithUser> {
  const res = fakeResponse(conn._req);
  const { p, next } = nextToPromise();
  passport.authenticate('jwt')(conn._req, res, next);
  // There is a possibility that passport responds with a redirect or something
  // and never calls next? In this sitation, we listen for `res.ended`
  const result = await Promise.race([p, res.ended.then(() => 'res ended')]);
  if (result === 'res ended') {
    throw EarlyResponse.fromResp(readRes(res));
  }
  return { ...conn, user: conn._req.user };
}

function deleteEverything(conn: Connection & WithUser): Promise<Resp> {
  return Promise.resolve({
    body: 'deleted',
    headers: {},
    status_code: 200,
    conn,
  });
}

app.delete('/everything', async (req, res) => {
  return Promise.resolve(createConnection(req))
    .then(requiresLogin)
    .then(deleteEverything)
    .catch(errorHandler)
    .then(response => fireResponse(response, res));
});

app.delete(
  '/everything',
  withConnection(conn =>
    Promise.resolve(conn)
      .then(requiresLogin)
      .then(deleteEverything),
  ),
);

interface WithTicket {
  ticket: Ticket;
}
async function mustOwnTicket(
  conn: Connection & WithUser,
): Promise<Connection & WithUser & WithTicket> {
  const { user } = conn;
  const ticket = await getTicket(Number(conn.params.ticketId));
  if (ticket.purchaser_id !== user.id) {
    throw new NotAuthorized('Must be owner of ticket to take that action');
  }
  return { ...conn, ticket };
}

async function sendReminder(conn: Connection & WithTicket): Promise<Resp> {
  const { ticket } = conn;
  await sendEmailReminder(ticket);
  return json(conn, { message: 'sent' });
}

app.post('/:ticketId/remind', (req: express.Request, res: express.Response) => {
  return Promise.resolve(createConnection(req))
    .then(requiresLogin)
    .then(mustOwnTicket)
    .then(sendReminder)
    .catch(errorHandler)
    .then((response: Resp) => fireResponse(response, res));
});

app.post(
  '/:ticketId/remind',
  withConnection(conn =>
    Promise.resolve(conn)
      .then(requiresLogin)
      .then(mustOwnTicket)
      .then(sendReminder),
  ),
);

// What about CRUD?
const TalkV = t.type({
  id: t.number,
  user_id: t.number,
  title: t.string,
  description: t.string,
});
type Talk = t.TypeOf<typeof TalkV>;

const talkCrud = pgResource<Talk>({ db, tableName: 'talk' });

function setUserId<T, C extends TypedBody<T> & WithUser>(conn: C) {
  return {
    ...conn,
    body: {
      ...conn.body,
      user_id: conn.user.id,
    },
  };
}

const talkRouter = express.Router();

async function mustOwnTalk<C extends Connection & WithUser & WithItemId>(
  conn: C,
): Promise<C> {
  const { row } = await talkCrud.get(conn);
  if (row.user_id !== conn.user.id) {
    throw new NotAuthorized('You must own the talk to take this action');
  }
  return conn;
}

function jsonFrom<C extends Connection, K extends keyof C>(
  k: K,
): (conn: C) => Resp {
  return conn => json(conn, conn[k]);
}

const CreateUpdateTalkV = t.type({
  title: t.string,
  description: t.string,
});

talkRouter.get(
  '/',
  withConnection(conn => talkCrud.find(conn).then(jsonFrom('rows'))),
);
talkRouter.post(
  '/',
  withConnection(conn =>
    requiresLogin(conn)
      .then(decodeBody(CreateUpdateTalkV))
      .then(setUserId)
      .then(talkCrud.create)
      .then(jsonFrom('row')),
  ),
);
app.patch(
  // to update a talk, send a PATCH request
  '/talks/:id', // to this endpoint
  withConnection(
    conn =>
      requiresLogin(conn) // you must be logged in
        .then(itemIdFromUrl('id')) // Look to the :id in the url params for which talk
        .then(mustOwnTalk) // you must own the talk in question
        .then(decodeBody(CreateUpdateTalkV)) // request body must match this interface
        .then(talkCrud.update)
        .then(jsonFrom('row')), // respond with json
  ),
);
talkRouter.delete(
  '/:id',
  withConnection(conn =>
    requiresLogin(conn)
      .then(itemIdFromUrl('id'))
      .then(mustOwnTalk)
      .then(talkCrud.destroy)
      .then(conn => json(conn, { status: 'ok' })),
  ),
);

app.use('/talks', talkRouter);
