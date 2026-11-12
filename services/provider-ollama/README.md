# @uios/provider-ollama

Local inference through Ollama's **native** API (`/api/chat`, `/api/embed`, `/api/tags`, `/api/show`, `/api/version`). See `docs/intelligence-core/DECISIONS.md` D-02.

- `num_ctx` is sent on every request (default 8192), so the context window does not depend on server or Modelfile defaults.
- Reasoning is disabled by default (`think: false`) and is sent only to models whose `/api/show` capabilities include `thinking`. Any `<think>…</think>` block that still appears is moved to `ChatResponse.reasoning` and never returned as answer text.
- Tools are sent as Ollama function tools, and `message.tool_calls` are mapped to `ToolCall`s.
- `nomic-embed-text` receives its task prefixes (`search_document:` / `search_query:`).
- `locality` is `"local"`. UIOS never reads model files; where Ollama stores them (e.g. `OLLAMA_MODELS` on `J:`) is Ollama's own configuration.
