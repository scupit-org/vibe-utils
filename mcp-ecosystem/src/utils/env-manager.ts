import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseDotenv } from "dotenv";
import { logger } from "./logger.js";

const BLOCK_START = "# <automatically-generated>";
const BLOCK_END = "# </automatically-generated>";
const DEFAULT_BLOCK_HEADER_LINES = [
  "# Managed by @scupit/mcp-ecosystem -- do not edit manually.",
];
const ENV_BLOCK_HEADER_LINES = [
  ...DEFAULT_BLOCK_HEADER_LINES,
  "# Re-run reconcile-client or reconcile-all to regenerate.",
];

interface ManagedEnvFileOptions {
  displayName: string;
  blockHeaderLines?: string[];
}

interface FlushManagedEnvFileOptions {
  dryRunLabel?: string;
  formatPreviewLine?: (line: string) => string;
  successMessage?: string;
}

export type EnvFileSection = "outer_before" | "managed" | "outer_after";

interface EnvLineRecord {
  section: EnvFileSection;
  sectionLineNumber: number;
  rawLine: string;
  kind: "blank" | "comment" | "assignment" | "other";
  key?: string;
}

export interface EnvAssignmentLocation {
  key: string;
  section: EnvFileSection;
  sectionLineNumber: number;
  rawLine: string;
}

export type ManagedEnvWriteStatus =
  | "created"
  | "updated"
  | "matched_existing_managed"
  | "skipped_existing_managed"
  | "rejected_outer_collision";

export interface ManagedEnvWriteResult {
  key: string;
  value: string;
  status: ManagedEnvWriteStatus;
  existingValue?: string;
  outerAssignments?: EnvAssignmentLocation[];
}

/**
 * Shared managed-block wrapper for `.env`-style files.
 *
 * User-authored content outside the managed block is preserved verbatim.
 * The managed block is tool-owned and regenerated wholesale on flush.
 */
export class ManagedEnvFile {
  private readonly filePath: string;
  private readonly displayName: string;
  private readonly blockHeaderLines: string[];
  private readonly hasExistingManagedBlock: boolean;
  private outerBefore: string;
  private outerAfter: string;
  private managedLines: string[];
  private dirty = false;

  private constructor(args: {
    filePath: string;
    displayName: string;
    blockHeaderLines: string[];
    hasExistingManagedBlock: boolean;
    outerBefore: string;
    outerAfter: string;
    managedLines: string[];
  }) {
    this.filePath = args.filePath;
    this.displayName = args.displayName;
    this.blockHeaderLines = args.blockHeaderLines;
    this.hasExistingManagedBlock = args.hasExistingManagedBlock;
    this.outerBefore = args.outerBefore;
    this.outerAfter = args.outerAfter;
    this.managedLines = args.managedLines;
  }

  static async load(
    filePath: string,
    options: ManagedEnvFileOptions
  ): Promise<ManagedEnvFile> {
    let content = "";

    try {
      content = await readFile(filePath, "utf-8");
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        throw new Error(
          `Failed to read ${options.displayName} at ${filePath}\n\n` +
            `  ${formatErrorMessage(error)}`
        );
      }
      // File doesn't exist yet — start empty.
    }

    const state = splitManagedBlock(content, filePath, options.displayName);

