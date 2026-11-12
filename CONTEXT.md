# ourkit

A package installed into an agent that guides every project, whatever its technology, through one controlled software development lifecycle.

## Language

### Package structure

**Core**:
The part shared by every Role and every project; it contains no assumptions about language, framework or infrastructure.
_Avoid_: common, base, shared

**Role**:
An atomic specialty the agent takes on (for example frontend, backend), carrying its own guidance and checklist layered over Core; a project can enable several Roles at once.
_Avoid_: persona, mode, profile

**Full-stack**:
The name for enabling the frontend Role and the backend Role together; it is not a separate Role.
_Avoid_: fullstack role

**Stack Pack**:
An optional add-on containing deep conventions for one specific technology; Core still runs fully with no Stack Pack.
_Avoid_: plugin, adapter, preset

**Host**:
The agent the kit runs on (Claude Code is the first Host).
_Avoid_: platform, target, agent (when referring to where the kit is installed)

**Host Shell**:
The thin layer specific to each Host (manifest, hooks, install paths, how subagents are called) wrapped around the shared Stage content; adding a Host only requires writing a new Host Shell.
_Avoid_: adapter, wrapper

**Contract Check**:
A command that automatically verifies whether an extension point (Host Shell, Role, Stack Pack, Stage) fully satisfies its contract.
_Avoid_: validation, lint

**Fixture Project**:
A project shipped with the kit (for example one Node, one Python, one API-only) for trying out the kit and Contract Check; it is not a user's project.
_Avoid_: sample, demo project

**Tracker**:
Where a project's tickets live (v1: GitHub Issues). The kit reads tickets as input for Spec, updates their status itself, and comments with a PR link and the Change Report summary.
_Avoid_: issue tracker, board, backlog tool

**Tracker Pack**:
An optional pack connecting Core to a specific Tracker through a contract of four operations: read a ticket, change status, comment, attach a PR link; it uses MCP when available and otherwise a CLI.
_Avoid_: integration

**Connector**:
An MCP connection to an external service (for example GitHub, Vercel, Notion). Init configures what it can by itself, never writing a token to the repo, and gives step-by-step guidance for what needs the user (signing in, creating a token). A Connector is enabled only when the project really needs it, to save context. Unfinished work is saved and raised in one line on the next run.
_Avoid_: integration, plugin, MCP (when referring to a specific connection)

**Release**:
A numbered release of the package itself (v1, v2...).
_Avoid_: phase, milestone, version (when referring to a development round)

### Lifecycle

**Stage**:
One step in the lifecycle of a change; v1 has Spec → Plan → Tasks → Build (code + test) → Review → Ship, plus the Bug-fix flow. Deploy ships as a frame in v1 and is filled in Release 2.
_Avoid_: phase, step

**Mode**:
How the user works with the agent on a change: Pair or Hands-off. Almost every Gate behaves differently by Mode; the default is Pair.
_Avoid_: flow, style

**Pair**:
The Mode where the user sits with the agent: Gates ask immediately, the user approves the plan, and the Explainer is suggested.
_Avoid_: interactive, manual

**Hands-off**:
The Mode where the agent works by itself and then reports: it settles decisions and records them in the Decision Log, and gathers questions into a Question Batch; for a change that touches a Sensitive Area or needs the user to act on a service, it stops twice, after Plan and before Ship.
_Avoid_: autopilot, autonomous, solo

**Loop Run**:
Hands-off running in cycles over multiple tickets (possibly a whole backlog), with a fresh context for each ticket; it stops by itself when everything is blocked, the work is done, or the Budget runs out.
_Avoid_: batch mode, background run

**Budget**:
A limit on running hours or estimated tokens set in advance for a Loop Run; without a Budget, a Loop Run does not start. If the Host can read plan usage, a Loop Run also stops taking new tickets when close to the limit, warns the user, and continues by itself when the limit refreshes (if the Host can schedule).
_Avoid_: quota, limit, cap

**Question Batch**:
Questions that need the user's decision, gathered to be asked at once instead of stopping for each one.
_Avoid_: blockers, pending questions

**Run Report**:
The summary after a Loop Run: what was finished, the Decision Log, the Question Batch, the Test Handoff, and the changes waiting for the user. The user reads the flow back or asks about it from here.
_Avoid_: summary, run log

**Gate**:
A control point between two Stages; its severity (blocking or only reminding) depends on the Tier of the change.
_Avoid_: check, guard, checkpoint

**Mockup**:
A static HTML picture of a Feature people will see, made in Plan before anything is built; the user approves it before the plan, and Build, Review and QA check the result against it. When the Feature comes from an Epic with a Prototype, it starts from the Prototype's screens. Changing it after approval needs a new approval.
_Avoid_: wireframe, design

**Prototype**:
A clickable picture of a whole Epic, often a whole product: every screen and the way between them, with made-up data and no backend, made after the Grill; the user approves it before the Epic is split, and each Feature names the screens it builds. It's never part of the project's code.
_Avoid_: mockup (for a whole Epic), demo, MVP

