#!/usr/bin/env tsx
/**
 * version-bump.ts — Hash-based monorepo version bump script
 *
 * Computes a content hash per workspace package (excluding metadata files)
 * and bumps semver versions only when source actually changed.
 *
 * Root version uses date-based format: yyyy.mm.dd.N
 * Sub-packages use standard semver: x.y.z
 *
 * Usage:
 *   npx tsx scripts/version-bump.ts [options]
 *
 * Options:
 *   --patch       Bump patch version for all changed packages (default)
 *   --minor       Bump minor version for all changed packages
 *   --major       Bump major version for all changed packages
 *   --dry-run     Report changes without writing anything
 *   --check       Exit non-zero if any package changed but wasn't bumped (CI mode)
 *   --init        Initialize .version-hashes.json from current state (no bumps)
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

// ─── Types ──────────────────────────────────────────────────────────────────

interface HashEntry {
  hash: string;
  version: string;
}

interface HashFile {
  rootVersion: string;
  packages: Record<string, HashEntry>;
}

type BumpLevel = "patch" | "minor" | "major";

// ─── Constants ──────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const HASH_FILE = join(ROOT, ".version-hashes.json");

/**
 * Files excluded from content hashing (case-insensitive basename match).
 * Changes to these files alone should NOT trigger a version bump.
 */
const EXCLUDED_BASENAMES = new Set([
  "package.json",
  "pyproject.toml",
  "readme.md",
  "changelog.md",
  "license",
  "license.md",
  "license.txt",
  ".gitignore",
  ".version-hashes.json",
]);

/**
 * Extensions excluded at the package root level only.
 * Nested .md files (e.g. src/docs/guide.md) are still hashed.
 */
const EXCLUDED_ROOT_EXTENSIONS = new Set([".md"]);

// ─── Helpers ────────────────────────────────────────────────────────────────

