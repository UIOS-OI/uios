# Layer 3 — User Journey

The User Journey layer maps the progression of a visitor into a fully onboarded developer or enterprise builder inside the UIOS workspace.

---

## 🗺️ Flow Architecture

```text
Visitor
   ↓
Landing Page (Explore UIOS brand & Fabric of Intelligence canvas)
   ↓
Watch Fabric of Intelligence (Interactive space visualization, sound, and travel)
   ↓
Request Early Access (Input name, email, and company details)
   ↓
Create Account (Email verification, credential setups, optional MFA activation)
   ↓
Create Organization (Define team name, domain configuration, invite colleagues)
   ↓
Create Workspace (Instantiate partitioned workflow container)
   ↓
Connect AI (Select and authenticate provider models: OpenAI, Anthropic, Gemini, etc.)
   ↓
Connect Apps (Add integrations: GitHub, Slack, Notion, Jira)
   ↓
Start Building (Launch local agent configurations and execute workflows)
```

---

## 🚪 Onboarding Stages

### 1. Visitor to Registered Lead
- **Interactive Discovery**: The visitor interacts with the React Three Fiber "Fabric of Intelligence" simulation, observing raw model connection nodes and bioluminescent link filaments.
- **Conversion Capture**: The visitor submits a waitlist request. In our local prototype, this saves to the browser's local storage under `uios.waitlist.v1`. In production, this issues an edge-routed POST request to `/api/ready` to record user details.

### 2. Tenant Provisioning
- **Verification Gate**: Upon email verification, the system creates the `Organization` database record and assigns the user the `OWNER` role.
- **Workspace Construction**: Next, the user establishes a workspace. The database runs transactional migrations to set up local SQLite tables (or PostgreSQL partitions in production) containing default agents (e.g., standard router agents) and workspace configuration templates.

### 3. Connection & Integration Setup
- **Provider API Keys**: The user supplies model keys (e.g., Gemini or OpenAI tokens), which are encrypted at rest using Aes-GCM-256 keys managed by Aegis.
- **App Authorization**: OAuth handshakes are initiated for key connections (GitHub, Slack) to supply context files or communication channels.
