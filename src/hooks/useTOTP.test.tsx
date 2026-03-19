import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useTOTP } from "./useTOTP";
import { generateTOTP } from "../lib/totp-generator";

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

describe("useTOTP", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibilityState("visible");
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    setVisibilityState("visible");
  });

  it("switches code immediately at the next time-window boundary", () => {
    const start = Date.parse("2025-01-01T00:00:29.900Z");
    vi.setSystemTime(start);

    render(<TOTPProbe />);

    expect(screen.getByTestId("code")).toHaveTextContent(
      generateTOTP(SECRET, PERIOD, DIGITS, start),
    );
    expect(screen.getByTestId("remaining")).toHaveTextContent("1");

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByTestId("code")).toHaveTextContent(
      generateTOTP(SECRET, PERIOD, DIGITS, start + 100),
    );
    expect(screen.getByTestId("remaining")).toHaveTextContent("30");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("remaining")).toHaveTextContent("29");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("remaining")).toHaveTextContent("28");
  });

  it("resyncs immediately on focus after the clock jumps past a boundary", () => {
    const start = Date.parse("2025-01-01T00:00:29.900Z");
    const resumed = start + 1300;
    vi.setSystemTime(start);

    render(<TOTPProbe />);

    expect(screen.getByTestId("code")).toHaveTextContent(
      generateTOTP(SECRET, PERIOD, DIGITS, start),
    );

    act(() => {
      vi.setSystemTime(resumed);
      window.dispatchEvent(new Event("focus"));
    });

    expect(screen.getByTestId("code")).toHaveTextContent(
      generateTOTP(SECRET, PERIOD, DIGITS, resumed),
    );
    expect(screen.getByTestId("remaining")).toHaveTextContent("29");
  });

  it("resyncs immediately when the document becomes visible again", () => {
    const start = Date.parse("2025-01-01T00:00:29.900Z");
    const resumed = start + 1300;
    vi.setSystemTime(start);

    render(<TOTPProbe />);

    act(() => {
      setVisibilityState("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      vi.setSystemTime(resumed);
      setVisibilityState("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByTestId("code")).toHaveTextContent(
      generateTOTP(SECRET, PERIOD, DIGITS, resumed),
    );
    expect(screen.getByTestId("remaining")).toHaveTextContent("29");
  });
});
