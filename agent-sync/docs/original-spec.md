One correction before the spec: **treat `disable-model-invocation` as a canonical field, but do not assume Codex stores it in `SKILL.md` frontmatter.** Current Codex skills docs describe `SKILL.md` as requiring `name` and `description`, with optional skill policy such as implicit-invocation control living in `agents/openai.yaml` via `policy.allow_implicit_invocation`. Claude, by contrast, does support `disable-model-invocation` directly in `SKILL.md` frontmatter. ([OpenAI Developers][1])

## Implementation spec

### 1. Scope

Build a **Python CLI sync tool** that reads **Cursor** project definitions and generates equivalent definitions for:

* **Claude Code**

  * `.claude/skills/**/SKILL.md`
  * `.claude/agents/*.md`
* **Codex**

  * `.agents/skills/**/SKILL.md`
  * `.codex/agents/*.toml`

The tool does **not** own:

* `AGENTS.md` content
* `CLAUDE.md` content generation beyond an optional future helper
* Cursor rules/commands
* Claude commands/rules
* Codex global/user config beyond generated `.codex/agents/*.toml`

That matches the current tool reality: Claude has merged custom commands into skills, and Codex treats `AGENTS.md`, skills, and custom agents as separate configuration surfaces. ([Claude][2])

### 2. High-level architecture

Use three layers:

1. **Parser layer**

   * v1 supports **Cursor only**
   * reads `.cursor/skills/**/SKILL.md`
   * reads `.cursor/agents/*.md`

2. **Canonical storage layer**

   * tool-agnostic in-memory structs
   * no output-format assumptions
   * stores both normalized fields and raw source metadata

3. **Writer layer**

   * `ClaudeSkillWriter`
   * `ClaudeSubagentWriter`
   * `CodexSkillWriter`
   * `CodexSubagentWriter`

This is the right architecture because Claude and Codex do **not** share the same output formats or even the same metadata surfaces. Claude skills are YAML-frontmatter Markdown bundles; Claude subagents are YAML-frontmatter Markdown files; Codex skills are skill directories with `SKILL.md` plus optional `agents/openai.yaml`; Codex custom agents are TOML files in `.codex/agents/`. ([Claude][2])

### 3. Canonical data model

Define two primary canonical objects and a small set of supporting value objects.

#### `SkillSpec`

Fields:

* `source_tool: Literal["cursor"]`
* `source_root: Path`
* `source_skill_dir: Path`
* `relative_skill_dir: PurePosixPath`
* `entrypoint_path: Path`
* `name: str`
* `description: str`
* `body_markdown: str`
* `disable_model_invocation: bool = False`
* `model: str | None = None`
* `extra_frontmatter: dict[str, Any]`
* `reserved_extra_metadata: dict[str, Any]`
* `copied_asset_paths: list[PurePosixPath]`

Rationale:

* `relative_skill_dir` is required because you explicitly want the full directory structure preserved.
* `extra_frontmatter` future-proofs the parser.
* `copied_asset_paths` makes later validation and dry-run reporting easier.
* `model` is canonical even though Codex skills may not currently emit it.

#### `SubagentSpec`

Fields:

* `source_tool: Literal["cursor"]`
* `source_path: Path`
* `filename_stem: str`
* `name: str`
* `description: str`
* `prompt_markdown: str`
* `model: str | None = None`
* `readonly: bool | None = None`
* `is_background: bool | None = None`
* `extra_frontmatter: dict[str, Any]`

Rationale:

* `filename_stem` is separate from `name` because you want target filenames based on the source filename stem.
* `readonly` and `is_background` should exist now even though they are not emitted to Claude/Codex yet.

#### `ModelResolution`

Fields:

* `raw_cursor_model: str | None`
* `claude_model: str | None`
* `codex_model: str | None`
* `codex_reasoning_effort: str | None`
* `resolution_kind: Literal["explicit", "inherit", "unsupported-family", "unknown-model"]`

Rationale:

* make model translation explicit and testable
* avoid smearing model logic across writers

#### `SyncManifest`

Fields:

* `skills: list[SkillSpec]`
* `subagents: list[SubagentSpec]`
* `warnings: list[Diagnostic]`
* `errors: list[Diagnostic]`

This becomes the parser output and the input to all writers.

---

### 4. Source assumptions for v1

The tool should assume these Cursor source layouts, because that is the agreed canonical source for v1:

* skills:

  * `.cursor/skills/<any nested package layout>/SKILL.md`
* subagents:

  * `.cursor/agents/*.md`

