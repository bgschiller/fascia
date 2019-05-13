import express, { Request } from "express";
import { compose } from "@typed/compose";
import {
  User,
  Ticket,
  Resp,
  Handler,
  Context,
  verifyJWT,
  json,
  getTicket,
  sendEmailReminder
} from "./definitions";
import { ControllerError, ClientError } from "./errors";

const app = express();

interface HasUser {
  user: User;
}
interface HasTicket {
  ticket: Ticket;
}

function fireResponse(response: Resp, res: express.Response) {
  res.status(response.status_code);
  for (const [k, v] of Object.entries(response.headers)) {
    res.setHeader(k, v);
  }
  res.send(response.body);
}

function catchErrors(next: Handler<Context>): Handler<Context> {
  return function decorated(ctx) {
    return next(ctx).catch(err => {
      if (err instanceof ControllerError) {
        return err.toResponse();
      }
      throw err;
    });
  };
}

function requiresLogin(next: Handler<Context & HasUser>): Handler<Context> {
  return function decorated(ctx) {
    const user = verifyJWT(ctx.request);
    return next({ ...ctx, user });
  };
}

async function deleteEverything(ctx: Context & HasUser): Promise<Resp> {
  const u = ctx.user;
  // do something with u here
  return json({ message: "deleted" });
}

app.delete("/everything", async (req, res) => {
  const context: Context = { request: req };
  const controller: (ctx: Context) => Promise<Resp> = requiresLogin(
    deleteEverything
  );
  const response: Resp = await controller(context);
  fireResponse(response, res);
});

function mustOwnTicket(
  next: Handler<Context & HasUser & HasTicket>
): Handler<Context & HasUser> {
  return async function decorated(ctx) {
    const user = ctx.user;
    const ticket = await getTicket(ctx.request.params.ticketId);
    if (ticket.purchaser_id !== user.id) {
      throw new ClientError("Must be owner of ticket to take that action", {
        status_code: 401
      });
    }
    return next({ ...ctx, ticket });
  };
}

async function sendReminder(ctx: Context & HasTicket): Promise<Resp> {
  const { ticket } = ctx;
  await sendEmailReminder(ticket);
  return json({ message: "sent" });
}

app.post("/remind", async (req: express.Request, res: express.Response) => {
  const context: Context = { request: req };
  const response = await catchErrors(
    requiresLogin(mustOwnTicket(sendReminder))
  )(context);
  // what if we forget one? The following will error if you uncomment them
  // const response2 = await catchErrors(mustOwnTicket(sendReminder))(context);
  // const response3 = await catchErrors(requiresLogin(sendReminder))(context);

  fireResponse(response, res);
});

function timed(next: Handler<Context>): Handler<Context> {
  return async function decorated(ctx): Promise<Resp> {
    const start = Date.now();
    const p = next(ctx);
    p.finally(() => {
      const time = Date.now() - start;
      console.log("timed request", time);
    });
    return p;
  };
}

// benefits:

// - Returning a Promise<Resp> makes controllers easier to test: no
//   need to stub out an express.Response and make assertions about
//   what methods were called on it.
// - Because each middleware produces a wrapper function, it can take actions
//   both before and after its `next` argument. This is more powerful than
//   express' middleware, each of which can only take action either before *or* after, but not both.
// - We can encode the requirements of each middleware and controller into the type
//   system, so that the compiler will have our back and keep us from making silly mistakes:
//   "You're using `ctx.user` but no User property exists on ctx"

// how to make it more ergonomic?

// we could use compose?
const reminderController: Handler<Context> = compose(
  catchErrors,
  requiresLogin,
  mustOwnTicket
)(sendReminder);

// not a whole lot better. But now that we have a single Handler<Context> that does what we want,

function toExpress(controller: Handler<Context>): express.RequestHandler {
  return function expressHandler(req, res, next) {
    const context: Context = { request: req };
    return controller(context)
      .then((resp: Resp) => fireResponse(resp, res))
      .catch(next);
  };
}

// We can combine these two into a single function

type PromiseMiddleware<C1, C2> = (next: Handler<C2>) => Handler<C1>;

function fromPromises(controller: Handler<Context>): express.RequestHandler;
function fromPromises<C>(
  m1: PromiseMiddleware<C, Context>,
  controller: Handler<C>
): express.RequestHandler;
function fromPromises<C1, C2>(
  m1: PromiseMiddleware<C1, Context>,
  m2: PromiseMiddleware<C2, C1>,
  controller: Handler<C2>
): express.RequestHandler;
function fromPromises<C1, C2, C3>(
  m1: PromiseMiddleware<C1, Context>,
  m2: PromiseMiddleware<C2, C1>,
  m3: PromiseMiddleware<C3, C2>,
  controller: Handler<C3>
): express.RequestHandler;
function fromPromises<C1, C2, C3, C4>(
  m1: PromiseMiddleware<C1, Context>,
  m2: PromiseMiddleware<C2, C1>,
  m3: PromiseMiddleware<C3, C2>,
  m4: PromiseMiddleware<C4, C3>,
  controller: Handler<C4>
): express.RequestHandler;
function fromPromises(
  ...middlewaresAndController: (
    | PromiseMiddleware<any, any>
    | Handler<Context>)[]
): express.RequestHandler {
  let controller = middlewaresAndController.pop() as Handler<any>;
  while (middlewaresAndController.length) {
    const middleware = middlewaresAndController.pop() as PromiseMiddleware<
      any,
      any
    >;
    controller = middleware(controller);
  }
  return toExpress(controller);
}

// https://stackoverflow.com/questions/49310886/typing-compose-function-in-typescript-flow-compose?rq=1

app.post(
  "/remind",
  fromPromises(catchErrors, requiresLogin, mustOwnTicket, sendReminder)
);

catchErrors(ctx =>
  requiresLogin(ctx => mustOwnTicket(ctx => sendReminder(ctx)))
);

class Comp<T, U> {
  readonly apply: (x: T) => U;

  constructor(apply: (x: T) => U) {
    this.apply = apply;
  }

  // note the extra type parameter, and that the intermediate type T is not visible in the output type
  _<V>(f: (x: V) => T): Comp<V, U> {
    return new Comp(x => this.apply(f(x)));
  }
}

const controller: Handler<Context> = new Comp(catchErrors)
  ._(requiresLogin)
  ._(mustOwnTicket)(sendReminder);

/*
  controller = (catchErrors . (requiresLogin . (mustOwnTicket . sendReminder)))
*/
