// Evidence probe for design decision D10 (see
// docs/superpowers/specs/2026-07-15-backup-copy-dual-pipeline-and-canvas-cleanup-design.md).
//
// Claim under test: the upstream VmAgent calculator ignores `backupType`
// (0=Backup, 1=Copy) and `copiesEnabled` — so the Backup Copy fan-out can size
// both pipelines with the same base defaults, with no per-side flag threading.
//
// Re-run:   node docs/evidence/copy-flags-inert/probe.mjs
// Refresh:  node docs/evidence/copy-flags-inert/probe.mjs --write-fixtures
//
// If a future run prints anything other than "IDENTICAL to A" for every
// variant, D10 no longer holds and the builder must thread the flags per-side.

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
  sourceTB: 10,
  changeRate: 3,
  reduction: 50,
  growthRatePercent: 10,
  growthFactor: 10,
  growthRateScopeYears: 3,
  projectLength: 3,
  days: 30,
  weeklies: 4,
  monthlies: 12,
  yearlies: 1,
  largeBlock: false,
  backupWindowHours: 8,
  showPoints: true,
  moveCapacityTierEnabled: false,
  copyCapacityTierEnabled: false,
  capacityTierDays: 0,
  immutableCap: false,
  immutableCapDays: 0,
  archiveTierEnabled: false,
  archiveTierDays: 0,
  archiveTierStandalone: false,
};

// Two target families the Primary/Secondary can take.
const configs = {
  "vault-azure (object)": {
    ...commonWorkload,
    blockGenerationDays: 10,
    objectStorage: true,
    storageType: "object",
    immutablePerf: true,
    immutablePerfDays: 30,
    blockCloning: false,
  },
  "hardened-repo (block/file)": {
    ...commonWorkload,
    blockGenerationDays: 0,
    objectStorage: false,
    storageType: null,
    immutablePerf: true,
    immutablePerfDays: 30,
    blockCloning: true,
  },
};

const flagVariants = {
  "A backup/copiesOff (bt0,ce0)": { backupType: 0, copiesEnabled: false },
  "B backup/copiesOn  (bt0,ce1)": { backupType: 0, copiesEnabled: true },
  "C copy/copiesOff   (bt1,ce0)": { backupType: 1, copiesEnabled: false },
  "D copy/copiesOn    (bt1,ce1)": { backupType: 1, copiesEnabled: true },
};

function summarize(ret) {
  const proxy = ret?.proxyCompute?.compute ?? {};
  const vols = (ret?.repoCompute?.compute?.volumes ?? []).map(
    (v) => `dp${v.diskPurpose}:${v.diskGB}GB`,
  );
  return {
    totalStorageTB: ret?.totalStorageTB,
    workspaceGB: ret?.workspaceGB,
    perfImmutTaxGB: ret?.performanceTierImmutabilityTaxGB,
    proxyCores: proxy.cores,
    proxyRam: proxy.ram,
    proxyNetOutMBps: proxy.networkThroughput?.outboundMBps,
    proxyNetInMBps: proxy.networkThroughput?.inboundMBps,
    repoVolumes: vols.join(", "),
    restorePointCount: ret?.restorePoints?.length,
  };
}

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

let anyDrift = false;
for (const [configName, base] of Object.entries(configs)) {
  console.log(`\n=== ${configName} ===`);
  const summaries = {};
  const rawByVariant = {};
  for (const [label, flags] of Object.entries(flagVariants)) {
    const data = await call({ ...base, ...flags });
    summaries[label] = summarize(data);
    rawByVariant[label] = data;
  }

  const labels = Object.keys(flagVariants);
  const baseline = summaries[labels[0]];
  for (const label of labels.slice(1)) {
    const diffs = Object.keys(baseline).filter(
      (f) => String(baseline[f]) !== String(summaries[label][f]),
    );
    if (diffs.length) anyDrift = true;
    console.log(
      `${label}: ${diffs.length ? "DRIFT → " + diffs.join(", ") : "IDENTICAL to A"}`,
    );
  }

  // Fixtures captured from the vault config's A (baseline) and D (both flags on).
  if (WRITE_FIXTURES && configName.startsWith("vault")) {
    writeFileSync(
      join(HERE, "vault-A-backup-copiesOff.json"),
      JSON.stringify(rawByVariant[labels[0]], null, 2) + "\n",
    );
    writeFileSync(
      join(HERE, "vault-D-copy-copiesOn.json"),
      JSON.stringify(rawByVariant[labels[3]], null, 2) + "\n",
    );
    console.log("(wrote raw fixtures for A and D)");
  }
}

console.log(
  `\nRESULT: ${anyDrift ? "DRIFT DETECTED — D10 broken" : "flags inert — D10 holds"}`,
);
process.exit(anyDrift ? 1 : 0);
