# Redpen posts for 28 September–4 October 2026

Prepared for scheduling, not published. Times are IST. Posts mentioning v0.2 should go out only after the GitHub release and npm package are live. Use a terminal screenshot on Monday, a 10-second `start → add → check` clip on Wednesday, and a report excerpt on Friday. Do not invent adoption numbers.

The pattern worth borrowing from [Pranav's recent posting](https://x.com/pranvtwt): show specific shipped work often, repeat the product link when there is a real reason, and mix small builder observations with demos. The aim here is useful repetition, not his wording or cadence.

## Monday 28 September · 11:00 — release

redpen v0.2 is out.

define “done” for a coding task, save it as a reusable proof plan, and make the agent's claims answer to evidence.

`redpen init` → `redpen start --template bugfix "..."` → `redpen check`

open source: https://github.com/ChiragArora31/Redpen

## Monday 28 September · 21:30 — problem

the expensive part of agentic coding isn't always writing the code.

it's the moment after the agent says “done” and you have to reconstruct what changed, which tests ran, and which claims are still guesses.

that's the handoff redpen is trying to fix.

## Tuesday 29 September · 11:00 — concrete feature

redpen v0.2: the definition of done can live in a committed `.redpen/config.json`.

the next person working on a bugfix starts with the same proof plan instead of inventing a checklist after the code is written.

https://github.com/ChiragArora31/Redpen

## Tuesday 29 September · 21:30 — trust boundary

“no breaking changes” is a claim i want to see from an agent.

it is not a claim i'd let a changed file or a green test suite prove automatically.

redpen leaves it unverified unless you give it a relevant check. uncertainty is a better result than a confident green tick.

## Wednesday 30 September · 11:00 — mini demo

one way to make an agent task less vague:

`redpen start "fix pagination"`
`redpen add "cursor test passes" --command npm run test:pagination`
`redpen check`

the proof is now part of the task, not a note you hope someone remembers.

## Wednesday 30 September · 21:30 — builder observation

the more code an agent can write, the more valuable a precise stopping condition becomes.

“looks good” doesn't scale with output volume.

a task-sized proof plan might.

## Thursday 1 October · 11:00 — advisory

not every useful check should block a release.

redpen v0.2 has required and advisory criteria. a failing advisory check stays visible, but doesn't change the contract for “done.”

i think that distinction matters for real projects, where evidence is rarely all-or-nothing.

## Thursday 1 October · 21:30 — invite feedback

if you use Codex for code changes, what claim in its final message do you most often have to verify yourself?

for me, “tests pass” is easy to automate. “the behavior is correct” is much harder.

i'm collecting the awkward cases for redpen.

## Friday 2 October · 11:00 — evidence feature

redpen can now check a coverage threshold from a fresh JSON report produced by a command you choose.

it checks that the command ran, the report was produced, and the number meets the threshold.

still not proof the *right* behavior was tested. that's a separate question.

## Friday 2 October · 21:30 — screenshot prompt

my favorite redpen output is still a question mark.

`? "preserved backwards compatibility"`
`  no deterministic evidence is available`

the tool is doing its job when it refuses to turn an agent's confidence into a fact.

## Saturday 3 October · 11:00 — open-source CTA

you can try redpen in a git repo in under a minute:

`npx redpen-cli start "fix a bug"`
work with Codex
`npx redpen-cli import codex`
`npx redpen-cli check`

if the result feels wrong, i'd like the issue. especially the false green ones.

https://github.com/ChiragArora31/Redpen

## Saturday 3 October · 21:30 — philosophy

CI tells you whether predefined commands passed.

an agent can still say it added tests when it didn't, or claim compatibility nobody checked.

redpen ties the task, the agent's words, and the evidence together. it should complement CI, not replace it.

## Sunday 4 October · 11:00 — technical detail

redpen snapshots the repo before a task starts. it also checks whether files changed while verification was running.

otherwise a test that rewrites source files could hand you a green result for a state that no longer exists.

boring detail. important trust boundary.

## Sunday 4 October · 21:30 — next week

shipping redpen in small loops has clarified the goal for me:

not “make agents say done more often.”

make it obvious what they proved, what they didn't, and what a human still needs to judge.

if you try it this week, tell me where the evidence model breaks.
