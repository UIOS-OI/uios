import { SiteNav } from "../components/site-nav";

const capabilities = [
  ["Model routing", "One stable contract for frontier, open-weight, and private models."],
  ["Agents", "Bounded agent execution with tools, memory, observability, and approvals."],
  ["Knowledge", "Portable memory and retrieval that stays scoped to the workspace."],
  ["Workflows", "Connect business systems and human checkpoints without provider lock-in."],
];

export default function PlatformPage() {
  return <main><div className="shell legal-page"><SiteNav /><div className="eyebrow">UIOS platform</div><h1>The fabric beneath intelligence.</h1><p className="legal-lead">UIOS is a vendor-neutral control plane for models, agents, knowledge, tools, and workflows. Build against one contract while providers and execution systems evolve behind it.</p><div className="legal-grid">{capabilities.map(([title, body]) => <article key={title}><h2>{title}</h2><p>{body}</p></article>)}</div><h2>How it works</h2><p>Applications send a request to UIOS. The gateway authenticates the workspace, Aegis evaluates policy, the router selects a healthy provider, and the response is recorded for usage and audit.</p><div className="actions" style={{ justifyContent: "flex-start" }}><a className="button" href="/connect">Connect with the team ↗</a><a className="button button-light" href="/">Back to overview</a></div></div></main>;
}
