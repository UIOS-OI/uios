# UIOS Agent Engine

The agent engine runs a bounded provider/tool loop. Every tool must be explicitly registered, and every run has a step limit so providers cannot create unbounded execution. Aegis should mediate tool execution before production use.
