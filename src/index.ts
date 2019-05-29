import express, { Request } from 'express';
import { compose } from '@typed/compose';
import { Connection, Resp, json } from './definitions';
import {
  fakeResponse,
  createConnection,
  fireResponse,
  nextToPromise,
  withConnection,
} from './adapter';
import {
  ControllerError,
  ClientError,
  errorHandler,
  NotAuthorized,
} from './errors';
import emptyPromise from 'empty-promise';
import passport from 'passport';

const app = express();

interface WithUser {
  user: any;
}
function requiresLogin(conn: Connection): Promise<Connection & WithUser> {
  const res = fakeResponse(conn._req);
  const { p, next } = nextToPromise();
  passport.authenticate('jwt')(conn._req, res, next);
  // TODO what if passport responds with a redirect or something and never calls next?
  return p.then(() => ({ ...conn, user: conn._req.user }));
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
    conn
      .then(requiresLogin)
      .then(mustOwnTicket)
      .then(sendReminder),
  ),
);