Subagents are single files. Skills are directories and may include arbitrary companion files and folders. That aligns with how Claude and Codex both treat skills as bundles with `SKILL.md` plus optional supporting files. ([Claude][2])

### 5. Parsing rules

#### Skills

Scan recursively under `.cursor/skills/` for files named `SKILL.md`.

For each found file:

* parse YAML frontmatter and markdown body
* require:

  * `name`
  * `description`
* optional:

  * `model`
  * `disable-model-invocation`
* default:

  * `disable-model-invocation = false`
* preserve all other frontmatter keys in `extra_frontmatter`

Then compute:

* `source_skill_dir = parent(SKILL.md)`
* `relative_skill_dir = relative path from .cursor/skills`
* `copied_asset_paths = all files under skill dir except the generated target entrypoints`

Rationale:

* Although Claude makes some skill fields optional, Codex requires `name` and `description` in `SKILL.md`, so requiring them in the canonical source avoids lossy or heuristic generation later. ([Claude][2])

#### Subagents

Scan `.cursor/agents/` for `*.md`.

For each file:

* parse YAML frontmatter and markdown body
* require:

  * `name`
  * `description`
* optional:

  * `model`
  * `readonly`
  * `is_background`
* preserve unknown fields in `extra_frontmatter`
* set `filename_stem = source filename without extension`

Validation rule:

* if `filename_stem != name`, emit a **warning**, not an error

Rationale:

* For Codex custom agents, docs say the `name` field is the source of truth and matching filename is just the simplest convention. Your stated requirement is the inverse for generation: output filename should preserve the source filename stem, while mismatch should be flagged. ([OpenAI Developers][3])

### 6. Model translation layer

Implement model translation as two explicit dictionaries plus a resolver.

#### Cursor → Claude

```text
inherit / omitted            -> None
composer-1.5                 -> None

claude-4.6-sonnet-medium
claude-4.6-sonnet-medium-thinking
                             -> claude-sonnet-4-6

claude-4.6-opus-high
claude-4.6-opus-max
claude-4.6-opus-high-thinking
claude-4.6-opus-max-thinking
                             -> claude-opus-4-6

claude-4.5-haiku
claude-4.5-haiku-thinking    -> claude-haiku-4-5

gpt-5.4-low
gpt-5.4-medium
gpt-5.4-high
gpt-5.4-xhigh                -> None
```

Rationale:

* current Claude skill/subagent docs support a `model` field
* your desired normalization is to Anthropic’s alias set
* unsupported cross-family mappings become inherited by omission ([Claude][2])

#### Cursor → Codex

```text
inherit / omitted            -> model=None, reasoning=None
composer-1.5                 -> model=None, reasoning=None

gpt-5.4-low                  -> model="gpt-5.4", reasoning="low"
gpt-5.4-medium               -> model="gpt-5.4", reasoning="medium"
gpt-5.4-high                 -> model="gpt-5.4", reasoning="high"
gpt-5.4-xhigh                -> model="gpt-5.4", reasoning="xhigh"

all claude-* models          -> model=None, reasoning=None
```

Rationale:

* current Codex custom agent docs support `model` and `model_reasoning_effort`, and omitted optional fields inherit from the parent session
* your chosen policy is to inherit rather than error on unsupported family mapping
* but an unrecognized source model string must still raise an error ([OpenAI Developers][3])

#### Unknown-model rule

If a source `model` value is non-empty and **not present in the allowed Cursor model dictionary**, raise an **error**.

This is important. Silent pass-through would hide drift in your canonical model vocabulary.

### 7. Writer rules

## 7A. Claude skill writer

Output root: `.claude/skills/`

For each `SkillSpec`:

1. create output dir:

   * `.claude/skills/<relative_skill_dir>/`
2. recursively copy all source skill files and folders into that directory
3. regenerate `SKILL.md` using:

   * `name`
   * `description`
   * `disable-model-invocation` when true
   * `model` when Cursor→Claude mapping returns a value
4. omit unsupported or intentionally deferred fields

Why:

* Claude skills are directory bundles with `SKILL.md` plus optional supporting files
* Claude supports `disable-model-invocation` and `model` in skill frontmatter
* preserving the skill package structure is the right cross-tool behavior for companion assets ([Claude][2])

Important detail:

* do **not** emit extra headers, comments, or generator banners in `SKILL.md`

## 7B. Codex skill writer

Output root: `.agents/skills/`

For each `SkillSpec`:

1. create output dir:

   * `.agents/skills/<relative_skill_dir>/`
2. recursively copy all source skill files/folders
3. regenerate `SKILL.md` with:

   * `name`
   * `description`
   * body only
