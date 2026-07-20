// Evidence probe backing docs/evidence/sobr-archive-tier-no-capacity/README.md.
//
// Claims under test against the live upstream VmAgent calculator
// (https://calculator.veeam.com/vse/api/VmAgent):
//
//   Issue 1 (block-file Performance Tier): with Archive Tier enabled and
//   Capacity Tier disabled, the Archive Tier branch is entirely inert —
//   Performance Tier's volume and Archive Tier's volume are identical
//   whether Archive Tier is on or off, at any offload-day threshold.
//
//   Issue 2 (object-storage Performance Tier): with Archive Tier enabled and
//   Capacity Tier disabled, Archive Tier *does* compute a volume, but
//   Performance Tier fails to drop the same restore points — they are
//   counted in both tiers (confirmed at the restore-point level, not just
//   aggregate totals).
//
//   Mechanism check: a "phantom" pass-through Capacity Tier
//   (moveCapacityTierEnabled, capacityTierDays, archiveTierDays: 0) forces
//   correct, lossless repartitioning when its threshold sits past the last
//   non-GFS-flagged restore point — and leaks a visible, non-zero Capacity
//   Tier volume when it doesn't (the two-request detect-and-resubmit
//   candidate fix relies on this).
//
//   Interleaving-omission check: does the corrected threshold from the
//   detect-and-resubmit mechanism ever drop a GFS point (i.e. does a
//   distinct isGFS:true point ever sit chronologically before the tail of
//   the non-GFS daily chain)? A single representative long-retention case
//   is checked here and gated into the drift exit code; see README.md
//   "Open risk — investigated" for the full swept matrix that backs the
//   negative result this asserts.
//
//   Duplicate-window anomaly (observational, NOT gated into drift exit
//   code — bug-vs-intended is unresolved, see README.md): when the
//   threshold in use lands within ~6 days before a GFS point's day, that
//   point can ship twice in the response, tagged under two different
//   pointTypes with two different backupCapacity values.
//
// Re-run:   node docs/evidence/sobr-archive-tier-no-capacity/probe.mjs
// Refresh:  node docs/evidence/sobr-archive-tier-no-capacity/probe.mjs --write-fixtures
//
// If this ever reports anything other than "BUG CONFIRMED" for Issues 1/2,
// Veeam has changed calculator behavior — re-evaluate the workaround and the
// upstream escalation before touching build-vm-agent-request.ts.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const URL = "https://calculator.veeam.com/vse/api/VmAgent";
const HERE = dirname(fileURLToPath(import.meta.url));
const WRITE_FIXTURES = process.argv.includes("--write-fixtures");

const commonWorkload = {
  productVersion: 0,
  calculatorMode: 0,
  hyperVisor: 0,
  backupType: 0,
  copiesEnabled: false,
  sourceTB: 10,
  changeRate: 3,
  reduction: 50,
  growthRatePercent: 10,
  growthFactor: 10,
  growthRateScopeYears: 1,
  projectLength: 1,
  days: 30,
  weeklies: 4,
  monthlies: 12,
  yearlies: 1,
  largeBlock: false,
  backupWindowHours: 8,
  showPoints: true,
};

const hardenedRepo = {
  ...commonWorkload,
  objectStorage: false,
  storageType: null,
  immutablePerf: true,
  immutablePerfDays: 30,
  blockCloning: true,
  blockGenerationDays: 0,
};

const s3Compatible = {
  ...commonWorkload,
  objectStorage: true,
  storageType: "object",
  immutablePerf: true,
  immutablePerfDays: 30,
  blockCloning: false,
  blockGenerationDays: 10,
};

const noTiering = {
  moveCapacityTierEnabled: false,
  copyCapacityTierEnabled: false,
  capacityTierDays: 0,
  immutableCap: false,
  immutableCapDays: 0,
  archiveTierEnabled: false,
  archiveTierDays: 0,
  archiveTierStandalone: false,
};

