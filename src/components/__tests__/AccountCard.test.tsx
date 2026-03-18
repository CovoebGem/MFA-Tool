import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AccountCard from "../AccountCard";
import type { OTPAccount } from "../../types";

vi.mock("../../hooks/useTOTP", () => ({
  useTOTP: () => ({ code: "123456", remaining: 25 }),
}));

const account: OTPAccount = {
  id: "acc-1",
  issuer: "GitHub",
  name: "user@example.com",
  secret: "JBSWY3DPEHPK3PXP",
  type: "totp",
  counter: 0,
  algorithm: "SHA1",
  digits: 6,
  period: 30,
  createdAt: 1,
  groupId: "default",
};

describe("AccountCard", () => {
  it("renders the provider icon based on issuer", () => {
    render(<AccountCard account={account} onDelete={vi.fn()} />);

    expect(screen.getByRole("img", { name: "GitHub" })).toHaveAttribute(
      "src",
      "https://github.com/favicon.ico",
    );
  });
});
