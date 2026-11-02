import { EventEmitter } from 'events';

class DriverEventEmitter extends EventEmitter {}

export const driverEvents = new DriverEventEmitter();

// Limit listeners warning threshold
driverEvents.setMaxListeners(200);

export type PaymentSuccessEvent = {
  transactionId: string;
  driverProfileId: string;
  taxiId: string;
  amount: number;
  currency: string;
  seats: number;
  passengerPhone?: string | null;
  confirmedAt: string;
};

export function broadcastPaymentSuccess(event: PaymentSuccessEvent) {
  driverEvents.emit(`payment:${event.driverProfileId}`, event);
  driverEvents.emit('payment:all', event);
}
