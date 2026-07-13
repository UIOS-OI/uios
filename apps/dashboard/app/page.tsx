import { UiosCommandCenter } from "./components/uios-command-center";
import { UiosPlayground } from "./components/uios-playground";
import { BillingCta } from "./components/billing-cta";
import { SystemReadiness } from "./components/system-readiness";
import { AgentLab } from "./components/agent-lab";
import { UsagePanel } from "./components/usage-panel";
import { OperationsPulse } from "./components/operations-pulse";
import { ApiKeyConsole } from "./components/api-key-console";
import { MyceliumField } from "./components/mycelium-field";
import { WorkspaceSession } from "./components/workspace-session";
import { SiteNav } from "./components/site-nav";

const capabilities = [
  ["Model router", "Route every request across frontier, open-weight and private models using one stable contract."],
  ["Agent engine", "Run OpenAI Agents, LangGraph, CrewAI, AutoGen or custom agents behind one execution layer."],
  ["Memory + knowledge", "Make conversation, project and enterprise knowledge portable across providers."],
  ["Workflow + MCP", "Connect tools, business systems and human approvals without rebuilding every integration."],
  ["Aegis security", "Ship identity, policy, secrets, prompt-injection defense and auditability as infrastructure."],
  ["Optimization", "Measure cost, latency, quality and reliability, then improve routing with real evidence."],
];

const stack = ["Applications", "UIOS SDK", "Gateway + tenant plane", "Router · Agents · Memory · Workflows", "Aegis security plane"];

export default function HomePage() {
  return (
    <main>
      <div className="shell">
        <SiteNav />

        <WorkspaceSession />

        <UiosCommandCenter />
        <UiosPlayground />
        <SystemReadiness />
        <AgentLab />
        <UsagePanel />
        <OperationsPulse />
        <ApiKeyConsole />

        <section className="hero" id="top">
          <MyceliumField />
          <div className="eyebrow">Universal Intelligence Operating System</div>
          <h1>Build once.<br />Connect everything.</h1>
          <p className="hero-copy">UIOS is a universal intelligence platform in the making—designed to orchestrate models, agents, knowledge, tools and workflows without locking applications to one provider.</p>
          <div className="actions"><a className="button" href="#platform">Explore the vision</a><a className="button button-light" href="/connect">Request early access ↗</a></div>
          <div className="architecture" aria-label="UIOS architecture">
            <div className="architecture-grid">
              {stack.slice(0, 4).map((item, index) => <div className="arch-node" key={item}><strong>{item}</strong><span>layer_{String(index + 1).padStart(2, "0")}</span></div>)}
              <div className="security" id="security"><strong>🛡 Aegis security plane</strong><span>identity · policy · secrets · detection · approvals · audit</span></div>
            </div>
          </div>
        </section>

        <section className="section" id="platform">
          <div className="eyebrow">The platform</div>
          <h2 className="section-heading">AI infrastructure without the vendor maze.</h2>
          <p className="section-copy">The goal is one durable contract for applications while UIOS handles provider choice, execution, memory, governance, observability and change. New integrations should arrive through plugins instead of core rewrites.</p>
          <div className="cards">{capabilities.map(([title, body]) => <article className="card" key={title}><h3>{title}</h3><p>{body}</p></article>)}</div>
        </section>

        <section className="section">
          <div className="eyebrow">A different kind of operating system</div>
          <h2 className="section-heading">Not a desktop OS. An operating layer for AI.</h2>
          <p className="section-copy">UIOS does not replace Windows, macOS or Linux. It sits above infrastructure like an enterprise control plane: applications call one platform, while UIOS coordinates the models, agents, tools, memory, workflows and policies behind the scenes.</p>
          <div className="cards"><article className="card"><h3>Like AWS</h3><p>Shared infrastructure and services behind many applications.</p></article><article className="card"><h3>Like Kubernetes</h3><p>A control plane that coordinates complex execution across systems.</p></article><article className="card"><h3>Like an AI runtime</h3><p>One durable contract for intelligence, automation and governance.</p></article></div>
        </section>

        <section className="section" id="products">
          <div className="eyebrow">Product architecture</div>
          <h2 className="section-heading">FieldIQ OS is built inside UIOS.</h2>
          <p className="section-copy">FieldIQ OS is the enterprise product experience for teams deploying AI. UIOS is the platform beneath it. Aegis is the stock security system shared by both.</p>
          <div className="cards"><article className="card"><h3>UIOS Core</h3><p>Universal contracts, plugins, routing, execution and platform services.</p><div className="status"><span className="dot" />Architecture active</div></article><article className="card"><h3>FieldIQ OS</h3><p>Enterprise dashboards, workflows, knowledge, agent operations and optimization.</p><div className="status"><span className="dot" />Product mission defined</div></article><article className="card"><h3>Aegis</h3><p>Built-in identity, secrets, policy, risk scoring, deception and audit infrastructure.</p><div className="status"><span className="dot" />Security plane ready</div></article></div>
        </section>

        <section className="section" id="pricing">
          <div className="eyebrow">Monetization path</div>
          <h2 className="section-heading">Start free. Scale when the intelligence matters.</h2>
          <p className="section-copy">UIOS can meter routed units, tool calls and workflow executions from the same gateway boundary, giving teams a clear path from evaluation to production.</p>
          <div className="cards"><article className="card"><h3>Builder</h3><p>Free evaluation with 1,000 included routed units and a shared workspace.</p><div className="status">$0 / month</div></article><article className="card" style={{ borderColor: "#8cacff", boxShadow: "0 12px 32px rgba(21, 94, 239, .1)" }}><h3>Scale</h3><p>Production routing, usage analytics, team controls and 25,000 included units.</p><div className="status">$99 / month</div><BillingCta planId="scale" /></article><article className="card"><h3>Enterprise</h3><p>Private connectivity, SSO, custom limits, security reviews and support.</p><div className="status">Custom</div><BillingCta planId="enterprise" /></article></div>
        </section>

        <section className="section" id="start">
          <div className="eyebrow">Build in public</div>
          <h2 className="section-heading">The operating system for enterprise intelligence starts here.</h2>
          <p className="section-copy">This is an ambitious project, and it is being built one tested component at a time. The first milestone is a stable platform contract; every provider, tool and product should plug into that contract instead of creating another lock-in.</p>
          <p className="section-copy">UIOS is looking to connect with AI engineers, full-stack developers, enterprise software architects and people interested in the next generation of AI infrastructure.</p>
          <div className="actions" style={{ justifyContent: "flex-start" }}><a className="button" href="mailto:hello@uios.dev">Connect on the build</a></div>
        </section>

        <footer className="footer">UIOS · Universal Intelligence Operating System · FieldIQ OS · Aegis security plane · <a href="/security">Security</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></footer>
      </div>
    </main>
  );
}
