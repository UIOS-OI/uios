# Layer 6 — Multi-Tier Memory

Memory in UIOS is not a single database. It is a hierarchical, multi-tiered caching and persistence network that keeps LLMs coherent and context-aware across sessions, workspaces, and organizations.

---

## 🧠 Memory Hierarchy Layers

```text
[Session Memory]          Redis cache containing active UI state and WebSocket channels.
   ↓
[Conversation Memory]     SQLite/PostgreSQL chat tables containing raw recent messages.
   ↓
[Workspace Memory]        pgvector embeddings capturing documents and projects.
   ↓
[Organization Memory]     Vector stores holding shared schemas, guidelines, and context.
   ↓
[Long-Term Knowledge]     Object storage hosting cold files and structured archives.
   ↓
[Vector Database]         Index mappings for semantic similarity searches.
   ↓
[Knowledge Graph]         Graph databases mapping entities, agents, and dependencies.
```

---

## 🔍 Semantic Search & Access Constraints

Memory retrievals must respect tenant boundaries:

### 1. Vector Search Pipeline
- Document uploads trigger an event to generate vector embeddings.
- User queries are encoded using the embedding model and sent to the Vector Database.
- **Strict Query Filtering**: Every vector query **must** contain metadata filters mapping the tenant workspace:
  ```json
  {
    "filter": {
      "workspace_id": "ws_123e4567_e89b"
    }
  }
  ```
- This ensures users only query vector stores they are authorized to access.

### 2. Conversational Context
- Sliding-window algorithms fetch the most recent messages from PostgreSQL database tables to construct the immediate context.
- Warm-cache lookup in Redis handles recurring queries, reducing vector search overhead.
- Cold archives are compressed and offloaded to object storage, with indexed pointers retained in PostgreSQL.
