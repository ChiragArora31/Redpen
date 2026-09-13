# Codex adapter boundary

Redpen’s first Codex adapter targets the local JSONL rollout format observed in Codex CLI 0.153.4. Official OpenAI documentation does not currently describe this storage format as a stable public API, and the installed app-server interface labels itself experimental. All format assumptions therefore live under `src/agents/codex/`.

Observed records used by the adapter:

- `session_meta`: session ID, working directory, start time, CLI metadata
- `response_item` messages: user prompts and assistant `final_answer` messages
- `event_msg.task_complete`: turn ID and final agent message
- tool-call records: counted only as historical metadata

Selection order is deterministic:

1. explicit `--file`
2. explicit `--session`
3. inherited `CODEX_THREAD_ID` or `CODEX_SESSION_ID`
4. completed sessions matching repository path and Redpen’s start time
5. exact task text containment only to resolve an otherwise ambiguous set

Redpen refuses unresolved ambiguity. It tolerates only a truncated final JSONL line and never evaluates transcript data, executes transcript commands, or accepts historical command results as verification evidence.
