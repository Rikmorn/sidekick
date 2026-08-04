import { priceCart, type Cart } from '../services/checkout-service.js';

export async function postCheckoutQuote(body: unknown): Promise<Response> {
  const cart = body as Cart;
  if (typeof cart?.customerId !== 'string') {
    return new Response('customer_id required', { status: 400 });
  }
  const priced = await priceCart(cart);
  return Response.json(priced);
}
