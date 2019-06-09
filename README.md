# Fascia

A pattern I find really useful in web apps is to separate out authentication, authorization, and the action. In node/express, these end up as middlewares:

```typescript
app.post(
  'tickets/:ticketId/remind',
  passport.authenticate('jwt', { session: false }),
  mustOwnTicket,
  ticketMustBeUnclaimed,
  remindUnclaimedTicket,
);
```

<hr/>

Because both the authorization filters and the action often must hit the database to learn about the resource, it's useful to cache the value on the express Request object.

```typescript{2,9,10}
async function mustOwnTicket(req, res, next) {
  const userId = req.user.id; // passport.authenticate() placed req.user here.
  const ticketId = req.params.ticketId;
  const ticket = await getTicket(ticketId);
  const ownsTicket = ticket && ticket.purchaser_id === userId;
  if (!ownsTicket) {
    return next(new ClientError('must own the ticket', { status_code: 401 }));
  }
  req.ticket = ticket; // store ticket on request for next middleware
  // TS: "Property 'ticket' does not exist on type 'Request'"
  return next();
}
```

However, this is difficult to do in a type-safe way. Each middleware function is independent of its neighbors, and there's no way to say "`mustOwnTicket` should be preceded by `passport.authenticate()`". _(maybe dependent types could do this? I don't think it can by done in TypeScript anyway)_

```typescript{6,7}
app.post(
  'tickets/:ticketId/remind',
  passport.authenticate('jwt', { session: false }),
  mustOwnTicket,
  async (req: express.Request, res: express.Response) => {
    const ticket = req.ticket;
    // TS: "Property 'ticket' does not exist on type 'Request'"
    await sendEmailReminder(ticket);
    res.json({ message: 'success' });
  },
);
```

There are other annoyances about express' API, mostly around returning a response. It's not always clear when a function will return immediately, and when it is merely setting the stage. Compare `res.status(400).json(data)` and `res.json(data).status(400)`. One of those correctly sets the response code, and one doesn't.

Also, can you continue to do work after calling `res.end()`? _Spoiler: you can_. And which response methods call `res.end()`?

```typescript{4,5}
async function (req: express.Request, res: express.Response) {
    const ticket = req.ticket;
    res.json({ message: "success" });
    sendEmailReminder(ticket);
    // is this allowed? We've already returned...
}
```

```typescript
async function (req: express.Request, res: express.Response) {
    const ticket = req.ticket;
    if (notAuthorized) {
        res.json({ message: "you need to log in!" });
    }
    deleteTheTickets(ticket);
    // is this allowed? We've already returned...
    res.json({ message: 'ok' });
}
```

In my opinion, this would be far clearer if it used an explicit return. How would that affect the rest of the API? Does this change also help us with type safety in successive middlewares?

Middleware and actions would now just be regular functions:

```typescript
interface Context {
  request: Request;
}
interface HasUser {
  user: User;
}
interface HasTicket {
  ticket: Ticket;
}
interface HasUnclaimedTicket {
  unclaimedTicket: UnclaimedTicket;
}
interface Response {
  headers: Headers;
  body: string;
  status: StatusCode;
  // ...
}

async function mustOwnTicket<T extends Context & HasUser>(
  ctx: T,
  next: (t: T & HasTicket) => Response,
): Promise<Response> {
  // passport.authenticate() placed user in the context.
  const { request, user } = ctx;
  const userId = user.id;
  const ticketId = request.params.ticketId;
  const ticket = await Ticket.find(ticketId);
  const ownsTicket = ticket && ticket.purchaser_id === userId;
  if (!ownsTicket) {
    throw new ClientError();
  }
  // we include ticket in the context
  return next({ ...ctx, ticket });
}

async function ticketMustBeUnclaimed<T extends Context & HasTicket>(
  ctx: T,
  next: (t: T & HasUnclaimedTicket) => Response,
): Promise<Response> {
  const ticketId = req.params.ticketId;
  const unclaimedTicket = await UnclaimedTicket.find(ticketId);
  if (!unclaimedTicket) {
    throw new ClientError(
      'Ticket could not be found, or has already been claimed',
    );
  }
  return next({ ...ctx, unclaimedTicket });
}

// this is not a good api...
app.post('/:ticketId/revoke', ctx =>
  mustOwnTicket(ctx, ctx =>
    ticketMustBeUnclaimed(ctx, (ctx, revokeUnclaimedTicket)),
  ),
);

// this is better. can we make it work?
app.post(
  '/:ticketId/revoke',
  mustOwnTicket,
  ticketMustBeUnclaimed,
  revokeUnclaimedTicket,
);

const handlers = [mustOwnTicket, ticketMustBeUnclaimed, revokeUnclaimedTicket];
const ctx = { request };

// hmm....
```

I'm not sure how to make these composable and also type-safe. Their original idea is from decorators in python. Maybe that's a useful direction to look?

```typescript
function verifyJWT(r: Request): number {
  return 5;
}
class Ticket {
  static query(v: any): Promise<number> {
    return Promise.resolve(4);
  }
}
function sendEmailReminder(t: any) {}
function json(t: any): Response {
  return {} as Response;
}
interface Request {
  cookies: any;
  params: any;
}
// ignore all that, it's just used to get the environment to work.

interface Context {
  request: Request;
}

interface HasUser {
  user: number;
}
interface HasTicket {
  ticket: number;
}

type Handler<T extends Context = Context> = (ctx: T) => Promise<Response>;

function requiresLogin<T extends Context>(
  next: Handler<T>,
): Handler<T & HasUser> {
  return function decorated(ctx) {
    const user = verifyJWT(ctx.request);
    return next({ ...ctx, user });
  };
}

function mustOwnTicket<T extends Context & HasUser>(
  next: Handler<T>,
): Handler<T & HasTicket> {
  return async function decorated(ctx: T) {
    const ticketId = ctx.request.params.ticketId;
    const ticket = await Ticket.query({
      id: ticketId,
      owner: ctx.user,
    });
    if (!ticket) {
      throw new Error('you must own the ticket to take that action');
    }
    return next({ ...ctx, ticket });
  };
}

async function sendReminder(ctx: Context & HasTicket): Promise<Response> {
  const { ticket } = ctx;
  await sendEmailReminder(ticket);
  return json({ message: 'sent' });
}

const ctx = {} as Context;
mustOwnTicket(sendReminder);
```

Hmm. The type-checking seems to go the opposite way. The
