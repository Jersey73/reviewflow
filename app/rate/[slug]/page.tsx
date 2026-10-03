import CustomerFlow from "@/components/CustomerFlow";
import { getBusinessBySlug } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);

  if (!business) {
    return (
      <main className="center-page">
        <div className="panel">
          <p className="eyebrow">REVIEWFLOW</p>
          <h1>Business not found</h1>
          <p className="muted">Check the QR code or ask the business for a new link.</p>
        </div>
      </main>
    );
  }

  return <CustomerFlow business={business} />;
}