function run(cmd: string, cwd = ROOT): string {
  return execSync(cmd, { cwd, encoding: "utf-8" }).trim();
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ─── Package discovery ──────────────────────────────────────────────────────

interface PackageInfo {
  /** Relative path from repo root, e.g. "apps/api" */
  dir: string;
  /** Package name, e.g. "@serendip-bot/api" */
  name: string;
  /** Current version string */
  version: string;
  /** "node" or "python" */
  type: "node" | "python";
}

function discoverPackages(): PackageInfo[] {
  const rootPkg = readJson<{ workspaces?: string[] }>(
    join(ROOT, "package.json"),
  );
  const workspaceGlobs = rootPkg.workspaces ?? [];
  const packages: PackageInfo[] = [];

  for (const glob of workspaceGlobs) {
    // Resolve "apps/*" → list directories matching the glob
    const baseDir = glob.replace("/*", "");
    const absBase = join(ROOT, baseDir);
    if (!existsSync(absBase)) continue;

    const entries = execSync(
      `ls -d ${join(absBase, "*")}/ 2>/dev/null || true`,
      {
        encoding: "utf-8",
      },
    )
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((d) => d.replace(/\/$/, ""));

    for (const absDir of entries) {
      const relDir = relative(ROOT, absDir);
      const pkgJsonPath = join(absDir, "package.json");
      const pyprojectPath = join(absDir, "pyproject.toml");

      if (existsSync(pkgJsonPath)) {
        const pkg = readJson<{ name: string; version: string }>(pkgJsonPath);
        packages.push({
          dir: relDir,
          name: pkg.name,
          version: pkg.version,
          type: "node",
        });
      } else if (existsSync(pyprojectPath)) {
        const toml = readFileSync(pyprojectPath, "utf-8");
        const nameMatch = toml.match(/^name\s*=\s*"(.+)"/m);
        const versionMatch = toml.match(/^version\s*=\s*"(.+)"/m);
        packages.push({
          dir: relDir,
          name: nameMatch?.[1] ?? relDir,
          version: versionMatch?.[1] ?? "0.0.0",
          type: "python",
        });
      }
    }
  }

  return packages;
}

// ─── Content hashing ────────────────────────────────────────────────────────

function shouldExclude(filePath: string, pkgDir: string): boolean {
  const base = basename(filePath).toLowerCase();

  // Always exclude known metadata files
  if (EXCLUDED_BASENAMES.has(base)) return true;

  // Exclude root-level .md files (but not nested ones)
  const relToPackage = relative(pkgDir, filePath);
  const isRootLevel = !relToPackage.includes("/");
  if (isRootLevel) {
    const ext = base.slice(base.lastIndexOf("."));
    if (EXCLUDED_ROOT_EXTENSIONS.has(ext)) return true;
  }

  return false;
}

function computePackageHash(pkgDir: string): string {
  const absDir = join(ROOT, pkgDir);

  // Get tracked files within this package
  const files = run(`git ls-files -- "${pkgDir}"`, ROOT)
    .split("\n")
    .filter(Boolean)
    .filter((f) => !shouldExclude(join(ROOT, f), absDir))
    .sort();

  if (files.length === 0) {
    return createHash("sha256").update("empty").digest("hex");
  }

  // Build composite hash: SHA-256 of "filepath:filehash\n" pairs
  const composite = createHash("sha256");
  for (const file of files) {
    const absFile = join(ROOT, file);
    const content = readFileSync(absFile);
    const fileHash = createHash("sha256").update(content).digest("hex");
    composite.update(`${file}:${fileHash}\n`);
  }

  return composite.digest("hex");
}

// ─── Semver helpers ─────────────────────────────────────────────────────────

function bumpSemver(version: string, level: BumpLevel): string {
  const parts = version.split(".").map(Number);
  const [major = 0, minor = 0, patch = 0] = parts;

  switch (level) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

function buildDateVersion(currentRoot: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const todayPrefix = `${yyyy}.${mm}.${dd}`;

  // Check if current root starts with today's date
  if (currentRoot.startsWith(todayPrefix + ".")) {
    const n = parseInt(currentRoot.split(".")[3], 10) || 0;
    return `${todayPrefix}.${n + 1}`;
  }

  return `${todayPrefix}.1`;
}

// ─── Changelog helpers ──────────────────────────────────────────────────────

const CHANGELOG_PATH = join(ROOT, "CHANGELOG.md");

/**
 * Validate that CHANGELOG.md exists, has an ## [Unreleased] section,
 * and that section contains more than just whitespace before the next ## heading.
 * Returns the file content on success, throws on failure.
 */
function validateChangelog(): string {
  if (!existsSync(CHANGELOG_PATH)) {
    throw new Error("CHANGELOG.md not found at repo root.");
  }

  const content = readFileSync(CHANGELOG_PATH, "utf-8");
  const unreleasedMatch = content.match(/^## \[Unreleased\]\s*$/im);
  if (!unreleasedMatch) {
    throw new Error('CHANGELOG.md is missing an "## [Unreleased]" section.');
  }

  // Extract text between ## [Unreleased] and the next ## heading (or EOF)
  const afterUnreleased = content.slice(
    unreleasedMatch.index! + unreleasedMatch[0].length,
  );
  const nextH2 = afterUnreleased.search(/^## /m);
  const sectionBody =
    nextH2 === -1 ? afterUnreleased : afterUnreleased.slice(0, nextH2);

  if (sectionBody.trim().length === 0) {
    throw new Error(
      "CHANGELOG.md [Unreleased] section is empty. Add release notes before bumping.",
    );
  }

  return content;
}

/**
 * Insert a new release heading right after the Unreleased section content.
 * Moves the current Unreleased content under the new version heading and
 * leaves the Unreleased section empty (ready for future notes).
 */
function stampChangelog(content: string, version: string): string {
  const unreleasedMatch = content.match(/^## \[Unreleased\]\s*$/im);
  if (!unreleasedMatch) return content;

  const beforeUnreleased = content.slice(
    0,
    unreleasedMatch.index! + unreleasedMatch[0].length,
  );
  const afterUnreleased = content.slice(
    unreleasedMatch.index! + unreleasedMatch[0].length,
  );

  // Find where the next ## heading starts
  const nextH2 = afterUnreleased.search(/^## /m);
  const sectionBody =
    nextH2 === -1 ? afterUnreleased : afterUnreleased.slice(0, nextH2);
  const remainder = nextH2 === -1 ? "" : afterUnreleased.slice(nextH2);

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd}`;

  return (
    beforeUnreleased +
    "\n" +
    `\n## [${version}] — ${dateStr}\n` +
    sectionBody +
    remainder
  );
}

// ─── Version writers ────────────────────────────────────────────────────────

function writeNodeVersion(pkgDir: string, newVersion: string): void {
  const pkgPath = join(ROOT, pkgDir, "package.json");
  const pkg = readJson<Record<string, unknown>>(pkgPath);
  pkg.version = newVersion;
  writeJson(pkgPath, pkg);
}

function writePythonVersion(pkgDir: string, newVersion: string): void {
  const pyprojectPath = join(ROOT, pkgDir, "pyproject.toml");
  let content = readFileSync(pyprojectPath, "utf-8");
  content = content.replace(/^(version\s*=\s*")(.+)(")/m, `$1${newVersion}$3`);
  writeFileSync(pyprojectPath, content, "utf-8");
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const checkMode = args.includes("--check");
  const initMode = args.includes("--init");
  const isInteractive = !args.some((a) =>
    ["--patch", "--minor", "--major", "--check", "--init"].includes(a),
  );

  let defaultLevel: BumpLevel = "patch";
  if (args.includes("--major")) defaultLevel = "major";
  else if (args.includes("--minor")) defaultLevel = "minor";

  // ── Load or initialize hash file ──
  let hashFile: HashFile;
  if (existsSync(HASH_FILE)) {
    hashFile = readJson<HashFile>(HASH_FILE);
  } else {
    hashFile = { rootVersion: "0.0.0", packages: {} };
  }

  const packages = discoverPackages();

  if (packages.length === 0) {
    console.error("No workspace packages found.");
    process.exit(1);
  }

  // ── Init mode: seed hashes from current state ──
  if (initMode) {
    const rootPkg = readJson<{ version: string }>(join(ROOT, "package.json"));
    hashFile.rootVersion = rootPkg.version;

    for (const pkg of packages) {
      const hash = computePackageHash(pkg.dir);
      hashFile.packages[pkg.dir] = { hash, version: pkg.version };
    }

    if (dryRun) {
      console.log("Would write .version-hashes.json:");
      console.log(JSON.stringify(hashFile, null, 2));
    } else {
      writeJson(HASH_FILE, hashFile);
      console.log(
        `Initialized .version-hashes.json with ${packages.length} packages.`,
      );
    }
    return;
  }

  // ── Compute hashes and detect changes ──
  interface ChangeInfo {
    pkg: PackageInfo;
    oldHash: string;
    newHash: string;
    bumpLevel?: BumpLevel;
    newVersion?: string;
  }

  const changes: ChangeInfo[] = [];
  const unchanged: PackageInfo[] = [];

  console.log("\nComputing content hashes...\n");
  console.log(
    "Package".padEnd(30) +
      "Status".padEnd(12) +
      "Current".padEnd(12) +
      "Hash (short)",
  );
  console.log("─".repeat(70));

  for (const pkg of packages) {
    const newHash = computePackageHash(pkg.dir);
    const stored = hashFile.packages[pkg.dir];
    const oldHash = stored?.hash ?? "";
    const changed = oldHash !== newHash;

    const shortHash = newHash.slice(0, 12);
    const status = changed ? "CHANGED" : "ok";
    console.log(
      `${pkg.dir.padEnd(30)}${status.padEnd(12)}${pkg.version.padEnd(12)}${shortHash}`,
    );

    if (changed) {
      changes.push({ pkg, oldHash, newHash });
    } else {
      unchanged.push(pkg);
    }
  }

  console.log("");

  // ── Check mode: exit with status ──
  if (checkMode) {
    if (changes.length > 0) {
      console.log(
        `⚠  ${changes.length} package(s) have changed but versions not bumped:`,
      );
      for (const c of changes) {
        console.log(`   - ${c.pkg.dir} (${c.pkg.name})`);
      }
      process.exit(1);
    } else {
      console.log("✅ All package hashes match. No version bumps needed.");
      process.exit(0);
    }
  }

  if (changes.length === 0) {
    console.log("No packages changed. Nothing to bump.");
    return;
  }

  // ── Validate changelog has content in Unreleased section ──
  let changelogContent: string;
  try {
    changelogContent = validateChangelog();
    console.log("CHANGELOG.md: [Unreleased] section has content ✓\n");
  } catch (err) {
    console.error(`\n✖  ${(err as Error).message}`);
    process.exit(1);
  }

  // ── Determine bump level for each changed package ──
  if (isInteractive && !dryRun) {
    console.log("Select bump level for each changed package:\n");
    for (const change of changes) {
      const answer = await ask(
        `  ${change.pkg.dir} (${change.pkg.version}) — [p]atch / [m]inor / [M]ajor? [p] `,
      );
      switch (answer.toLowerCase()) {
        case "m":
          change.bumpLevel = "minor";
          break;
        case "major":
        case "M":
          change.bumpLevel = "major";
          break;
        default:
          change.bumpLevel = "patch";
      }
    }
    console.log("");
  } else {
    for (const change of changes) {
      change.bumpLevel = defaultLevel;
    }
  }

  // ── Calculate new versions ──
  for (const change of changes) {
    change.newVersion = bumpSemver(change.pkg.version, change.bumpLevel!);
  }

  const newRootVersion = buildDateVersion(hashFile.rootVersion);

  // ── Summary ──
  console.log("Planned changes:\n");
  console.log(
    "Package".padEnd(30) +
      "Current".padEnd(12) +
      "→".padEnd(4) +
      "New".padEnd(12) +
      "Bump",
  );
  console.log("─".repeat(70));
  for (const change of changes) {
    console.log(
      `${change.pkg.dir.padEnd(30)}${change.pkg.version.padEnd(12)}${"→".padEnd(4)}${change.newVersion!.padEnd(12)}${change.bumpLevel}`,
    );
  }
  console.log(
    `${"(root)".padEnd(30)}${hashFile.rootVersion.padEnd(12)}${"→".padEnd(4)}${newRootVersion}`,
  );
  console.log("");

  if (dryRun) {
    console.log("Dry run — no files modified.");
    return;
  }

  // ── Write version updates ──
  for (const change of changes) {
    if (change.pkg.type === "node") {
      writeNodeVersion(change.pkg.dir, change.newVersion!);
    } else {
      writePythonVersion(change.pkg.dir, change.newVersion!);
    }

    // Update hash file entry
    hashFile.packages[change.pkg.dir] = {
      hash: change.newHash,
      version: change.newVersion!,
    };
  }

  // Ensure unchanged packages still have entries
  for (const pkg of unchanged) {
    if (!hashFile.packages[pkg.dir]) {
      hashFile.packages[pkg.dir] = {
        hash: computePackageHash(pkg.dir),
        version: pkg.version,
      };
    }
  }

  // Update root version
  hashFile.rootVersion = newRootVersion;
  const rootPkgPath = join(ROOT, "package.json");
  const rootPkg = readJson<Record<string, unknown>>(rootPkgPath);
  rootPkg.version = newRootVersion;
  writeJson(rootPkgPath, rootPkg);

  // Write hash file
  writeJson(HASH_FILE, hashFile);

  // Stamp changelog: insert release heading below Unreleased
  const updatedChangelog = stampChangelog(changelogContent, newRootVersion);
  writeFileSync(CHANGELOG_PATH, updatedChangelog, "utf-8");

  console.log(`✅ Bumped ${changes.length} package(s).`);
  console.log(`   Root version: ${newRootVersion}`);
  console.log(`   Updated: .version-hashes.json, CHANGELOG.md`);
  console.log(
    `\n   Next steps:\n` +
      `     git add -A\n` +
      `     git commit -m "chore: bump versions to ${newRootVersion}"\n` +
      `     git tag v${newRootVersion}\n` +
      `     git push --follow-tags`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