    return new ManagedEnvFile({
      filePath,
      displayName: options.displayName,
      blockHeaderLines: options.blockHeaderLines ?? DEFAULT_BLOCK_HEADER_LINES,
      hasExistingManagedBlock: state.hasManagedBlock,
      outerBefore: state.outerBefore,
      outerAfter: state.outerAfter,
      managedLines: stripManagedBlockHeader(
        state.blockContent,
        options.blockHeaderLines ?? DEFAULT_BLOCK_HEADER_LINES
      ),
    });
  }

  get hasManagedBlock(): boolean {
    return this.hasExistingManagedBlock;
  }

  getOuterContent(): string {
    return this.outerBefore + this.outerAfter;
  }

  getOuterBeforeContent(): string {
    return this.outerBefore;
  }

  getOuterAfterContent(): string {
    return this.outerAfter;
  }

  getManagedContent(): string {
    return this.managedLines.join("\n");
  }

  replaceOuterContent(outerBefore: string, outerAfter = ""): void {
    if (this.outerBefore === outerBefore && this.outerAfter === outerAfter) {
      return;
    }
    this.outerBefore = outerBefore;
    this.outerAfter = outerAfter;
    this.dirty = true;
  }

  setManagedLines(lines: string[]): void {
    if (sameLines(this.managedLines, lines)) {
      return;
    }
    this.managedLines = [...lines];
    this.dirty = true;
  }

  async flush(
    dryRun: boolean,
    options?: FlushManagedEnvFileOptions
  ): Promise<boolean> {
    if (!this.dirty) return false;

    if (dryRun) {
      logger.info(
        options?.dryRunLabel ??
          `[DRY RUN] Would update ${this.displayName} managed block:`
      );
      for (const line of this.managedLines) {
        logger.info(`  ${(options?.formatPreviewLine ?? identity)(line)}`);
      }
      return true;
    }

    const updatedContent = buildUpdatedContent(
      this.outerBefore,
      this.renderManagedBlock(),
      this.outerAfter
    );

    await writeFile(this.filePath, updatedContent, "utf-8");
    this.dirty = false;
    logger.success(options?.successMessage ?? `Updated ${this.displayName}.`);
    return true;
  }

  private renderManagedBlock(): string {
    return [
      BLOCK_START,
      ...this.blockHeaderLines,
      ...this.managedLines,
      BLOCK_END,
    ].join("\n");
  }
}

/**
 * Centralized read-write store for the ecosystem `.env` file.
 *
 * - Loaded once at startup via `EnvManager.load(rootDir)`.
 * - All reads and writes go through `get()` / `set()` during the run.
 * - Flushed exactly once at the end via `flush()`.
 */
export class EnvManager {
  private readonly managedFile: ManagedEnvFile;
  private readonly managedVars: Map<string, string>;
  private readonly outerVars: Map<string, string>;
  private readonly managedAssignments: EnvAssignmentLocation[];
  private readonly outerAssignments: EnvAssignmentLocation[];
  private dirty = false;

  private constructor(
    managedFile: ManagedEnvFile,
    managedVars: Map<string, string>,
    outerVars: Map<string, string>,
    managedAssignments: EnvAssignmentLocation[],
    outerAssignments: EnvAssignmentLocation[]
  ) {
    this.managedFile = managedFile;
    this.managedVars = managedVars;
    this.outerVars = outerVars;
    this.managedAssignments = managedAssignments;
    this.outerAssignments = outerAssignments;
  }

  static async load(rootDir: string): Promise<EnvManager> {
    const envPath = join(rootDir, ".env");
    const managedFile = await ManagedEnvFile.load(envPath, {
      displayName: ".env",
      blockHeaderLines: ENV_BLOCK_HEADER_LINES,
    });
    const outerBefore = analyzeEnvSection(
      managedFile.getOuterBeforeContent(),
      "outer_before"
    );
    const outerAfter = analyzeEnvSection(
      managedFile.getOuterAfterContent(),
      "outer_after"
    );
    const managed = analyzeManagedEnvSection(managedFile.getManagedContent());

    const outerVars = new Map<string, string>([
      ...outerBefore.values,
      ...outerAfter.values,
    ]);

    return new EnvManager(
      managedFile,
      managed.values,
      outerVars,
      managed.assignments,
      [...outerBefore.assignments, ...outerAfter.assignments]
    );
  }

  /** Read a value. Checks managed vars first, then outer (user-managed) vars. */
  get(key: string): string | undefined {
    return this.managedVars.get(key) ?? this.outerVars.get(key);
  }

