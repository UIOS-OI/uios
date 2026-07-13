# UIOS Memory

The initial memory service provides tenant-scoped records and deterministic keyword retrieval. The API is intentionally storage-agnostic so it can later swap to pgvector or another vector backend without changing agent code.
