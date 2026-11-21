import { describe, it, expect, vi, beforeEach } from "vitest";

const coreMocks = vi.hoisted(() => {
  const channels: Array<{ onmessage: ((event: unknown) => void) | null }> = [];
  return {
    invoke: vi.fn(),
    channels,
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => coreMocks.invoke(...args),
  Channel: class MockChannel {
    onmessage: ((event: unknown) => void) | null = null;
    constructor() {
      coreMocks.channels.push(this);
    }
  },
}));

import {
  checkAppUpdate,
  installAppUpdate,
  closeAppUpdate,
  parseAppUpdateError,
} from "./updater-client";

describe("updater-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    coreMocks.channels.length = 0;
  });

  it("calls check_app_update via invoke", async () => {
    const mockResp = {
      source: "mirror",
      fallbackFromMirror: false,
      update: {
        rid: 7,
        currentVersion: "0.3.8",
        version: "0.3.9",
        date: "2026-11-21T09:00:00Z",
        body: "notes",
      },
    };
    coreMocks.invoke.mockResolvedValueOnce(mockResp);

    const result = await checkAppUpdate();

    expect(coreMocks.invoke).toHaveBeenCalledWith("check_app_update");
    expect(result).toEqual(mockResp);
  });

  it("wires Channel events into install_app_update", async () => {
    const events: unknown[] = [];
    coreMocks.invoke.mockImplementationOnce(async (_cmd: string, args: { onEvent: { onmessage: (e: unknown) => void } }) => {
      args.onEvent.onmessage({
        event: "Started",
        data: { source: "mirror", fallbackFromMirror: false, totalBytes: 1024 },
      });
      return { source: "mirror", fallbackFromMirror: false };
    });

    const route = await installAppUpdate(7, (e) => events.push(e));

    expect(coreMocks.invoke).toHaveBeenCalledWith(
      "install_app_update",
      expect.objectContaining({ rid: 7, onEvent: coreMocks.channels[0] }),
    );
    expect(events).toHaveLength(1);
    expect(route).toEqual({ source: "mirror", fallbackFromMirror: false });
  });

  it("calls close_app_update via invoke", async () => {
    coreMocks.invoke.mockResolvedValueOnce(undefined);

    await closeAppUpdate(9);

    expect(coreMocks.invoke).toHaveBeenCalledWith("close_app_update", { rid: 9 });
  });

  it("parses structured JSON errors without exposing internals", () => {
    const parsed = parseAppUpdateError(
      new Error(
        JSON.stringify({
          stage: "download",
          source: "mirror",
          kind: "signature",
          message: "更新包签名校验失败，已中止安装",
        }),
      ),
    );
    expect(parsed).toEqual({
      kind: "signature",
      message: "更新包签名校验失败，已中止安装",
    });

    expect(parseAppUpdateError(new Error("普通错误")).message).toBe("普通错误");
  });
});
