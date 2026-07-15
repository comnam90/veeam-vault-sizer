import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./vault-sizer";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
} from "../../src/types/simple-mode";
import type { RepositoryConfigValues } from "../../src/types/simple-mode";

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
});
