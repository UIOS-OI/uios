import { SiteNav } from "../components/site-nav";
import { BillingCta } from "../components/billing-cta";

export default function PricingPage() {
  return <main><div className="shell legal-page"><SiteNav /><div className="eyebrow">Monetization path</div><h1>Start free. Scale with confidence.</h1><p className="legal-lead">Plans meter routed intelligence units so teams can evaluate first and upgrade when production usage creates value.</p><div className="legal-grid"><article><h2>Builder · $0</h2><p>1,000 included units for evaluation and prototyping.</p></article><article><h2>Scale · $99/mo</h2><p>25,000 included units, production routing, analytics, and team controls.</p><BillingCta planId="scale" /></article><article><h2>Enterprise · custom</h2><p>Private connectivity, managed identity, custom limits, and security review.</p><BillingCta planId="enterprise" /></article></div><p className="section-copy">Billing checkout requires an authenticated workspace and configured Stripe products. Enterprise plans are handled directly by the UIOS team.</p></div></main>;
}
