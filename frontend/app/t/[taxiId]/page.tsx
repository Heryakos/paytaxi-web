import PayTaxiApp from "@/components/paytaxi-app"

// Deep-link landing for QR payload https://paytaxi.et/t/{taxiId}
// Field: scanned in the taxi, opened by Universal/App Links, or typed manually.
export default async function TLinkPage({ params }: { params: Promise<{ taxiId: string }> }) {
  const { taxiId } = await params
  return <PayTaxiApp initialTaxiId={taxiId} />
}