4. if `disable_model_invocation == true`, generate:

   * `agents/openai.yaml` with:

     * `policy.allow_implicit_invocation: false`
5. if `disable_model_invocation == false`, do not generate `agents/openai.yaml` unless needed later for other metadata
6. do **not** emit skill `model` to Codex in v1

Why:

* Codex skills are bundles under `.agents/skills`
* Codex uses `SKILL.md` for required skill metadata/instructions
* Codex currently documents invocation policy in `agents/openai.yaml`, not `SKILL.md`
* the skill docs do not currently expose a per-skill `model` field the way Claude does, so preserving skill models on Codex would require inventing behavior the docs do not support ([OpenAI Developers][1])

This is the single most important place where the canonical schema and the output schema intentionally diverge.

## 7C. Claude subagent writer

Output root: `.claude/agents/`

For each `SubagentSpec`:

* write file:

  * `.claude/agents/<filename_stem>.md`

Generated frontmatter:

* `name`
* `description`
* `model` only when Cursor→Claude mapping returns a value

Body:

* `prompt_markdown`

Omit for now:

* `readonly`
* `is_background`

Why:

* Claude custom subagents are Markdown files with YAML frontmatter in `.claude/agents/`
* model selection is supported there
* the deferred fields should stay in the canonical model, not be invented in target output ([Claude][4])

## 7D. Codex subagent writer

Output root: `.codex/agents/`

For each `SubagentSpec`:

* write file:

  * `.codex/agents/<filename_stem>.toml`

Required TOML fields:

* `name`
* `description`
* `developer_instructions`

Optional TOML fields:

* `model` if Cursor→Codex mapping returns one
* `model_reasoning_effort` if Cursor→Codex mapping returns one

Omit for now:

* `sandbox_mode`
* `readonly`
* `is_background`

Body mapping:

* Cursor markdown prompt body → Codex `developer_instructions` multiline TOML string

Why:

* Codex custom agents are TOML files under `.codex/agents/`
* `developer_instructions` is the prompt-bearing field
* optional fields such as `model` and `model_reasoning_effort` inherit when omitted ([OpenAI Developers][3])

### 8. Directory ownership and overwrite behavior

The tool should own only these generated subtrees:

* `.claude/skills/`
* `.claude/agents/`
* `.agents/skills/`
* `.codex/agents/`

It should **not** delete or rewrite:

* `.claude/settings.json`
* `.claude/settings.local.json`
* `.codex/config.toml`
* repo `AGENTS.md`
* repo `CLAUDE.md`

Why:

* generated outputs are gitignored and disposable
* `.claude/` and `.codex/` may contain other legitimate tool config that should survive regeneration
* Codex reads `AGENTS.md` separately, and Claude project memory belongs in `CLAUDE.md`, which can import other files with `@path` syntax if you want a shim to `AGENTS.md` outside this tool’s scope ([OpenAI Developers][5])

### 9. Regeneration algorithm

Use this write flow:

1. parse Cursor source into `SyncManifest`
2. run validation
3. if errors exist, abort without modifying outputs
4. generate into a temporary staging directory
5. replace only managed target subtrees
6. print summary:

   * skills written
   * subagents written
   * warnings
   * dropped fields by target

Why:

* staging avoids leaving partial outputs on disk after parse/validation failure
* scoped replacement avoids destroying unrelated Claude/Codex config

### 10. Validation rules

#### Hard errors

* source root `.cursor/` missing
* malformed YAML frontmatter
* missing required `name` or `description`
* unknown model string not present in allowed Cursor model dictionary
* duplicate canonical skill names
* duplicate canonical subagent names
* duplicate output file paths for a single target
* skill directory missing `SKILL.md`

Why duplicates should be errors:

* Claude resolves conflicts by precedence, and Codex can surface same-named skills independently; neither is desirable for a generated portability layer where determinism matters more than permissive loading. ([Claude][2])

#### Warnings

* subagent filename stem does not match frontmatter `name`
* source skill contains a `model` that will be dropped for Codex skill output
* subagent contains `readonly` or `is_background`, which are stored canonically but not emitted in v1
* source skill includes unknown frontmatter keys that no writer consumes yet

Warnings should be visible, but generation should continue.

### 11. CLI surface

Use a simple CLI with two commands.

#### `sync`

Reads Cursor source, validates it, and regenerates Claude/Codex outputs.

Arguments:

* `--repo-root PATH` default: current directory
* `--source-dir PATH` default: `.cursor`
* `--verbose`
* `--dry-run`

#### `validate`

Parses and validates without writing files.