**Observe**:
The first step of an Epic built after an existing app: studying how that app behaves, with REA (`/reverse-engineer-anything`, from https://github.com/morluto/rea, linked and never rebuilt) when it's installed, before the Grill. It learns behaviour and never copies the look.
_Avoid_: clone, copy

**Tier**:
The size of a change (Patch, Feature or Epic), which decides the Stages and Gates it must pass through; the agent proposes a Tier with a reason and the user confirms.
_Avoid_: size, level, mode

**Patch**:
The smallest Tier: it only goes through Build and Review. In Pair, a Patch ends after Review and the user commits it; in Hands-off, the agent opens a PR.

**Feature**:
The Tier that goes through every Stage.

**Epic**:
The Tier for a change too large for one cycle: it is grilled first and split into multiple Features.

**Active Change**:
The change the user is working on, inferred by the kit from the current branch; if that isn't possible (for example a Patch with no branch), it is the uncommitted work plus the latest commit. This is why commands need no arguments.
_Avoid_: current feature, selected change

**Bug-fix**:
The separate flow for fixing bugs, with the Stages Reproduce → Fix → Verify; it is still subject to Tier rules like every other change.
_Avoid_: hotfix flow, bug flow

**Reviewer**:
A subagent that judges a change in a fresh context, seeing only the spec, the diff and the checklists, not how the work was done. A Feature has one Reviewer reading the checklists of every enabled Role; touching a Sensitive Area adds a separate Reviewer that examines only that area; for a Patch, the main session reviews its own work. Each finding is blocking or non-blocking.
_Avoid_: code reviewer, checker, linter

**Explainer**:
A subagent (called with the `huh` command) that helps the user understand a change until they grasp it: it opens with a three-sentence summary, answers by pointing at real code, and ends with Teach-back. Unlike clarify (the agent asks questions to make the spec clear), the Explainer makes things clear for the user.
_Avoid_: walkthrough, briefing, tutor

**Teach-back**:
A few questions the Explainer asks at the end of a session to verify the user really understands the change; wrong answers are explained again and recorded in the Change Report.
_Avoid_: quiz, test (when referring to the user)

**Sensitive Area**:
A part of the system where any change touching it is at least a Feature, even for one line: auth and permissions, data, schema, money, public API.
_Avoid_: critical path, risky code

**Prior Art**:
Solutions that already exist, in the project itself or in official libraries or tools, which the agent must look for and consider at the Plan Stage before writing anything new; the conclusion (reuse, or write new with a reason) is recorded in the plan, and in the Decision Log when in Hands-off.
_Avoid_: research, references

### Installation

**Installer**:
The command-line tool run in the terminal before opening the agent: it asks whether the project is new (Greenfield) or existing (Brownfield), selects Roles, copies the kit into the project and does preliminary stack detection. It does no inference.
_Avoid_: CLI (when speaking generally), setup script

**Init**:
The step run inside the agent right after the Installer: the agent reads the real project, proposes a Stack Profile and completes the matching entry path.
_Avoid_: onboarding command, bootstrap

**Greenfield**:
The entry path for a project with no code yet: choose a stack, create the Stack Profile, and scaffold with that stack's official project creation tool.
_Avoid_: new project, blank project

**Brownfield**:
The entry path for a project that already has code: scan the code, propose a Stack Profile, draft a glossary from the existing code and record the Baseline.
_Avoid_: existing project, legacy project

### Records

**Ticket Standard**:
The standard shape for tickets (Summary, Title, User Story, Context, Scope Boundary, Links & References) and PRs, which must meet 4C: Correct, Clear, Complete, Concise. It is used for tickets the kit creates, PR content, and assessing a ticket before work starts.
_Avoid_: template, ticket format

**Decision Log**:
The list of minor decisions the agent settled by itself while running (with a one-sentence reason), for the user to review later instead of stopping to ask.
_Avoid_: notes, assumptions

**Test Handoff**:
The work the agent can't verify by itself and hands to the user to test, always with step-by-step test instructions; the agent reports only this part and handles the rest itself.
_Avoid_: manual QA, todo for user

**Change Report**:
The report for a Feature, an Epic, or a Bug-fix touching a Sensitive Area: a five-line summary on top with details below; a Patch has no Change Report.
_Avoid_: report, summary, release notes

**Project Log**:
The history index of the whole project: each Ship of a change with a Change Report adds one line (date, name, Tier, one-sentence summary, link).
_Avoid_: changelog, history

**Lessons**:
Short lessons the agent derives by itself after each Change Report, about cost (for example, a Stage that cost unusually much) and quality (errors Reviewers keep catching, Teach-back questions often missed), reread at the start of each Plan Stage; at most about 30 lines, with old lines dropped automatically.
_Avoid_: memory, notes, retro

### Per project

**Stack Profile**:
The declaration of a project's technology and commands (test, lint, build, run), detected automatically and then confirmed by the user; for a blank project, it is proposed for the user to choose.
_Avoid_: config, stack config, settings

**Project Rules**:
A project's own rules, which take precedence over Core → Role → Stack Pack in exactly that order; they are the project's "constitution".
_Avoid_: constitution, project config, custom rules

**Project Role**:
A Role the user defines for one project, living alongside Project Rules and following the same contract as the kit's Roles.
_Avoid_: custom role, local role

**Override**:
A customized version of a kit file, kept separately in the project and taking priority over the original; kit files are never edited by hand, so `upgrade` doesn't lose an Override.
_Avoid_: patch, customization, fork

**Baseline**:
The state of the code at the moment the kit is installed into a Brownfield project; Gates apply standards only to what changed since the Baseline, not to old code.
_Avoid_: legacy, snapshot, grandfathered code
