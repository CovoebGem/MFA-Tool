import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useTOTP } from "./useTOTP";
import { generateTOTP } from "../lib/totp-generator";

const runtimeClock = vi.hoisted(() => {
  return {
    currentNow: 0,
    syncRuntimeClock: vi.fn(async () => {}),
  };
});

const windowApi = vi.hoisted(() => {
  return {
    focusChangedHandler: null as ((event: { payload: boolean }) => void) | null,
  };
});

vi.mock("../lib/runtime-clock", () => ({
  getRuntimeNowMs: () => runtimeClock.currentNow,
  syncRuntimeClock: () => runtimeClock.syncRuntimeClock(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: vi.fn(async (handler: (event: { payload: boolean }) => void) => {
      windowApi.focusChangedHandler = handler;
      return () => {
        windowApi.focusChangedHandler = null;
      };
    }),
  }),
}));

const SECRET = "JBSWY3DPEHPK3PXP";
const PERIOD = 30;
const DIGITS = 6;

function TOTPProbe({
  secret = SECRET,
  period = PERIOD,
  digits = DIGITS,
}: {
  secret?: string;
  period?: number;
  digits?: number;
}) {
  const { code, remaining } = useTOTP(secret, period, digits);

  return (
    <>
      <div data-testid="code">{code}</div>
      <div data-testid="remaining">{remaining}</div>
    </>
  );
}

function setVisibilityState(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
}

async function flushRuntimeClockSync() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("useTOTP", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibilityState("visible");
    runtimeClock.currentNow = 0;
    runtimeClock.syncRuntimeClock.mockClear();
    windowApi.focusChangedHandler = null;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    setVisibilityState("visible");
  });

  it("switches code immediately at the next time-window boundary", async () => {
    const start = Date.parse("2025-01-01T00:00:29.900Z");
    runtimeClock.currentNow = start;

    render(<TOTPProbe />);
    await flushRuntimeClockSync();

    expect(screen.getByTestId("code")).toHaveTextContent(
      generateTOTP(SECRET, PERIOD, DIGITS, start),
    );
    expect(screen.getByTestId("remaining")).toHaveTextContent("1");

    await act(async () => {
      runtimeClock.currentNow = start + 100;
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });

    expect(screen.getByTestId("code")).toHaveTextContent(
      generateTOTP(SECRET, PERIOD, DIGITS, start + 100),
    );
    expect(screen.getByTestId("remaining")).toHaveTextContent("30");

    await act(async () => {
      runtimeClock.currentNow = start + 1100;
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(screen.getByTestId("remaining")).toHaveTextContent("29");

    await act(async () => {
      runtimeClock.currentNow = start + 2100;
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(screen.getByTestId("remaining")).toHaveTextContent("28");
  });

  it("resyncs immediately on focus after the clock jumps past a boundary", async () => {
    const start = Date.parse("2025-01-01T00:00:29.900Z");
    const resumed = start + 1300;
    runtimeClock.currentNow = start;

    render(<TOTPProbe />);
    await flushRuntimeClockSync();

    expect(screen.getByTestId("code")).toHaveTextContent(
      generateTOTP(SECRET, PERIOD, DIGITS, start),
    );

    await act(async () => {
      runtimeClock.currentNow = resumed;
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    expect(screen.getByTestId("code")).toHaveTextContent(
      generateTOTP(SECRET, PERIOD, DIGITS, resumed),
    );
    expect(screen.getByTestId("remaining")).toHaveTextContent("29");
  });

  it("resyncs immediately when the document becomes visible again", async () => {
    const start = Date.parse("2025-01-01T00:00:29.900Z");
    const resumed = start + 1300;
    runtimeClock.currentNow = start;

    render(<TOTPProbe />);
    await flushRuntimeClockSync();

    await act(async () => {
      setVisibilityState("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      runtimeClock.currentNow = resumed;
      setVisibilityState("visible");
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(screen.getByTestId("code")).toHaveTextContent(
      generateTOTP(SECRET, PERIOD, DIGITS, resumed),
    );
    expect(screen.getByTestId("remaining")).toHaveTextContent("29");
  });

  it("uses the calibrated runtime clock instead of the browser Date.now", async () => {
    const browserNow = Date.parse("2025-01-01T00:00:10.000Z");
    const hostNow = browserNow + 10_000;

    vi.spyOn(Date, "now").mockReturnValue(browserNow);
    runtimeClock.currentNow = hostNow;

    render(<TOTPProbe />);
    await flushRuntimeClockSync();

    expect(screen.getByTestId("code")).toHaveTextContent(
      generateTOTP(SECRET, PERIOD, DIGITS, hostNow),
    );
    expect(screen.getByTestId("remaining")).toHaveTextContent(
      `${30 - (Math.floor(hostNow / 1000) % 30)}`,
    );
  });

  it("recalibrates when the Tauri window focus changes to focused", async () => {
    const start = Date.parse("2025-01-01T00:00:29.900Z");
    const resumed = start + 1300;
    runtimeClock.currentNow = start;

    render(<TOTPProbe />);
    await flushRuntimeClockSync();

    expect(windowApi.focusChangedHandler).toBeTypeOf("function");

    await act(async () => {
      runtimeClock.currentNow = resumed;
      windowApi.focusChangedHandler?.({ payload: true });
      await Promise.resolve();
    });

    expect(screen.getByTestId("code")).toHaveTextContent(
      generateTOTP(SECRET, PERIOD, DIGITS, resumed),
    );
    expect(runtimeClock.syncRuntimeClock).toHaveBeenCalled();
  });
});
