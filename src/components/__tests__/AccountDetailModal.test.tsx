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

  it("renders, saves, and clears optional remark field", () => {
    const onUpdate = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <AccountDetailModal
        account={{ ...baseAccount, remark: "公司主号" }}
        mode="detail"
        onClose={onClose}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.getByText("公司主号")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    const remarkInput = screen.getByLabelText(/备注/) as HTMLInputElement;
    expect(remarkInput.value).toBe("公司主号");

    fireEvent.change(remarkInput, { target: { value: "  生产备用  " } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onUpdate).toHaveBeenCalledWith("acc-1", {
      name: "alice@example.com",
      issuer: "GitHub",
      secret: "JBSWY3DPEHPK3PXP",
      remark: "生产备用",
    });

    onUpdate.mockClear();
    rerender(
      <AccountDetailModal
        account={{ ...baseAccount, remark: "生产备用" }}
        mode="edit"
        onClose={onClose}
        onUpdate={onUpdate}
      />,
    );
    fireEvent.change(screen.getByLabelText(/备注/), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onUpdate).toHaveBeenCalledWith("acc-1", {
      name: "alice@example.com",
      issuer: "GitHub",
      secret: "JBSWY3DPEHPK3PXP",
      remark: "",
    });
  });
});
