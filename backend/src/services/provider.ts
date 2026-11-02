export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED"

export type InitiatePaymentInput = {
  transactionId: string
  amount: number
  currency: string
  taxiId: string
  returnUrl?: string
}

export type InitiatePaymentResult = {
  provider: "ADDISPAY_SANDBOX"
  status: PaymentStatus
  providerReference: string
  checkoutUrl: string
}

export interface PaymentProvider {
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>
  verifyWebhook(signature: string | null, rawBody: string): boolean
}

export class AddisPaySandboxProvider implements PaymentProvider {
  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    return {
      provider: "ADDISPAY_SANDBOX",
      status: "PENDING",
      providerReference: `ADSBX-${input.transactionId.slice(-8).toUpperCase()}`,
      checkoutUrl: input.returnUrl ?? "/?payment=pending",
    }
  }

  verifyWebhook(signature: string | null, rawBody: string) {
    return Boolean(rawBody) && (signature === "sandbox-signature" || process.env.NODE_ENV !== "production")
  }
}

export const paymentProvider = new AddisPaySandboxProvider()