Arguments:

* same path args
* non-zero exit on validation error

Rationale:

* `sync` is what Git hooks or developers run
* `validate` is what CI or preflight checks run
* `dry-run` is useful before destructive replacement

### 12. Recommended Python package/module layout

```text
agent_sync/
  __init__.py
  cli.py

  domain/
    models.py
    diagnostics.py

  parse/
    frontmatter.py
    cursor.py

  transform/
    model_map.py
    normalize.py
    validate.py

  write/
    common.py
    claude.py
    codex.py

  app/
    sync.py
```

Responsibilities:

* `parse.frontmatter`: split frontmatter/body safely
* `parse.cursor`: build canonical objects from Cursor source
* `transform.model_map`: explicit translation dictionaries and resolver
* `transform.validate`: all structural and semantic checks
* `write.claude`: Claude writers only
* `write.codex`: Codex writers only
* `app.sync`: staging, cleanup, orchestration, summary reporting

### 13. File-format policy

#### YAML frontmatter

Use a real YAML parser for frontmatter. Do not hand-roll it.

Reason:

* even if your current source is simple, YAML edge cases are annoying and not worth debugging

#### TOML output

Use deterministic serialization with stable field ordering for Codex subagents:

1. `name`
2. `description`
3. `model` if present
4. `model_reasoning_effort` if present
5. `developer_instructions`

Reason:

* easier diffs
* easier debugging
* easier fixture testing

### 14. AGENTS.md and CLAUDE.md policy

Keep this out of the sync pipeline.

Recommended repo policy:

* `AGENTS.md` is human-authored and committed
* `CLAUDE.md` is a small committed shim that imports `AGENTS.md`

Reason:

* Codex reads `AGENTS.md` independently
* Claude supports `CLAUDE.md` plus `@path` imports
* mixing repo instruction syncing into the same generator would couple two different concerns unnecessarily ([OpenAI Developers][5])

### 15. Test plan

At minimum, add fixture-driven tests for:

1. **basic skill**

   * source Cursor skill
   * generated Claude skill
   * generated Codex skill

2. **skill with assets**

   * nested docs/scripts/templates copied intact
   * relative layout preserved

3. **skill with `disable-model-invocation: true`**

   * Claude `SKILL.md` contains it
   * Codex emits `agents/openai.yaml` with `allow_implicit_invocation: false`

4. **skill model cases**

   * Claude model preserved when mappable
   * Codex skill model dropped intentionally

5. **basic subagent**

   * Cursor markdown → Claude markdown + YAML
   * Cursor markdown → Codex TOML + `developer_instructions`

6. **subagent model cases**

   * Claude aliases normalize correctly
   * Codex `gpt-5.4-*` maps to base model + reasoning effort

7. **unknown model**

   * hard error

8. **filename/name mismatch**

   * warning only

9. **duplicate names**

   * hard error

10. **staging safety**

* failed write does not partially clobber unrelated target config

## Recommended v1 behavior summary

The developer should implement this exact policy:

* **Canonical source:** Cursor only
* **Canonical concepts:** skills + subagents only
* **Canonical repo instructions:** AGENTS.md, managed manually
* **Writers:** Claude + Codex
* **Skills:** preserve full directory bundle structure
* **Subagents:** preserve source filename stem for output filename
* **Model translation:** explicit dictionary, unknown source model = error
* **Unsupported target-family model:** inherit by omission
* **Codex skill invocation policy:** emit via `agents/openai.yaml`, not `SKILL.md`
* **Future fields (`readonly`, `is_background`):** store now, emit later
* **Overwrite policy:** replace only managed generated subtrees

## Final recommendation

This is the right v1 spec.

The only material change I’d make to your assumptions is the Codex-skill metadata point: **keep `disable-model-invocation` in the canonical schema, but translate it into Codex’s current `agents/openai.yaml` policy file rather than pretending it is shared `SKILL.md` frontmatter.** Everything else now fits a clean parser → canonical model → target writer architecture that will scale well when you later add Claude/Codex readers. ([OpenAI Developers][1])

[1]: https://developers.openai.com/codex/skills/ "Agent Skills"
[2]: https://code.claude.com/docs/en/skills "https://code.claude.com/docs/en/skills"
[3]: https://developers.openai.com/codex/subagents/ "https://developers.openai.com/codex/subagents/"
[4]: https://code.claude.com/docs/en/sub-agents "https://code.claude.com/docs/en/sub-agents"
[5]: https://developers.openai.com/codex/guides/agents-md/ "https://developers.openai.com/codex/guides/agents-md/"
