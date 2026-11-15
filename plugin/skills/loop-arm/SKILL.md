---
name: loop-arm
description: Arm a loop that sidekick loop start launched. It makes the loop's two cron jobs, its tick and its renewal, and reports them with sidekick loop arm --armed. The loop's launch prompt runs it, and so does the renewal job it makes, six days later. It is not for a session outside a loop.
disable-model-invocation: true
---

# loop-arm

This session is a loop that `sidekick loop start` launched, or one whose renewal job has fired. Leave it holding exactly one tick job and one renewal job, both made by this run, and report them with `sidekick loop arm <name> --armed`. The loop's name is this skill's argument. With none, stop and say so.

Only the model can make a cron job, so sidekick holds the facts and you make the jobs. `sidekick loop start` reads `armed.json`, which `--armed` writes, to tell whether a loop's jobs are alive. A recurring job expires seven days after it is made. So the renewal reruns this skill after six days, which remakes both jobs and restarts the tick job's seven days. Running the skill twice does no harm, since each run replaces the jobs the last one made.

The skill runs unattended, under `dontAsk`, so no one answers a question. When something stops you, say what and why in your reply, which the operator reads with `claude logs`.

## What `arm` tells you

`sidekick loop arm <name>` writes nothing. It prints one fact per line, each led by a label and a colon:

| Label | What it gives |
|---|---|
| `tick schedule`, `tick prompt` | The recurring tick job: its five-field cron in local time, and its prompt |
| `renewal cron`, `renewal prompt` | The one-shot renewal job: a cron that names one local minute, and its prompt, `/sidekick:loop-arm <name>` |
| `renewal at` | The renewal's local time |
| `old tick job id`, `old renewal job id` | The jobs the last arm of this launch reported. `old jobs: none recorded` stands in their place when there are none |
| `after both jobs exist, run` | The `--armed` command, with `<tick job id>` and `<renewal job id>` to fill in |

It also prints `loop`, `launch`, `tick job: recurring`, and `renewal job: one-shot`.

When `arm` refuses, it prints why and exits 1. Then make no job and delete none, and reply with its lines. A refusal means sidekick cannot vouch for this launch. No `state.json` records it, `SIDEKICK_LOOP` names another loop, or the name, `state.json`, or the renewal setting is malformed. Jobs made then could tick a loop that sidekick does not track. An old tick job left in place keeps the loop working until it expires.

## Arming

The loop's old jobs are those whose ids `arm` printed, and any whose prompt is the tick prompt or the renewal prompt. `CronList` cuts a prompt to its first 79 characters, so compare that much. Delete each old job with `CronDelete`, and leave every other job alone, since the loop's tick may keep jobs of its own. A renewal deletes itself once it fires, so its id may already be gone.

Delete the old jobs before you make the new ones, since a missing job is the safer failure. A loop missing a job ticks less, and `start` reports it not armed. A loop with two tick jobs ticks twice, and a tick can comment or push.

Then make both jobs with `CronCreate`, passing each value as `arm` printed it. The tick job is recurring, on the tick schedule with the tick prompt. The renewal job is one-shot, on the renewal cron with the renewal prompt. Keep the id `CronCreate` returns for each.

Last, run the `--armed` line with those two ids in place of its placeholders. It writes `armed.json`, then prints `armed <name>: tick <id>, renewal <id>` and the renewal's time. End with those lines as your reply. If it refuses instead, keep the new jobs and reply with its lines, so the operator sees why `start` reports the loop not armed.

Run each `sidekick loop arm` call through `Bash` alone, spelled as `arm` printed it, since the loop's allow list names only `sidekick loop arm <name>` and `sidekick loop arm <name> *`.
