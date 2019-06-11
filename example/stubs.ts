interface Ticket {
  id: number;
  purchaser_id: number;
}

function getTicket(ticketId: number): Promise<Ticket> {
  return Promise.resolve({ id: ticketId, purchaser_id: 1 });
}

async function sendEmailReminder(t: Ticket): Promise<void> {}
