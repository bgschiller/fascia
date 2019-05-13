import express from "express";
import passport from "passport";
import { ClientError } from "./errors";
import { getTicket, sendEmailReminder } from "./definitions";

const app = express();
// prelude

// end prelude

async function mustOwnTicket(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!req.user) {
    throw new Error(
      "MUST use passport.authenticate() earlier in the middleware chain!"
    );
  }
  const userId = req.user.id; // passport.authenticate() placed req.user here.
  const ticketId = req.params.ticketId;
  const ticket = await getTicket(ticketId);
  const ownsTicket = ticket && ticket.purchaser_id === userId;
  if (!ownsTicket) {
    return next(new ClientError("must own the ticket", { status_code: 401 }));
  }
  req.ticket = ticket; // store ticket on request for next middleware
  return next();
}

app.post(
  "tickets/:ticketId/remind",
  passport.authenticate("jwt", { session: false }),
  mustOwnTicket,
  async (req: express.Request, res: express.Response) => {
    const ticket = req.ticket;
    await sendEmailReminder(ticket);
    res.json({ message: "success" });
  }
);