  getManaged(key: string): string | undefined {
    return this.managedVars.get(key);
  }

  getOuter(key: string): string | undefined {
    return this.outerVars.get(key);
  }

  /** Whether a key exists in either managed or outer vars. */
  has(key: string): boolean {
    return this.managedVars.has(key) || this.outerVars.has(key);
  }

  hasManaged(key: string): boolean {
    return this.managedVars.has(key);
  }

  hasOuter(key: string): boolean {
    return this.outerVars.has(key);
  }

  /** All keys present in either managed or user-authored content. */
  keys(): string[] {
    return [...this.entries().keys()];
  }

  getOuterAssignments(
    predicate?: (key: string) => boolean
  ): EnvAssignmentLocation[] {
    return this.outerAssignments.filter(
      (assignment) => !predicate || predicate(assignment.key)
    );
  }

  getManagedAssignments(
    predicate?: (key: string) => boolean
  ): EnvAssignmentLocation[] {
    return this.managedAssignments.filter(
      (assignment) => !predicate || predicate(assignment.key)
    );
  }

  /** All known values, with managed vars taking precedence over outer vars. */
  entries(): Map<string, string> {
    const merged = new Map(this.outerVars);
    for (const [key, value] of this.managedVars) {
      merged.set(key, value);
    }
    return merged;
  }

  /**
   * Set a managed env var. If `writeOnce` is true and the key already exists
   * in managed vars, the call is a no-op (protects secrets from overwrite).
   */
  set(
    key: string,
    value: string,
    options?: { writeOnce?: boolean; rejectOuterCollision?: boolean }
  ): ManagedEnvWriteResult {
    if (options?.rejectOuterCollision) {
      const outerAssignments = this.getOuterAssignments(
        (assignmentKey) => assignmentKey === key
      );
      if (outerAssignments.length > 0) {
        return {
          key,
          value,
          status: "rejected_outer_collision",
          existingValue: this.outerVars.get(key),
          outerAssignments,
        };
      }
    }

    const existingManagedValue = this.managedVars.get(key);
    if (existingManagedValue !== undefined) {
      if (existingManagedValue === value) {
        return {
          key,
          value,
          status: "matched_existing_managed",
          existingValue: existingManagedValue,
        };
      }

      if (options?.writeOnce) {
        return {
          key,
          value,
          status: "skipped_existing_managed",
          existingValue: existingManagedValue,
        };
      }

      this.managedVars.set(key, value);
      this.dirty = true;
      return {
        key,
        value,
        status: "updated",
        existingValue: existingManagedValue,
      };
    }

    this.managedVars.set(key, value);
    this.dirty = true;
    return { key, value, status: "created" };
  }

  /**
   * Push all known env vars (outer + managed) into `process.env`.
   * Replaces the dotenv `config()` call — call this once after load,
   * before anything reads `process.env`.
   *
   * When `filter` is provided, only keys for which the predicate returns
   * `true` are written. Keys already present in `process.env` are never
   * overwritten regardless of the filter.
   */
  populateProcessEnv(filter?: (key: string) => boolean): void {
    for (const [key, value] of this.managedVars) {
      if (process.env[key] === undefined && (!filter || filter(key))) {
        process.env[key] = value;
      }
    }
    for (const [key, value] of this.outerVars) {
      if (process.env[key] === undefined && (!filter || filter(key))) {
        process.env[key] = value;
      }
    }
  }

