# Evidence: `backupType` / `copiesEnabled` are inert for the VmAgent endpoint

Backs design decision **D10** in
`docs/superpowers/specs/2026-07-15-backup-copy-dual-pipeline-and-canvas-cleanup-design.md`.

## Claim

The upstream calculator (`https://calculator.veeam.com/vse/api/VmAgent`) ignores the
`backupType` (`0 = Backup`, `1 = Copy`) and `copiesEnabled` inputs. The Backup Copy
fan-out can therefore size both the Primary and Secondary pipelines with the same
`base` defaults (`backupType: 0`, `copiesEnabled: false`) — no per-side flag threading,
and no risk that `copiesEnabled: true` double-counts.

## Method

`probe.mjs` POSTs a fixed payload across all four combinations of `backupType` ∈ {0,1}
and `copiesEnabled` ∈ {false, true}, for two target families the Primary/Secondary can
take: a Vault (object-storage) target and a Hardened Repository (block/file) target. It
diffs `totalStorageTB`, `workspaceGB`, performance-tier immutability tax, proxy
cores/RAM, network throughput (inbound and outbound), repo volumes, and restore-point
count against the baseline.

```
node docs/evidence/copy-flags-inert/probe.mjs                    # verify (exit 1 on drift)
node docs/evidence/copy-flags-inert/probe.mjs --write-fixtures   # refresh the raw fixtures
```

## Result (captured 2026-07-15)

Every variant was **byte-identical to the baseline** for both target families:

```
=== vault-azure (object) ===
B/C/D: IDENTICAL to A
=== hardened-repo (block/file) ===
B/C/D: IDENTICAL to A
RESULT: flags inert — D10 holds
```

Raw response bodies for the vault config's baseline (`vault-A-backup-copiesOff.json`)
and both-flags-on (`vault-D-copy-copiesOn.json`) are committed alongside this file — diff
them offline to confirm the two are identical without hitting the network.

## Incidental finding

The captured responses also confirm Part 1's premise (decision D9): even a single-tier
target returns `dp13` (Capacity) and `dp4` (Archive) volumes at `0` GB — the `0.0 TB`
noise the `> 0` tier filter removes.

## If this ever changes

`probe.mjs` exits non-zero if any variant drifts. A non-zero exit means the upstream
started honoring these flags, D10 no longer holds, and `buildBaseInputs` must thread
`backupType`/`copiesEnabled` per-side (Secondary as a copy).
