/**
 * Exports machine-readable roadmaps from docs/GAMEPLAY-REDESIGN.md.
 *
 * Usage: node scripts/export-units.mjs [path-to-doc]
 * Output: docs/IMPLEMENTATION-UNITS.json, docs/MECHANICS-MATRIX.csv
 *
 * Deterministic, no deps. Safe to re-run after the doc is edited.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const docPath =
  process.argv[2] ||
  resolve(process.cwd(), "docs/GAMEPLAY-REDESIGN.md");
const outDir = resolve(process.cwd(), "docs");

const md = readFileSync(docPath, "utf8");
const lines = md.split(/\r?\n/);

/** Collect markdown tables: returns [{ startLine, header, rows }] */
function collectTables() {
  const tables = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i])) continue;
    if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) continue;
    const header = splitRow(lines[i]);
    const rows = [];
    let j = i + 2;
    while (j < lines.length && /^\s*\|/.test(lines[j])) {
      rows.push({ line: j + 1, cells: splitRow(lines[j]) });
      j++;
    }
    tables.push({ startLine: i + 1, header, rows });
    i = j - 1;
  }
  return tables;
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

const clean = (s) =>
  (s || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

const tables = collectTables();

// ---- Implementation units (D11) ----
const units = [];
for (const t of tables) {
  const head = t.header.map(clean);
  const idIdx = head.findIndex((h) => /^ID$/i.test(h));
  if (idIdx < 0) continue;
  const featIdx = head.findIndex((h) => /feature/i.test(h));
  if (featIdx < 0) continue;
  const col = (name) => head.findIndex((h) => new RegExp(`^${name}$`, "i").test(h));
  const iValue = col("Player value");
  const iSystems = col("Systems affected");
  const iDonor = col("Donor");
  const iReuse = col("Reuse");
  const iDiff = col("Diff");
  const iDeps = col("Deps");
  const iAccept = head.findIndex((h) => /acceptance/i.test(h));

  for (const r of t.rows) {
    const id = clean(r.cells[idIdx]);
    if (!/^U-\d\d[a-z]?$/.test(id)) continue;
    units.push({
      id,
      feature: clean(r.cells[featIdx]),
      player_value: iValue >= 0 ? clean(r.cells[iValue]) : null,
      systems: iSystems >= 0 ? clean(r.cells[iSystems]) : null,
      donor: iDonor >= 0 ? clean(r.cells[iDonor]) : null,
      reuse: iReuse >= 0 ? clean(r.cells[iReuse]) : null,
      difficulty: iDiff >= 0 ? clean(r.cells[iDiff]) : null,
      deps: iDeps >= 0 && clean(r.cells[iDeps]) !== "—" ? clean(r.cells[iDeps]) : [],
      acceptance: iAccept >= 0 ? clean(r.cells[iAccept]) : null,
      source_line: r.line,
    });
  }
}

// Normalise deps into arrays
for (const u of units) {
  if (typeof u.deps === "string") {
    u.deps = u.deps
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^U-\d\d[a-z]?$/.test(s));
  }
}

// ---- Mechanics matrix (section C) ----
let matrix = null;
for (const t of tables) {
  if (clean(t.header[0]) !== "mechanic_id") continue;
  matrix = {
    columns: t.header.map(clean),
    rows: t.rows.map((r) => {
      const o = {};
      t.header.forEach((h, i) => {
        o[clean(h)] = clean(r.cells[i]);
      });
      return o;
    }),
  };
  break;
}

mkdirSync(outDir, { recursive: true });

const unitsOut = {
  generated_from: "docs/GAMEPLAY-REDESIGN.md / DELIVERABLE 11",
  note: "Difficulty: S <= 1 day, M = 2-4 days, L >= 1 week. Reuse: R1 retained, R2 donor adapted, R3 original.",
  count: units.length,
  units,
};
writeFileSync(
  resolve(outDir, "IMPLEMENTATION-UNITS.json"),
  JSON.stringify(unitsOut, null, 2) + "\n",
  "utf8"
);

if (matrix) {
  const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const csv = [
    matrix.columns.map(esc).join(","),
    ...matrix.rows.map((r) => matrix.columns.map((c) => esc(r[c])).join(",")),
  ].join("\n");
  writeFileSync(resolve(outDir, "MECHANICS-MATRIX.csv"), csv + "\n", "utf8");
}

console.log(`units:  ${units.length}  -> docs/IMPLEMENTATION-UNITS.json`);
console.log(`matrix: ${matrix ? matrix.rows.length : 0}  -> docs/MECHANICS-MATRIX.csv`);
const byDiff = units.reduce((a, u) => ((a[u.difficulty] = (a[u.difficulty] || 0) + 1), a), {});
console.log("difficulty mix:", JSON.stringify(byDiff));