async function call(body) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.json();
  if (!res.ok)
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(raw).slice(0, 300)}`);
  return raw.data;
}

function vols(data) {
  const out = {};
  for (const v of data?.repoCompute?.compute?.volumes ?? [])
    out[v.diskPurpose] = Math.round(v.diskGB * 100) / 100;
  return out; // 2=perf(block) 3=perf(object) 13=capacity 4=archive
}

function daysByType(data) {
  const out = {};
  for (const p of data?.restorePoints ?? []) {
    (out[p.pointType] ??= []).push(p.day);
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a - b);
  return out;
}

let anyDrift = false;
function report(label, ok, detail) {
  console.log(
    `${ok ? "BUG CONFIRMED" : "*** DRIFT ***"}: ${label}${detail ? " — " + detail : ""}`,
  );
  if (!ok) anyDrift = true;
}

console.log(
  "=== Issue 1: block-file (Hardened Repository) — Archive branch inert ===",
);
{
  const A = await call({ ...hardenedRepo, ...noTiering });
  const B = await call({
    ...hardenedRepo,
    ...noTiering,
    archiveTierEnabled: true,
    archiveTierDays: 90,
  });
  const C = await call({
    ...hardenedRepo,
    ...noTiering,
    archiveTierEnabled: true,
    archiveTierDays: 7,
  });
  const vA = vols(A),
    vB = vols(B),
    vC = vols(C);
  console.log("  A (archive off)   volumes:", vA);
  console.log("  B (archive 90d)   volumes:", vB);
  console.log("  C (archive 7d)    volumes:", vC);
  const inert =
    vA[2] === vB[2] &&
    vB[2] === vC[2] &&
    (vB[4] ?? 0) === 0 &&
    (vC[4] ?? 0) === 0;
  report(
    "Performance unchanged and Archive stays 0 GB regardless of threshold",
    inert,
  );

  if (WRITE_FIXTURES) {
    writeFileSync(
      join(HERE, "issue1-A-hardened-archive-off.json"),
      JSON.stringify(A, null, 2) + "\n",
    );
    writeFileSync(
      join(HERE, "issue1-B-hardened-archive-90d.json"),
      JSON.stringify(B, null, 2) + "\n",
    );
  }
}

console.log(
  "\n=== Issue 2: object-storage (s3-compatible) — Performance/Archive double-count ===",
);
{
  const E0 = await call({ ...s3Compatible, ...noTiering });
  const E = await call({
    ...s3Compatible,
    ...noTiering,
    archiveTierEnabled: true,
    archiveTierDays: 90,
  });
  const vE0 = vols(E0),
    vE = vols(E);
  console.log("  E0 (archive off) volumes:", vE0);
  console.log("  E  (archive 90d) volumes:", vE);

  const dE = daysByType(E);
  const perfUnchanged = vE0[3] === vE[3];
  const archiveDuplicatesPerf = (dE.archiveTier ?? []).every((d) =>
    (dE.performanceTier ?? []).includes(d),
  );
  report(
    "Performance volume unchanged after enabling Archive, and every archived day is duplicated inside Performance's own day list",
    perfUnchanged && archiveDuplicatesPerf && (dE.archiveTier ?? []).length > 0,
    `archiveTier days ${JSON.stringify(dE.archiveTier)} ⊆ performanceTier days`,
  );

  if (WRITE_FIXTURES) {
    writeFileSync(
      join(HERE, "issue2-E0-s3compatible-archive-off.json"),
      JSON.stringify(E0, null, 2) + "\n",
    );
    writeFileSync(
      join(HERE, "issue2-E-s3compatible-archive-90d.json"),
      JSON.stringify(E, null, 2) + "\n",
    );
  }
}

console.log(
  "\n=== Reference: real 3-tier SOBR (Capacity Tier enabled) tiers correctly ===",
);
{
  const D = await call({
    ...hardenedRepo,
    moveCapacityTierEnabled: true,
    copyCapacityTierEnabled: true,
    capacityTierDays: 30,
    immutableCap: true,
    immutableCapDays: 30,
    archiveTierEnabled: true,
    archiveTierDays: 90,
    archiveTierStandalone: false,
    blockGenerationDays: 10, // capacityTier.type = vault-azure
  });
  console.log("  D (real capacity + archive) volumes:", vols(D));
  console.log(
    "  (informational only — confirms the engine CAN tier correctly when a real Capacity Tier is present)",
  );
}

console.log(
  "\n=== Mechanism check: phantom Capacity Tier repartitions losslessly when threshold clears the GFS boundary ===",
);
{
  const A = await call({ ...hardenedRepo, ...noTiering });
  const G = await call({
    ...hardenedRepo,
    ...noTiering,
    moveCapacityTierEnabled: true,
    copyCapacityTierEnabled: false,
    capacityTierDays: 90,
    immutableCap: false,
    immutableCapDays: 0,
    archiveTierEnabled: true,
    archiveTierDays: 0,
  });
  const dA = daysByType(A),
    dG = daysByType(G);
  const union = new Set([
    ...(dG.performanceTier ?? []),
    ...(dG.archiveTier ?? []),
  ]);
  const overlap = (dG.performanceTier ?? []).filter((d) =>
    (dG.archiveTier ?? []).includes(d),
  );
  const lossless =
    overlap.length === 0 &&
    union.size === (dA.performanceTier ?? []).length &&
    (dA.performanceTier ?? []).every((d) => union.has(d));
  console.log("  A (baseline, archive off) volumes:", vols(A));
  console.log("  G (phantom capacity, threshold=90) volumes:", vols(G));
  report(
    "G's Performance+Archive day sets exactly partition A's baseline with zero overlap/loss",
    lossless,
  );

  if (WRITE_FIXTURES) {
    writeFileSync(
      join(HERE, "mechanism-G-phantom-capacity-90d.json"),
      JSON.stringify(G, null, 2) + "\n",
    );
  }
}

console.log(
  "\n=== Mechanism risk: threshold set below the last non-GFS day strands points visibly ===",
);
{
  const H = await call({
    ...hardenedRepo,
    ...noTiering,
    moveCapacityTierEnabled: true,
    copyCapacityTierEnabled: false,
    capacityTierDays: 20, // deliberately too low
    immutableCap: false,
    immutableCapDays: 0,
    archiveTierEnabled: true,
    archiveTierDays: 0,
  });
  const vH = vols(H);
  console.log("  H (phantom capacity, threshold=20, too low) volumes:", vH);
  report(
    "a too-low threshold produces a visible non-zero ghost Capacity Tier volume (expected/illustrative, not a pass/fail bug check)",
    (vH[13] ?? 0) > 0,
  );
}

console.log(
  "\n=== Interleaving-omission check: corrected threshold never drops a GFS point ===",
);
{
  // Representative long-retention / monthly-GFS case from the swept matrix
  // in README.md ("Open risk — investigated"). Object storage, since that's
  // where Issue 2 shows GFS days interleaved with Performance's own list.
  const days = 120,
    weeklies = 0,
    monthlies = 12,
    yearlies = 1;
  const R1 = await call({
    ...s3Compatible,
    ...noTiering,
    days,
    weeklies,
    monthlies,
    yearlies,
    moveCapacityTierEnabled: true,
    archiveTierEnabled: true,
    capacityTierDays: s3Compatible.immutablePerfDays,
    archiveTierDays: 0,
  });
  const gfs1 = (R1.restorePoints ?? []).filter((p) => p.isGFS);
  const nonGfs1 = (R1.restorePoints ?? []).filter((p) => !p.isGFS);
  const maxNonGfsDay = Math.max(...nonGfs1.map((p) => p.day));
  const correctedThreshold = maxNonGfsDay + 1;
  const R2 = await call({
    ...s3Compatible,
    ...noTiering,
    days,
    weeklies,
    monthlies,
    yearlies,
    moveCapacityTierEnabled: true,
    archiveTierEnabled: true,
    capacityTierDays: correctedThreshold,
    archiveTierDays: 0,
  });
  const archived2Days = new Set(
    (R2.restorePoints ?? [])
      .filter((p) => p.pointType === "archiveTier")
      .map((p) => p.day),
  );
  const missing = gfs1.filter((p) => !archived2Days.has(p.day));
  console.log(
    `  days=${days} m=${monthlies} y=${yearlies}: gfs points in R1=${gfs1.length}, maxNonGfsDay=${maxNonGfsDay}, ` +
      `correctedThreshold=${correctedThreshold}, archived after resubmit=${archived2Days.size}`,
  );
  report(
    "corrected threshold does not drop any of R1's isGFS:true points (representative case — see README.md for the full swept matrix backing this)",
    missing.length === 0,
  );
}

console.log(
  "\n=== Duplicate-window check: same-day duplicate across tiers is Veeam's Immutability Tax (resolved intended) ===",
);
{
  // A fully realistic, valid config (immutability < retention, per this
  // project's own rule — see README.md "Duplicate-window over-count"):
  // 30-day short-term retention, 14-day immutability, Capacity Tier moved
  // at 60 days. 60 lands 3 days before the first distinct monthly GFS
  // point (day 63, "M2" — M1 is absorbed into the daily chain at this
  // retention). Any capacityTierDays in [57, 62] reproduces it.
  const days = 30,
    weeklies = 0,
    monthlies = 12,
    yearlies = 1;
  const capacityTierDays = 60;
  const R = await call({
    ...s3Compatible,
    ...noTiering,
    days,
    weeklies,
    monthlies,
    yearlies,
    immutablePerfDays: 14,
    moveCapacityTierEnabled: true,
    archiveTierEnabled: true,
    capacityTierDays,
    archiveTierDays: 0,
  });
  const byDay = {};
  for (const p of R.restorePoints ?? [])
    (byDay[p.day] ??= new Set()).add(p.pointType);
  const dupDays = Object.entries(byDay)
    .filter(([, types]) => types.size > 1)
    .map(([d, types]) => [Number(d), [...types]]);
  const tax =
    (R.performanceTierImmutabilityTaxGB ?? 0) +
    (R.capacityTierImmutabilityTaxGB ?? 0);
  console.log(
    `  days=${days}, immutablePerfDays=14, capacityTierDays=${capacityTierDays}: same-day-in-two-tiers = ${JSON.stringify(dupDays)}, ` +
      `performanceTierImmutabilityTaxGB=${R.performanceTierImmutabilityTaxGB}, capacityTierImmutabilityTaxGB=${R.capacityTierImmutabilityTaxGB}`,
  );
  report(
    "a same-day duplicate across tiers is accounted for by a non-zero Immutability Tax field (confirmed intended — see README.md)",
    dupDays.length === 0 || tax > 0,
  );
  console.log(
    "  NOTE: src/lib/simple-mode/storage-tiers.ts's getTotalStorageGB() does not currently add\n" +
      "  performanceTierImmutabilityTaxGB/capacityTierImmutabilityTaxGB into the reported total — see\n" +
      "  README.md 'Duplicate-window over-count' for the confirmed ~6% undercount this causes here.",
  );
}

console.log(
  `\nRESULT: ${anyDrift ? "DRIFT DETECTED — re-check README.md, escalation, and the workaround design" : "all findings in README.md still hold"}`,
);
process.exit(anyDrift ? 1 : 0);
