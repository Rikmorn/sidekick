import type { Shipment, ShipmentRepository } from '../../domain/ports/ShipmentRepository.js';
export class PostgresShipmentRepository implements ShipmentRepository {
  async findById(_id: string): Promise<Shipment | null> { return null; }
  async save(_shipment: Shipment): Promise<void> {}
}
