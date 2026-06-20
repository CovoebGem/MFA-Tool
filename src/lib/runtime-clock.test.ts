import { afterEach, describe, expect, it, vi } from "vitest";

describe("runtime-clock", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unmock("@tauri-apps/api/core");
  });

  it("falls back to Date.now outside Tauri", async () => {
    const invoke = vi.fn();

    vi.doMock("@tauri-apps/api/core", () => ({
      invoke,
      isTauri: () => false,
    }));

    vi.spyOn(Date, "now").mockReturnValue(12_345);

    const { getRuntimeNowMs, syncRuntimeClock } = await import("./runtime-clock");

    expect(getRuntimeNowMs()).toBe(12_345);
    await syncRuntimeClock();
    expect(getRuntimeNowMs()).toBe(12_345);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("uses the host timestamp returned by Tauri instead of the browser clock", async () => {
    const invoke = vi.fn().mockResolvedValue(20_000);
    const perfSpy = vi.spyOn(performance, "now");
    perfSpy.mockReturnValue(100);
    vi.spyOn(Date, "now").mockReturnValue(10_000);

    vi.doMock("@tauri-apps/api/core", () => ({
      invoke,
      isTauri: () => true,
    }));

    const { getRuntimeNowMs, syncRuntimeClock } = await import("./runtime-clock");

    expect(getRuntimeNowMs()).toBe(10_000);

    await syncRuntimeClock();

    expect(getRuntimeNowMs()).toBe(20_000);
    expect(invoke).toHaveBeenCalledWith("read_current_timestamp_ms");
  });

  it("keeps moving forward with performance.now after calibration", async () => {
    const invoke = vi.fn().mockResolvedValue(20_000);
    const perfSpy = vi.spyOn(performance, "now");
    perfSpy
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(120)
      .mockReturnValueOnce(170);

    vi.doMock("@tauri-apps/api/core", () => ({
      invoke,
      isTauri: () => true,
    }));

    const { getRuntimeNowMs, syncRuntimeClock } = await import("./runtime-clock");

    await syncRuntimeClock();

    expect(getRuntimeNowMs()).toBe(20_060);
  });
});
