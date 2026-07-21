import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./vault-sizer";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
} from "../../src/types/simple-mode";
import type { RepositoryConfigValues } from "../../src/types/simple-mode";
import type {
  CVmAgentReturnObject,
  Volume,
  CRpsPoints,
} from "../../src/types/vault-sizer-api";

function postRequest(body: unknown): { request: Request } {
  return {
    request: new Request("http://localhost/api/vault-sizer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  };
}

const copyConfig: RepositoryConfigValues = {
  ...DEFAULT_REPOSITORY_CONFIG_VALUES,
  backupPath: "copy",
};

function makeUpstreamResponse(
  volumes: Volume[],
  restorePoints: CRpsPoints[],
  totalStorageTB = 0,
): { data: CVmAgentReturnObject } {
  return {
    data: {
      totalStorageTB,
      workspaceGB: 0,
      performanceTierImmutabilityTaxGB: 0,
      capacityTierImmutabilityTaxGB: 0,
      repoCompute: { compute: { cores: 2, ram: 8, volumes } },
      restorePoints,
    },
  };
}

const archiveOnlySobrConfig: RepositoryConfigValues = {
  ...DEFAULT_REPOSITORY_CONFIG_VALUES,
  targetRepository: "sobr",
  sobr: {
    ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr,
    archiveTier: {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr.archiveTier,
      enabled: true,
    },
  },
};

describe("onRequestPost", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds a VmAgentInputs request, forwards it upstream, and returns the unwrapped data", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { totalStorageTB: 18.4 } }),
        { status: 200 },
      ),
    );

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      mode: "direct",
      data: { totalStorageTB: 18.4 },
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://calculator.veeam.com/vse/api/VmAgent");
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.sourceTB).toBe(10);
    expect(sentBody.objectStorage).toBe(true);
  });

  it("normalizes a ReturnMessage 400 body into a single error string", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          messages: ["sourceTB must be between 0 and 1,024,000"],
        }),
        { status: 400 },
      ),
    );

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: "sourceTB must be between 0 and 1,024,000",
    });
  });

  it("normalizes a ValidationProblemDetails 400 body into a single error string", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "One or more validation errors occurred.",
          status: 400,
          errors: {
            sourceTB: ["The field sourceTB must be between 0 and 1024000."],
          },
        }),
        { status: 400 },
      ),
    );

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: "The field sourceTB must be between 0 and 1024000.",
    });
  });

  it("falls back to a generic message when the 400 body matches neither documented shape", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 400 }),
    );

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: "Calculation engine rejected the request",
    });
  });

  it("returns 502 when the upstream API is unreachable", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network error"));

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      success: false,
      error: "Upstream sizing API unreachable",
    });
  });

  it("fans a copy request out into two upstream calls and aggregates both", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, data: { totalStorageTB: 24 } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, data: { totalStorageTB: 18.4 } }),
          { status: 200 },
        ),
      );

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: copyConfig,
      }),
    );
    const body = await response.json();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      mode: "copy",
      primary: { totalStorageTB: 24 },
      secondary: { totalStorageTB: 18.4 },
    });
  });

  it("fails whole with a Primary-labeled error when the Primary sizing fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: false, messages: ["primary boom"] }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, data: { totalStorageTB: 18.4 } }),
          { status: 200 },
        ),
      );

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: copyConfig,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain("Primary (on-premises) sizing failed");
    expect(body.error).toContain("primary boom");
  });

  it("fails whole with a Secondary-labeled error when the Secondary sizing fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, data: { totalStorageTB: 24 } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: false, messages: ["secondary boom"] }),
          { status: 400 },
        ),
      );

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: copyConfig,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Secondary (offsite Vault) sizing failed");
    expect(body.error).toContain("secondary boom");
  });

  it("uses the generic fallback message when a failed side returns a non-JSON body", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response("<html>gateway error</html>", { status: 502 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, data: { totalStorageTB: 18.4 } }),
          { status: 200 },
        ),
      );

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: copyConfig,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toContain("Primary (on-premises) sizing failed");
    expect(body.error).toContain("Calculation engine rejected the request");
  });

  it("returns 502 when a copy upstream call rejects (network failure)", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, data: { totalStorageTB: 24 } }),
          { status: 200 },
        ),
      )
      .mockRejectedValueOnce(new Error("network error"));

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: copyConfig,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      success: false,
      error: "Upstream sizing API unreachable",
    });
  });

  it("returns 400 for an invalid JSON body", async () => {
    const response = await onRequestPost({
      request: new Request("http://localhost/api/vault-sizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ success: false, error: "Invalid JSON body" });
  });

  it("returns 400 for a request body missing repositoryConfig", async () => {
    const response = await onRequestPost(postRequest({}));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ success: false, error: "Invalid request body" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 400 for a null request body", async () => {
    const response = await onRequestPost(postRequest(null));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ success: false, error: "Invalid request body" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("triggering config, phantom call clean, floor unchanged from user's own archiveTierDays: one fetch, archiveTierNotice undefined", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          makeUpstreamResponse(
            [
              { diskGB: 100, diskPurpose: 3 },
              { diskGB: 50, diskPurpose: 4 },
              { diskGB: 0, diskPurpose: 13 },
            ],
            [
              {
                pointType: "performanceTier",
                day: 10,
                backupCapacity: 0.1,
                isFull: true,
                isGFS: false,
                isImmutable: false,
              },
              {
                pointType: "archiveTier",
                day: 95,
                backupCapacity: 0.5,
                isFull: true,
                isGFS: true,
                isImmutable: false,
              },
            ],
          ),
        ),
        { status: 200 },
      ),
    );

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: archiveOnlySobrConfig,
      }),
    );
    const body = await response.json();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(body.success).toBe(true);
    expect(body.archiveTierNotice).toBeUndefined();

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.moveCapacityTierEnabled).toBe(true);
    expect(sentBody.capacityTierDays).toBe(90);
    expect(sentBody.archiveTierDays).toBe(0);
  });

  it("default-config repro: a young GFS point below the 90-day threshold correctly stays unarchived, one fetch, no failed notice", async () => {
    // Captured shape (trimmed) from the live calculator API for the app's
    // actual defaults: sourceTB 10, days (short-term retention) 30, weeklies
    // 4, monthlies 12, yearlies 1 (capped from 3 by the 1-year Forecast
    // Horizon), immutablePerfDays 30, archiveTierDays 90, Vault Azure
    // Performance Tier, no Capacity Tier. The first distinct monthly GFS
    // point (M2, day 63) is 27 days short of the 90-day threshold and
    // legitimately stays performanceTier-only; every GFS day past the
    // threshold (M3 day 98 onward) is tagged archiveTier. This must resolve
    // as a clean, non-triggering result — not a failed notice.
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          makeUpstreamResponse(
            [
              { diskGB: 13911.04, diskPurpose: 3 },
              { diskGB: 13235.2, diskPurpose: 4 },
              { diskGB: 0, diskPurpose: 13 },
            ],
            [
              {
                pointType: "performanceTier",
                day: 35,
                backupCapacity: 0.1,
                isFull: true,
                isGFS: false,
                isImmutable: false,
                flags: "M1",
              },
              {
                pointType: "performanceTier",
                day: 63,
                backupCapacity: 5.5,
                isFull: true,
                isGFS: true,
                isImmutable: false,
                flags: "M2",
              },
              {
                pointType: "archiveTier",
                day: 98,
                backupCapacity: 0.82,
                isFull: true,
                isGFS: true,
                isImmutable: false,
                flags: "M3",
              },
              {
                pointType: "archiveTier",
                day: 371,
                backupCapacity: 0.9,
                isFull: true,
                isGFS: true,
                isImmutable: false,
                flags: "M12 Y1",
              },
            ],
          ),
        ),
        { status: 200 },
      ),
    );

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: archiveOnlySobrConfig,
      }),
    );
    const body = await response.json();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(body.success).toBe(true);
    expect(body.archiveTierNotice).toBeUndefined();

    // Confirms the real default config assembles the exact phantom-tier
    // request the live-API repro validated — not just that a mock response
    // shaped like it resolves cleanly.
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.moveCapacityTierEnabled).toBe(true);
    expect(sentBody.capacityTierDays).toBe(90);
    expect(sentBody.archiveTierDays).toBe(0);
    expect(sentBody.objectStorage).toBe(true);
  });

  it("triggering config, phantom call clean, floor raises threshold above user's own archiveTierDays: one fetch, adjusted notice", async () => {
    const loweredMoveDaysConfig: RepositoryConfigValues = {
      ...archiveOnlySobrConfig,
      sobr: {
        ...archiveOnlySobrConfig.sobr,
        archiveTier: {
          ...archiveOnlySobrConfig.sobr.archiveTier,
          moveDays: "20",
        },
      },
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          makeUpstreamResponse(
            [
              { diskGB: 100, diskPurpose: 3 },
              { diskGB: 50, diskPurpose: 4 },
              { diskGB: 0, diskPurpose: 13 },
            ],
            [
              {
                pointType: "performanceTier",
                day: 10,
                backupCapacity: 0.1,
                isFull: true,
                isGFS: false,
                isImmutable: false,
              },
              {
                pointType: "archiveTier",
                day: 95,
                backupCapacity: 0.5,
                isFull: true,
                isGFS: true,
                isImmutable: false,
              },
            ],
          ),
        ),
        { status: 200 },
      ),
    );

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: loweredMoveDaysConfig,
      }),
    );
    const body = await response.json();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(body.archiveTierNotice).toEqual({
      status: "adjusted",
      effectiveThresholdDays: 30,
    });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.capacityTierDays).toBe(30);
  });

  it("triggering config, leak on first call, corrected resubmit clean: two fetches, adjusted notice", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeUpstreamResponse(
              [
                { diskGB: 100, diskPurpose: 3 },
                { diskGB: 50, diskPurpose: 4 },
                { diskGB: 20, diskPurpose: 13 },
              ],
              [
                {
                  pointType: "performanceTier",
                  day: 10,
                  backupCapacity: 0.1,
                  isFull: true,
                  isGFS: false,
                  isImmutable: false,
                },
                {
                  pointType: "performanceTier",
                  day: 95,
                  backupCapacity: 0.1,
                  isFull: true,
                  isGFS: false,
                  isImmutable: false,
                },
              ],
              50,
            ),
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeUpstreamResponse(
              [
                { diskGB: 150, diskPurpose: 3 },
                { diskGB: 60, diskPurpose: 4 },
                { diskGB: 0, diskPurpose: 13 },
              ],
              [
                {
                  pointType: "performanceTier",
                  day: 10,
                  backupCapacity: 0.1,
                  isFull: true,
                  isGFS: false,
                  isImmutable: false,
                },
                {
                  pointType: "performanceTier",
                  day: 95,
                  backupCapacity: 0.1,
                  isFull: true,
                  isGFS: false,
                  isImmutable: false,
                },
                {
                  pointType: "archiveTier",
                  day: 150,
                  backupCapacity: 0.8,
                  isFull: true,
                  isGFS: true,
                  isImmutable: false,
                },
              ],
              70,
            ),
          ),
          { status: 200 },
        ),
      );

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: archiveOnlySobrConfig,
      }),
    );
    const body = await response.json();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(body.data.totalStorageTB).toBe(70);
    expect(body.archiveTierNotice).toEqual({
      status: "adjusted",
      effectiveThresholdDays: 96,
    });

    const [, secondInit] = vi.mocked(fetch).mock.calls[1];
    const secondSentBody = JSON.parse(
      (secondInit as RequestInit).body as string,
    );
    expect(secondSentBody.capacityTierDays).toBe(96);
  });

  it("triggering config, corrected resubmit still incomplete: three fetches, raw fallback data, failed notice", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeUpstreamResponse(
              [
                { diskGB: 100, diskPurpose: 3 },
                { diskGB: 50, diskPurpose: 4 },
                { diskGB: 20, diskPurpose: 13 },
              ],
              [
                {
                  pointType: "performanceTier",
                  day: 10,
                  backupCapacity: 0.1,
                  isFull: true,
                  isGFS: false,
                  isImmutable: false,
                },
                {
                  pointType: "performanceTier",
                  day: 95,
                  backupCapacity: 0.1,
                  isFull: true,
                  isGFS: false,
                  isImmutable: false,
                },
              ],
            ),
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeUpstreamResponse(
              [
                { diskGB: 150, diskPurpose: 3 },
                { diskGB: 60, diskPurpose: 4 },
                { diskGB: 0, diskPurpose: 13 },
              ],
              [
                {
                  pointType: "performanceTier",
                  day: 10,
                  backupCapacity: 0.1,
                  isFull: true,
                  isGFS: false,
                  isImmutable: false,
                },
                {
                  pointType: "performanceTier",
                  day: 95,
                  backupCapacity: 0.1,
                  isFull: true,
                  isGFS: false,
                  isImmutable: false,
                },
                // Still incomplete: GFS day never got tagged archiveTier.
                {
                  pointType: "performanceTier",
                  day: 150,
                  backupCapacity: 0.8,
                  isFull: true,
                  isGFS: true,
                  isImmutable: false,
                },
              ],
            ),
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeUpstreamResponse([{ diskGB: 999, diskPurpose: 2 }], [], 99),
          ),
          { status: 200 },
        ),
      );

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: archiveOnlySobrConfig,
      }),
    );
    const body = await response.json();

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(body.data.totalStorageTB).toBe(99);
    expect(body.archiveTierNotice).toEqual({ status: "failed" });

    const [, thirdInit] = vi.mocked(fetch).mock.calls[2];
    const thirdSentBody = JSON.parse((thirdInit as RequestInit).body as string);
    expect(thirdSentBody.moveCapacityTierEnabled).toBeFalsy();
    expect(thirdSentBody.archiveTierDays).toBe(90);
  });

  it("triggering config, corrected resubmit is GFS-complete but still has a residual Capacity Tier volume: three fetches, raw fallback data, failed notice", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeUpstreamResponse(
              [
                { diskGB: 100, diskPurpose: 3 },
                { diskGB: 50, diskPurpose: 4 },
                { diskGB: 20, diskPurpose: 13 },
              ],
              [
                {
                  pointType: "performanceTier",
                  day: 10,
                  backupCapacity: 0.1,
                  isFull: true,
                  isGFS: false,
                  isImmutable: false,
                },
                {
                  pointType: "capacityTier",
                  day: 95,
                  backupCapacity: 0.1,
                  isFull: false,
                  isGFS: false,
                  isImmutable: false,
                },
              ],
            ),
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeUpstreamResponse(
              // Every GFS day IS tagged archiveTier below (isArchiveComplete
              // would say true) — but diskPurpose 13 is still non-zero, i.e.
              // the corrected threshold did not actually fully drain the
              // phantom Capacity Tier. This is the residual-leak case
              // isArchiveComplete alone cannot detect.
              [
                { diskGB: 150, diskPurpose: 3 },
                { diskGB: 60, diskPurpose: 4 },
                { diskGB: 5, diskPurpose: 13 },
              ],
              [
                {
                  pointType: "performanceTier",
                  day: 10,
                  backupCapacity: 0.1,
                  isFull: true,
                  isGFS: false,
                  isImmutable: false,
                },
                {
                  pointType: "archiveTier",
                  day: 150,
                  backupCapacity: 0.8,
                  isFull: true,
                  isGFS: true,
                  isImmutable: false,
                },
              ],
            ),
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeUpstreamResponse([{ diskGB: 999, diskPurpose: 2 }], [], 88),
          ),
          { status: 200 },
        ),
      );

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: archiveOnlySobrConfig,
      }),
    );
    const body = await response.json();

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(body.data.totalStorageTB).toBe(88);
    expect(body.archiveTierNotice).toEqual({ status: "failed" });

    const [, thirdInit] = vi.mocked(fetch).mock.calls[2];
    const thirdSentBody = JSON.parse((thirdInit as RequestInit).body as string);
    expect(thirdSentBody.moveCapacityTierEnabled).toBeFalsy();
    expect(thirdSentBody.archiveTierDays).toBe(90);
  });

  it("returns 502 when the workaround's last-resort fallback call itself rejects", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeUpstreamResponse(
              [
                { diskGB: 100, diskPurpose: 3 },
                { diskGB: 50, diskPurpose: 4 },
                { diskGB: 20, diskPurpose: 13 },
              ],
              [
                {
                  pointType: "performanceTier",
                  day: 10,
                  backupCapacity: 0.1,
                  isFull: true,
                  isGFS: false,
                  isImmutable: false,
                },
                {
                  pointType: "performanceTier",
                  day: 95,
                  backupCapacity: 0.1,
                  isFull: true,
                  isGFS: false,
                  isImmutable: false,
                },
              ],
            ),
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeUpstreamResponse(
              [
                { diskGB: 150, diskPurpose: 3 },
                { diskGB: 60, diskPurpose: 4 },
                { diskGB: 0, diskPurpose: 13 },
              ],
              [
                {
                  pointType: "performanceTier",
                  day: 10,
                  backupCapacity: 0.1,
                  isFull: true,
                  isGFS: false,
                  isImmutable: false,
                },
                {
                  pointType: "performanceTier",
                  day: 95,
                  backupCapacity: 0.1,
                  isFull: true,
                  isGFS: false,
                  isImmutable: false,
                },
                {
                  pointType: "performanceTier",
                  day: 150,
                  backupCapacity: 0.8,
                  isFull: true,
                  isGFS: true,
                  isImmutable: false,
                },
              ],
            ),
          ),
          { status: 200 },
        ),
      )
      .mockRejectedValueOnce(new Error("network error"));

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: archiveOnlySobrConfig,
      }),
    );
    const body = await response.json();

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(response.status).toBe(502);
    expect(body).toEqual({
      success: false,
      error: "Upstream sizing API unreachable",
    });
  });

  it("triggering config, first call has no leak but still incomplete: two fetches (no corrected resubmit in between), raw fallback data, failed notice", async () => {
    // This exercises resolveInputs's OTHER incomplete path: reachable
    // whenever isArchiveComplete fails on the very first phantom response and
    // hasLeakedNonGfsPoints never fires, so no corrected resubmit happens —
    // just phantom, then fallback. Distinct from the leak-first fallback test
    // above (phantom, corrected resubmit, fallback — three calls). Synthetic
    // — the live evidence sweep found zero completeness failures in practice
    // — but it is a real branch of resolveInputs's control flow that must not
    // go untested.
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeUpstreamResponse(
              [
                { diskGB: 100, diskPurpose: 3 },
                { diskGB: 50, diskPurpose: 4 },
                { diskGB: 0, diskPurpose: 13 },
              ],
              [
                {
                  pointType: "performanceTier",
                  day: 10,
                  backupCapacity: 0.1,
                  isFull: true,
                  isGFS: false,
                  isImmutable: false,
                },
                // Still incomplete: GFS day never got tagged archiveTier.
                {
                  pointType: "performanceTier",
                  day: 150,
                  backupCapacity: 0.8,
                  isFull: true,
                  isGFS: true,
                  isImmutable: false,
                },
              ],
            ),
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeUpstreamResponse([{ diskGB: 777, diskPurpose: 2 }], [], 77),
          ),
          { status: 200 },
        ),
      );

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: archiveOnlySobrConfig,
      }),
    );
    const body = await response.json();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(body.data.totalStorageTB).toBe(77);
    expect(body.archiveTierNotice).toEqual({ status: "failed" });

    const [, secondInit] = vi.mocked(fetch).mock.calls[1];
    const secondSentBody = JSON.parse(
      (secondInit as RequestInit).body as string,
    );
    expect(secondSentBody.moveCapacityTierEnabled).toBeFalsy();
    expect(secondSentBody.archiveTierDays).toBe(90);
  });

  it("Backup Copy: Secondary triggers and gets an adjusted notice, Primary is unaffected", async () => {
    const copyArchiveOnlyConfig: RepositoryConfigValues = {
      ...copyConfig,
      targetRepository: "sobr",
      sobr: {
        ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr,
        archiveTier: {
          ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr.archiveTier,
          enabled: true,
          moveDays: "20",
        },
      },
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeUpstreamResponse([{ diskGB: 24576, diskPurpose: 2 }], [], 24),
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeUpstreamResponse(
              [
                { diskGB: 100, diskPurpose: 3 },
                { diskGB: 50, diskPurpose: 4 },
                { diskGB: 0, diskPurpose: 13 },
              ],
              [
                {
                  pointType: "performanceTier",
                  day: 10,
                  backupCapacity: 0.1,
                  isFull: true,
                  isGFS: false,
                  isImmutable: false,
                },
                {
                  pointType: "archiveTier",
                  day: 95,
                  backupCapacity: 0.5,
                  isFull: true,
                  isGFS: true,
                  isImmutable: false,
                },
              ],
            ),
          ),
          { status: 200 },
        ),
      );

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: copyArchiveOnlyConfig,
      }),
    );
    const body = await response.json();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(body.primary.totalStorageTB).toBe(24);
    expect(body.archiveTierNotice).toEqual({
      status: "adjusted",
      effectiveThresholdDays: 30,
    });

    const [, secondaryInit] = vi.mocked(fetch).mock.calls[1];
    const secondarySentBody = JSON.parse(
      (secondaryInit as RequestInit).body as string,
    );
    expect(secondarySentBody.capacityTierDays).toBe(30);
  });
});
