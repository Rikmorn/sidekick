import { quote } from '../services/order-service.js';

export async function getQuote(orderId: string): Promise<Response> {
  if (orderId.length === 0) {
    return new Response('order id required', { status: 400 });
  }
  const result = await quote(orderId);
  if (result === null) return new Response('not found', { status: 404 });
  return Response.json(result);
}
