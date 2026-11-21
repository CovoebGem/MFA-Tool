import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import AccountDetailModal from "../AccountDetailModal";
import type { OTPAccount } from "../../types";

const baseAccount: OTPAccount = {
  id: "acc-1",
  issuer: "GitHub",
  name: "alice@example.com",
  secret: "JBSWY3DPEHPK3PXP",
  type: "totp",
  counter: 0,
  algorithm: "SHA1",
  digits: 6,
  period: 30,
  createdAt: 1000,
  groupId: "default",
};

describe("AccountDetailModal", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("blocks saving when name is empty", () => {
    const onUpdate = vi.fn();
    const onClose = vi.fn();

    render(
      <AccountDetailModal
        account={baseAccount}
        mode="edit"
        onClose={onClose}
        onUpdate={onUpdate}
      />,
    );

    const nameInput = screen.getByDisplayValue("alice@example.com");
    fireEvent.change(nameInput, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByRole("alert")).toHaveTextContent("账户名称不能为空");
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("blocks saving when secret is invalid base32", () => {
    const onUpdate = vi.fn();
    const onClose = vi.fn();

    render(
      <AccountDetailModal
        account={baseAccount}
        mode="edit"
        onClose={onClose}
        onUpdate={onUpdate}
      />,
    );

    const secretInput = screen.getByDisplayValue("JBSWY3DPEHPK3PXP");
    fireEvent.change(secretInput, { target: { value: "invalid!189" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/base32/i);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("normalizes lowercase and whitespace in base32 secret on save", () => {
    const onUpdate = vi.fn();
    const onClose = vi.fn();

    render(
      <AccountDetailModal
        account={baseAccount}
        mode="edit"
        onClose={onClose}
        onUpdate={onUpdate}
      />,
    );

    const secretInput = screen.getByDisplayValue("JBSWY3DPEHPK3PXP");
    fireEvent.change(secretInput, { target: { value: " jbsw y3dp ehpk 3pxp " } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onUpdate).toHaveBeenCalledWith("acc-1", {
      name: "alice@example.com",
      issuer: "GitHub",
      secret: "JBSWY3DPEHPK3PXP",
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes when pressing Escape", () => {
    const onClose = vi.fn();

    render(
      <AccountDetailModal
        account={baseAccount}
        mode="detail"
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