  /**
   * Persist the managed block back to disk. The outer content is preserved
   * verbatim; only the managed block is regenerated.
   *
   * Throws on I/O failure — callers must not swallow the error.
   */
  async flush(dryRun: boolean): Promise<void> {
    if (!this.dirty) return;

    const blockLines = [...this.managedVars].map(([key, value]) =>
      serializeManagedEnvAssignment(key, value)
    );
    this.managedFile.setManagedLines(blockLines);

    const secretCount = [...this.managedVars.keys()].filter(isSecretKey).length;
    const idCount = this.managedVars.size - secretCount;
    const parts: string[] = [];
    if (idCount > 0) parts.push(`${idCount} client ID(s)`);
    if (secretCount > 0) parts.push(`${secretCount} secret(s)`);

    await this.managedFile.flush(dryRun, {
      dryRunLabel: "[DRY RUN] Would update .env managed block:",
      formatPreviewLine: (line) => maskSecretEnvAssignment(line),
      successMessage:
        parts.length > 0
          ? `Updated .env with ${parts.join(" and ")}.`
          : "Updated .env.",
    });

    this.dirty = false;
  }
}

function splitManagedBlock(
  content: string,
  filePath: string,
  displayName: string
): {
  hasManagedBlock: boolean;
  outerBefore: string;
  outerAfter: string;
  blockContent: string;
} {
  // TODO: Replace this index-based marker search with a structured, line-aware
  // block parser that can detect duplicate markers, incidental marker text, and
  // corrupted managed blocks more precisely.
  const startIdx = content.indexOf(BLOCK_START);
  const endIdx = content.indexOf(BLOCK_END);

  if (startIdx === -1 && endIdx === -1) {
    return {
      hasManagedBlock: false,
      outerBefore: content,
      outerAfter: "",
      blockContent: "",
    };
  }

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(
      `Malformed managed block in ${displayName} at ${filePath}\n\n` +
        `  Managed env files must contain both:\n` +
        `    ${BLOCK_START}\n` +
        `    ${BLOCK_END}\n\n` +
        `  To preserve user-authored content safely, fix or remove the partial block and re-run the command.`
    );
  }

  return {
    hasManagedBlock: true,
    outerBefore: content.slice(0, startIdx),
    outerAfter: content.slice(endIdx + BLOCK_END.length),
    blockContent: content.slice(startIdx, endIdx + BLOCK_END.length),
  };
}

function stripManagedBlockHeader(
  blockContent: string,
  blockHeaderLines: string[]
): string[] {
  if (!blockContent) return [];

  const lines = splitLines(blockContent);
  if (lines[0] === BLOCK_START) {
    lines.shift();
  }
  if (lines.at(-1) === BLOCK_END) {
    lines.pop();
  }
  while (lines.length > 0) {
    const firstLine = lines[0];
    if (firstLine === undefined || !blockHeaderLines.includes(firstLine)) {
      break;
    }
    lines.shift();
  }
  return lines;
}

function buildUpdatedContent(
  outerBefore: string,
  newBlock: string,
  outerAfter: string
): string {
  const separator =
    outerBefore.length > 0 && !outerBefore.endsWith("\n")
      ? "\n\n"
      : outerBefore.length > 0 && !outerBefore.endsWith("\n\n")
        ? "\n"
        : "";

  return outerBefore + separator + newBlock + outerAfter;
}

function sameLines(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((line, idx) => line === right[idx]);
}

function splitLines(content: string): string[] {
  if (content === "") return [];
  return content.split(/\r?\n/);
}

