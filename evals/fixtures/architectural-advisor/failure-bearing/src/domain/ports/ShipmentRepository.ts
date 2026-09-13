export interface ShipmentRepository {
  findById(id: string): Promise<Shipment | null>;
  save(shipment: Shipment): Promise<void>;
}
export interface Shipment { id: string; status: 'created' | 'in_transit' | 'delivered' | 'exception'; updatedAt: string; }
