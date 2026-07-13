export function SiteNav() {
  return <nav className="nav" aria-label="Main navigation">
    <a className="brand" href="/"><span className="brand-mark">UI</span>UIOS</a>
    <div className="nav-links"><a href="/platform">Platform</a><a href="/security">Aegis</a><a href="/products">Products</a><a href="/pricing">Pricing</a></div>
    <a className="button" href="/connect">Request early access ↗</a>
  </nav>;
}