function identity(value: string): string {
  return value;
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isSecretKey(key: string): boolean {
  return key.includes("_CLIENT_SECRET") || key.includes("_SECRET");
}

function maskSecretEnvAssignment(line: string): string {
  const eqIdx = line.indexOf("=");
  if (eqIdx === -1) return line;
  const key = line.slice(0, eqIdx).trim();
  return isSecretKey(key) ? `${key}=********` : line;
}

function serializeManagedEnvAssignment(key: string, value: string): string {
  return `${key}='${encodeManagedEnvValue(value)}'`;
}

function encodeManagedEnvValue(value: string): string {
  let encoded = "";
  for (const ch of value) {
    switch (ch) {
      case "\\":
        encoded += "\\\\";
        break;
      case "'":
        encoded += "\\'";
        break;
      case "\n":
        encoded += "\\n";
        break;
      case "\r":
        encoded += "\\r";
        break;
      case "\t":
        encoded += "\\t";
        break;
      default:
        encoded += ch;
        break;
    }
  }
  return encoded;
}

function decodeManagedEnvValue(value: string): string {
  let decoded = "";
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch !== "\\") {
      decoded += ch;
      continue;
    }

    const next = value[i + 1];
    if (next === undefined) {
      decoded += "\\";
      continue;
    }

    switch (next) {
      case "n":
        decoded += "\n";
        break;
      case "r":
        decoded += "\r";
        break;
      case "t":
        decoded += "\t";
        break;
      case "\\":
        decoded += "\\";
        break;
      case "'":
        decoded += "'";
        break;
      default:
        decoded += `\\${next}`;
        break;
    }
    i += 1;
  }
  return decoded;
}

/**
 * Parse KEY=VALUE assignments from raw `.env` content using dotenv's parser.
 * Raw file content is preserved separately so comments and layout survive
 * rewrites outside the managed block.
 */
function parseEnvVars(content: string): Map<string, string> {
  return new Map(Object.entries(parseDotenv(content)));
}

interface AnalyzedEnvSection {
  values: Map<string, string>;
  assignments: EnvAssignmentLocation[];
}

function analyzeEnvSection(
  content: string,
  section: EnvFileSection
): AnalyzedEnvSection {
  const values = parseEnvVars(content);
  const lineRecords = scanEnvLines(content, section);
  return {
    values,
    assignments: lineRecordsToAssignments(lineRecords),
  };
}

function analyzeManagedEnvSection(content: string): AnalyzedEnvSection {
  const lineRecords = scanEnvLines(content, "managed");
  return {
    values: parseManagedEnvVars(content),
    assignments: lineRecordsToAssignments(lineRecords),
  };
}

function parseManagedEnvVars(content: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const [key, value] of Object.entries(parseDotenv(content))) {
    vars.set(key, decodeManagedEnvValue(value));
  }
  return vars;
}

function scanEnvLines(content: string, section: EnvFileSection): EnvLineRecord[] {
  return splitLines(content).map((rawLine, index) =>
    classifyEnvLine(rawLine, section, index + 1)
  );
}

function classifyEnvLine(
  rawLine: string,
  section: EnvFileSection,
  sectionLineNumber: number
): EnvLineRecord {
  const trimmed = rawLine.trim();
  if (trimmed === "") {
    return { section, sectionLineNumber, rawLine, kind: "blank" };
  }

  if (trimmed.startsWith("#")) {
    return { section, sectionLineNumber, rawLine, kind: "comment" };
  }

  const assignmentMatch = rawLine.match(
    /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/
  );
  if (assignmentMatch?.[1]) {
    return {
      section,
      sectionLineNumber,
      rawLine,
      kind: "assignment",
      key: assignmentMatch[1],
    };
  }

  return { section, sectionLineNumber, rawLine, kind: "other" };
}

function lineRecordsToAssignments(
  lineRecords: EnvLineRecord[]
): EnvAssignmentLocation[] {
  return lineRecords.flatMap((line) =>
    line.kind === "assignment" && line.key
      ? [
          {
            key: line.key,
            section: line.section,
            sectionLineNumber: line.sectionLineNumber,
            rawLine: line.rawLine,
          },
        ]
      : []
  );
}

/** Derive the env var name for a client's ID. */
export function clientIdEnvVar(clientKey: string): string {
  return `AUTH0_${clientKey.toUpperCase().replace(/-/g, "_")}_CLIENT_ID`;
}

/** Derive the env var name for a client's secret. */
export function clientSecretEnvVar(clientKey: string): string {
  return `AUTH0_${clientKey.toUpperCase().replace(/-/g, "_")}_CLIENT_SECRET`;
}
