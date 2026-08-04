export interface Invoice {
  id: string;
  merchantId: string;
  totalCents: number;
  status: 'draft' | 'sent' | 'paid';
}

export interface Session {
  userId: string;
  merchantId: string;
}

export interface Request {
  params: Record<string, string>;
  session: Session | null;
}

export interface InvoiceStore {
  get(id: string): Promise<Invoice | null>;
  setStatus(id: string, status: Invoice['status']): Promise<Invoice>;
}

/** Load the invoice at :id, or throw if the caller may not touch it. */
async function loadOwnedInvoice(
  req: Request,
  store: InvoiceStore,
): Promise<Invoice> {
  if (req.session === null) {
    throw new Error('unauthenticated');
  }
  const invoice = await store.get(req.params.id);
  if (invoice === null) {
    throw new Error('not found');
  }
  if (invoice.merchantId !== req.session.merchantId) {
    throw new Error('forbidden');
  }
  return invoice;
}

// TODO(billing): these should throw typed errors the router maps to statuses
/** GET /invoices/:id */
export async function getInvoice(
  req: Request,
  store: InvoiceStore,
): Promise<Invoice> {
  return loadOwnedInvoice(req, store);
}

/** POST /invoices/:id/send */
export async function sendInvoice(
  req: Request,
  store: InvoiceStore,
): Promise<Invoice> {
  const invoice = await loadOwnedInvoice(req, store);
  return store.setStatus(invoice.id, 'sent');
}
