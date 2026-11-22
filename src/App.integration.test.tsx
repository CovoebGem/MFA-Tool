import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
import { I18nProvider } from "./contexts/I18nContext";
import App from "./App";
import type { Group, OTPAccount } from "./types";

const mocks = vi.hoisted(() => ({
  accountsJson: "[]",
  groupsJson: "[]",
  writeOrder: [] as string[],
  accountsWrites: [] as string[],
  groupsWrites: [] as string[],
  webdavWrites: [] as string[],
  remoteWebDavJson: null as string | null,
  failNextWriteGroups: false,
  readAccountsErrorQueue: [] as Array<string | null>,
  readAccountsReturnQueue: [] as string[],
  readGroupsErrorQueue: [] as Array<string | null>,
  writeAccountsErrorQueue: [] as Array<string | null>,
  pendingWriteAccountsPromise: null as null | (() => Promise<void>),
  pendingWriteGroupsPromise: null as null | (() => Promise<void>),
  decodeQRFromFile: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: vi.fn(async (cmd: string, args?: { data?: string }) => {
    switch (cmd) {
      case "read_accounts": {
        const queuedError = mocks.readAccountsErrorQueue.shift();
        if (queuedError) {
          throw new Error(queuedError);
        }
        if (mocks.readAccountsReturnQueue.length > 0) {
          return mocks.readAccountsReturnQueue.shift()!;
        }
        return mocks.accountsJson;
      }
      case "write_accounts": {
        mocks.writeOrder.push("write_accounts");
        const queuedError = mocks.writeAccountsErrorQueue.shift();
        if (queuedError) {
          throw new Error(queuedError);
        }
        const payload = args?.data ?? "[]";
        mocks.accountsWrites.push(payload);
        if (mocks.pendingWriteAccountsPromise) {
          const fn = mocks.pendingWriteAccountsPromise;
          mocks.pendingWriteAccountsPromise = null;
          await fn();
        }
        mocks.accountsJson = payload;
        return undefined;
      }
      case "read_groups": {
        const queuedError = mocks.readGroupsErrorQueue.shift();
        if (queuedError) {
          throw new Error(queuedError);
        }
        return mocks.groupsJson;
      }
      case "write_groups": {
        mocks.writeOrder.push("write_groups");
        if (mocks.pendingWriteGroupsPromise) {
          const fn = mocks.pendingWriteGroupsPromise;
          mocks.pendingWriteGroupsPromise = null;
          await fn();
        }
        if (mocks.failNextWriteGroups) {
          mocks.failNextWriteGroups = false;
          throw new Error("groups write failed");
        }
        const payload = args?.data ?? "[]";
        mocks.groupsWrites.push(payload);
        mocks.groupsJson = payload;
        return undefined;
      }
      case "has_webdav_password":
        return true;
      case "read_webdav_sync":
        return mocks.remoteWebDavJson;
      case "write_webdav_sync":
        mocks.webdavWrites.push(args?.data ?? "");
        mocks.remoteWebDavJson = args?.data ?? null;
        return undefined;
      case "read_current_timestamp_ms":
        return Date.now();
      default:
        return null;
    }
  }),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: vi.fn().mockResolvedValue(() => {}),
  }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
  open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeFile: vi.fn(),
  writeTextFile: vi.fn(),
  readTextFile: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

vi.mock("./lib/updater-client", () => ({
  checkAppUpdate: vi.fn().mockResolvedValue({
    available: false,
    source: "mirror",
    fallbackFromMirror: false,
    update: null,
  }),
  installAppUpdate: vi.fn(),
  closeAppUpdate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./lib/qr-decoder", () => ({
  decodeQRFromFile: mocks.decodeQRFromFile,
  decodeQRFromClipboard: vi.fn(),
}));

function createStorageMock() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
}

function makeAccount(overrides: Partial<OTPAccount> = {}): OTPAccount {
  return {
    id: "acc-1",
    issuer: "GitHub",
    name: "alice@example.com",
    secret: "JBSWY3DPEHPK3PXP",
    type: "totp",
    counter: 0,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    createdAt: 100,
    updatedAt: 100,
    groupId: "default",
    order: 0,
    ...overrides,
  };
}

function renderApp() {
  return render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  );
}

describe("App end-to-end persistence safeguards", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    Object.defineProperty(window, "localStorage", {
      value: createStorageMock(),
      configurable: true,
    });
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockReturnValue({
        matches: false,
        media: "(prefers-color-scheme: dark)",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
      configurable: true,
    });
    mocks.writeOrder = [];
    mocks.accountsWrites = [];
    mocks.groupsWrites = [];
    mocks.webdavWrites = [];
    mocks.remoteWebDavJson = null;
    mocks.failNextWriteGroups = false;
    mocks.readAccountsErrorQueue = [];
    mocks.readAccountsReturnQueue = [];
    mocks.readGroupsErrorQueue = [];
    mocks.writeAccountsErrorQueue = [];
    mocks.pendingWriteAccountsPromise = null;
    mocks.pendingWriteGroupsPromise = null;
  });

  it("删除分组时若 write_groups 失败且回滚 write_accounts 也失败，不发生队列死锁并重新从磁盘对齐状态", async () => {
    const groups: Group[] = [
      { id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 },
      { id: "work", name: "Work", isDefault: false, createdAt: 10, updatedAt: 10 },
    ];
    const accounts: OTPAccount[] = [makeAccount({ id: "acc-work", groupId: "work" })];

    mocks.groupsJson = JSON.stringify(groups);
    mocks.accountsJson = JSON.stringify(accounts);
    mocks.failNextWriteGroups = true;
    // 第 1 次 write_accounts（迁出到 default）成功，第 2 次回滚 write_accounts 失败
    mocks.writeAccountsErrorQueue = [null, "rollback accounts failed"];

    renderApp();

    const groupsNav = await screen.findByRole("button", { name: "分组" });
    fireEvent.click(groupsNav);

    const openManagerBtn = await screen.findByRole("button", { name: "打开分组管理" });
    fireEvent.click(openManagerBtn);

    fireEvent.click(screen.getByRole("button", { name: "删除分组 Work" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除分组 Work" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "保存分组失败且回滚账户失败，已尝试从磁盘重新加载最新状态",
      );
    });

    // 验证重读对齐后磁盘与 React UI 状态一致（acc-work 已在 default 下，Work 仍在）
    const reloadedDiskAccounts = JSON.parse(mocks.accountsJson) as OTPAccount[];
    expect(reloadedDiskAccounts[0].groupId).toBe("default");
    expect(screen.getByRole("option", { name: "默认 (1)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Work (0)" })).toBeInTheDocument();

    // 验证后续通过同一串行队列发起的新增分组仍可执行（队列未因内部调用 refreshAccounts 而死锁）
    fireEvent.click(screen.getByRole("button", { name: "新建分组" }));
    fireEvent.change(screen.getByPlaceholderText("分组名称"), {
      target: { value: "Personal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => {
      const savedGroups = JSON.parse(mocks.groupsJson) as Group[];
      expect(savedGroups.some((g) => g.name === "Personal")).toBe(true);
    });
  });

  it("回滚双失败且 read_groups 重读也失败时，应关闭分组写入门禁防止后续覆盖原库", async () => {
    const groups: Group[] = [
      { id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 },
      { id: "work", name: "Work", isDefault: false, createdAt: 10, updatedAt: 10 },
    ];
    const accounts: OTPAccount[] = [makeAccount({ id: "acc-work", groupId: "work" })];

    mocks.groupsJson = JSON.stringify(groups);
    mocks.accountsJson = JSON.stringify(accounts);
    mocks.failNextWriteGroups = true;
    mocks.writeAccountsErrorQueue = [null, "rollback accounts failed"];
    mocks.readGroupsErrorQueue = [null, "disk read groups failed"];

    renderApp();

    const groupsNav = await screen.findByRole("button", { name: "分组" });
    fireEvent.click(groupsNav);

    const openManagerBtn = await screen.findByRole("button", { name: "打开分组管理" });
    fireEvent.click(openManagerBtn);

    fireEvent.click(screen.getByRole("button", { name: "删除分组 Work" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除分组 Work" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "保存分组失败且回滚账户失败，已尝试从磁盘重新加载最新状态",
      );
    });

    // 重读失败后，groups 写入门禁已关闭；尝试新建分组会被阻止并提示错误，绝不覆盖原 groups.json
    fireEvent.click(screen.getByRole("button", { name: "新建分组" }));
    fireEvent.change(screen.getByPlaceholderText("分组名称"), {
      target: { value: "Personal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => {
      expect(
        screen
          .getAllByRole("alert")
          .some((el) => el.textContent?.includes("分组尚未加载成功")),
      ).toBe(true);
    });
    expect(mocks.groupsWrites).toHaveLength(0);
    const finalDiskGroups = JSON.parse(mocks.groupsJson) as Group[];
    expect(finalDiskGroups.map((g) => g.id)).toEqual(["default", "work"]);
  });

  it("删除分组采用先写账户后写分组，write_groups 失败时回滚账户并提示错误", async () => {
    const groups: Group[] = [
      { id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 },
      { id: "work", name: "Work", isDefault: false, createdAt: 10, updatedAt: 10 },
    ];
    const accounts: OTPAccount[] = [makeAccount({ id: "acc-work", groupId: "work" })];

    mocks.groupsJson = JSON.stringify(groups);
    mocks.accountsJson = JSON.stringify(accounts);
    mocks.failNextWriteGroups = true;

    renderApp();

    const groupsNav = await screen.findByRole("button", { name: "分组" });
    fireEvent.click(groupsNav);

    const openManagerBtn = await screen.findByRole("button", { name: "打开分组管理" });
    fireEvent.click(openManagerBtn);

    fireEvent.click(screen.getByRole("button", { name: "删除分组 Work" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除分组 Work" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("groups write failed");
    });

    // 写入顺序：先 write_accounts(迁移到 default) -> write_groups(失败) -> write_accounts(回滚回 work)
    expect(mocks.writeOrder).toEqual(["write_accounts", "write_groups", "write_accounts"]);
    const firstWriteAccounts = JSON.parse(mocks.accountsWrites[0]) as OTPAccount[];
    expect(firstWriteAccounts[0].groupId).toBe("default");

    const finalPersistedAccounts = JSON.parse(mocks.accountsJson) as OTPAccount[];
    expect(finalPersistedAccounts[0].groupId).toBe("work");

    const finalPersistedGroups = JSON.parse(mocks.groupsJson) as Group[];
    expect(finalPersistedGroups.map((g) => g.id)).toEqual(["default", "work"]);
  });

  it("DedupDialog 连点只触发一次提交，失败时保留弹窗且展示错误，重试成功后正常关闭", async () => {
    const existing = makeAccount({
      id: "acc-existing",
      issuer: "GitHub",
      name: "alice@example.com",
      secret: "JBSWY3DPEHPK3PXP",
      groupId: "default",
    });
    const groups: Group[] = [
      { id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 },
    ];

    mocks.groupsJson = JSON.stringify(groups);
    mocks.accountsJson = JSON.stringify([existing]);

    // 传入一条重复账户 + 一条新 Google 账户
    mocks.decodeQRFromFile.mockResolvedValueOnce(
      "otpauth://totp/GitHub:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub",
    );
    mocks.decodeQRFromFile.mockResolvedValueOnce(
      "otpauth://totp/Google:bob@example.com?secret=KRSXG5CTMVRXEZLU&issuer=Google",
    );

    const { container } = renderApp();

    // 等待初始加载完成
    await screen.findByRole("button", { name: "添加账户" });

    const fileInput = container.querySelector(
      'input[type="file"][accept*="image/png"]',
    ) as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    const file1 = new File(["png1"], "dup.png", { type: "image/png" });
    const file2 = new File(["png2"], "uniq.png", { type: "image/png" });

    // 先上传第一个带重复项的文件触发 DedupDialog（一次提交两个文件）
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file1, file2] } });
      await Promise.resolve();
    });

    const skipBtn = await screen.findByRole("button", { name: "跳过重复项" });

    let rejectFirstSave!: (err: Error) => void;
    mocks.pendingWriteAccountsPromise = () =>
      new Promise<void>((_resolve, reject) => {
        rejectFirstSave = reject;
      });

    // 快速连点两次“跳过重复项”
    fireEvent.click(skipBtn);
    fireEvent.click(skipBtn);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "处理中..." }).length).toBeGreaterThanOrEqual(1);
    });
    expect(mocks.accountsWrites).toHaveLength(1);

    // 第一次保存失败：弹窗保持打开、可重试，accounts.json 仍只含旧账户且未发生脏追加
    await act(async () => {
      rejectFirstSave(new Error("disk busy"));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("disk busy")).toBeInTheDocument();
    });
    expect(JSON.parse(mocks.accountsJson)).toHaveLength(1);

    // 重试点击“跳过重复项”成功后正常关闭弹窗并仅写入 1 条新账户
    fireEvent.click(screen.getByRole("button", { name: "跳过重复项" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "跳过重复项" })).not.toBeInTheDocument();
    });

    const saved = JSON.parse(mocks.accountsJson) as OTPAccount[];
    expect(saved.map((a) => a.name)).toEqual(["alice@example.com", "bob@example.com"]);
  });

  it("read_accounts 失败时进入云同步页执行上传本地数据或空远端立即同步均被阻止，绝不上传空快照", async () => {
    mocks.groupsJson = JSON.stringify([
      { id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 },
    ]);
    mocks.readAccountsErrorQueue = ["accounts file corrupted"];
    mocks.remoteWebDavJson = null;

    window.localStorage.setItem(
      "mfa-tool:webdav-config",
      JSON.stringify({
        baseUrl: "https://dav.example.com/remote.php/dav/files/alice",
        path: "/MFA-Tool/",
        username: "alice",
      }),
    );

    renderApp();

    const syncNav = await screen.findByRole("button", { name: "云同步" });
    fireEvent.click(syncNav);

    const pushBtn = await screen.findByRole("button", { name: "上传本地数据" });
    fireEvent.click(pushBtn);

    await waitFor(() => {
      expect(
        screen
          .getAllByRole("alert")
          .some((el) => el.textContent?.includes("账户或分组尚未加载成功")),
      ).toBe(true);
    });
    expect(mocks.webdavWrites).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "立即同步" }));

    await waitFor(() => {
      expect(
        screen
          .getAllByRole("alert")
          .some((el) => el.textContent?.includes("账户或分组尚未加载成功")),
      ).toBe(true);
    });
    expect(mocks.webdavWrites).toHaveLength(0);
  });

  it("删除分组进行期间并发批量移动账户到待删分组，最终不产生指向已删分组的孤立账户", async () => {
    const groups: Group[] = [
      { id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 },
      { id: "work", name: "Work", isDefault: false, createdAt: 10, updatedAt: 10 },
    ];
    const accounts: OTPAccount[] = [
      makeAccount({ id: "acc-1", issuer: "GitHub", name: "a1@example.com", groupId: "default" }),
      makeAccount({ id: "acc-work", issuer: "Google", name: "w1@example.com", secret: "KRSXG5CTMVRXEZLU", groupId: "work", order: 1 }),
    ];

    mocks.groupsJson = JSON.stringify(groups);
    mocks.accountsJson = JSON.stringify(accounts);

    renderApp();

    const groupsNav = await screen.findByRole("button", { name: "分组" });
    fireEvent.click(groupsNav);

    const openManagerBtn = await screen.findByRole("button", { name: "打开分组管理" });
    fireEvent.click(openManagerBtn);
    fireEvent.click(screen.getByRole("button", { name: "删除分组 Work" }));

    let resolveDeleteWriteGroups!: () => void;
    mocks.pendingWriteGroupsPromise = () =>
      new Promise<void>((resolve) => {
        resolveDeleteWriteGroups = resolve;
      });

    // 确认删除 Work：队列内完成 write_accounts 迁移后停在 pending write_groups
    fireEvent.click(screen.getByRole("button", { name: "确认删除分组 Work" }));

    await waitFor(() => {
      expect(mocks.writeOrder).toContain("write_groups");
    });

    // 在删除提交尚未完成期间，切到账户页把 acc-1 批量移动到正在删除的 Work 分组
    fireEvent.click(screen.getByRole("button", { name: "账户" }));
    const checkbox = await screen.findByRole("checkbox", { name: "选择账户 GitHub" });
    fireEvent.click(checkbox);

    fireEvent.click(screen.getByRole("button", { name: "移动到分组" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Work" }));

    // 放行删除的 write_groups 写入，让排队的批量移动紧接着在队内执行
    await act(async () => {
      resolveDeleteWriteGroups();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        screen
          .getAllByRole("alert")
          .some((el) => el.textContent?.includes("目标分组已不存在，无法移动账户")),
      ).toBe(true);
    });

    const finalGroups = JSON.parse(mocks.groupsJson) as Group[];
    expect(finalGroups.map((g) => g.id)).toEqual(["default"]);

    const finalAccounts = JSON.parse(mocks.accountsJson) as OTPAccount[];
    expect(finalAccounts).toHaveLength(2);
    expect(finalAccounts.every((a) => a.groupId === "default")).toBe(true);
    // 批量移动失败后原有勾选仍应保留，不应被 accounts 变化 effect 无条件清空
    expect(screen.getByRole("checkbox", { name: "选择账户 GitHub" })).toBeChecked();
  });

  it("回滚双失败时若重读账户返回 {} 且分组重读同时拒绝，两库门禁均关闭且绝不触发后续覆盖写入", async () => {
    const groups: Group[] = [
      { id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 },
      { id: "work", name: "Work", isDefault: false, createdAt: 10, updatedAt: 10 },
    ];
    const accounts: OTPAccount[] = [makeAccount({ id: "acc-work", groupId: "work" })];

    mocks.groupsJson = JSON.stringify(groups);
    mocks.accountsJson = JSON.stringify(accounts);

    renderApp();

    const groupsNav = await screen.findByRole("button", { name: "分组" });
    fireEvent.click(groupsNav);

    const openManagerBtn = await screen.findByRole("button", { name: "打开分组管理" });
    fireEvent.click(openManagerBtn);
    fireEvent.click(screen.getByRole("button", { name: "删除分组 Work" }));

    mocks.failNextWriteGroups = true;
    mocks.writeAccountsErrorQueue = [null, "rollback accounts failed"];
    mocks.readAccountsReturnQueue.push("{}");
    mocks.readGroupsErrorQueue.push("groups read failed");

    fireEvent.click(screen.getByRole("button", { name: "确认删除分组 Work" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "保存分组失败且回滚账户失败，已尝试从磁盘重新加载最新状态",
      );
    });

    // 即使账户返回 {}（非数组），分组写入门禁也必须关闭，后续尝试新建分组必须被拒绝
    fireEvent.click(screen.getByRole("button", { name: "新建分组" }));
    fireEvent.change(screen.getByPlaceholderText("分组名称"), {
      target: { value: "Personal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => {
      expect(
        screen
          .getAllByRole("alert")
          .some((el) => el.textContent?.includes("分组尚未加载成功")),
      ).toBe(true);
    });
    expect(mocks.groupsWrites).toHaveLength(0);
    expect((JSON.parse(mocks.groupsJson) as Group[]).map((g) => g.id)).toEqual(["default", "work"]);
  });

  it("初始加载空库成功后从账户页手动刷新失败，应关闭上传门禁直到下一次刷新成功", async () => {
    mocks.groupsJson = JSON.stringify([
      { id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 },
    ]);
    mocks.accountsJson = "[]";
    mocks.remoteWebDavJson = null;

    window.localStorage.setItem(
      "mfa-tool:webdav-config",
      JSON.stringify({
        baseUrl: "https://dav.example.com/remote.php/dav/files/alice",
        path: "/MFA-Tool/",
        username: "alice",
      }),
    );

    renderApp();

    const accountsNav = await screen.findByRole("button", { name: "账户" });
    fireEvent.click(accountsNav);

    const refreshBtn = await screen.findByRole("button", { name: "刷新" });
    mocks.readAccountsErrorQueue.push("refresh read failed");
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(
        screen
          .getAllByRole("alert")
          .some((el) => el.textContent?.includes("refresh read failed")),
      ).toBe(true);
    });

    // 切回云同步页，无论“上传本地数据”还是空远端“立即同步”都应被门禁阻止
    fireEvent.click(screen.getByRole("button", { name: "云同步" }));
    fireEvent.click(await screen.findByRole("button", { name: "上传本地数据" }));

    await waitFor(() => {
      expect(
        screen
          .getAllByRole("alert")
          .some((el) => el.textContent?.includes("账户或分组尚未加载成功")),
      ).toBe(true);
    });
    expect(mocks.webdavWrites).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "立即同步" }));
    await waitFor(() => {
      expect(mocks.webdavWrites).toHaveLength(0);
    });

    // 回到账户页成功刷新后，门禁重新开放，可以正常上传最新账户快照
    fireEvent.click(screen.getByRole("button", { name: "账户" }));
    mocks.accountsJson = JSON.stringify([
      makeAccount({ id: "recovered", issuer: "GitHub", name: "recovered@example.com" }),
    ]);
    fireEvent.click(await screen.findByRole("button", { name: "刷新" }));
    await screen.findByText("recovered@example.com");

    fireEvent.click(screen.getByRole("button", { name: "云同步" }));
    fireEvent.click(await screen.findByRole("button", { name: "上传本地数据" }));

    await waitFor(() => {
      expect(mocks.webdavWrites).toHaveLength(1);
    });
    const uploaded = JSON.parse(mocks.webdavWrites[0]) as { accounts: OTPAccount[] };
    expect(uploaded.accounts.map((a) => a.id)).toEqual(["recovered"]);
  });

  it("刷新导致已勾选账户 A 消失后再次返回时，A 保持未选中且仅 B 保留勾选，失败保留 B、成功仅移动 B", async () => {
    const groups: Group[] = [
      { id: "default", name: "默认", isDefault: true, createdAt: 0, updatedAt: 0 },
      { id: "work", name: "Work", isDefault: false, createdAt: 10, updatedAt: 10 },
    ];
    const accA = makeAccount({
      id: "acc-a",
      issuer: "GitHub",
      name: "a@example.com",
      secret: "JBSWY3DPEHPK3PXP",
      groupId: "default",
      order: 0,
    });
    const accB = makeAccount({
      id: "acc-b",
      issuer: "Google",
      name: "b@example.com",
      secret: "KRSXG5CTMVRXEZLU",
      groupId: "default",
      order: 1,
    });

    mocks.groupsJson = JSON.stringify(groups);
    mocks.accountsJson = JSON.stringify([accA, accB]);

    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "账户" }));
    const checkboxA = await screen.findByRole("checkbox", { name: "选择账户 GitHub" });
    const checkboxB = await screen.findByRole("checkbox", { name: "选择账户 Google" });
    fireEvent.click(checkboxA);
    fireEvent.click(checkboxB);
    expect(screen.getByText("已选 2")).toBeInTheDocument();

    // 第一次刷新：A 消失，只剩 B -> 自动裁剪剩 1 项且仅 B 勾选
    mocks.accountsJson = JSON.stringify([accB]);
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    await waitFor(() => {
      expect(screen.queryByRole("checkbox", { name: "选择账户 GitHub" })).not.toBeInTheDocument();
      expect(screen.getByText("已选 1")).toBeInTheDocument();
    });
    expect(screen.getByRole("checkbox", { name: "选择账户 Google" })).toBeChecked();

    // 第二次刷新：同一 ID 的 A 重新返回 -> A 必须保持未选中，仍只选中 B
    mocks.accountsJson = JSON.stringify([accA, accB]);
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    const returnedA = await screen.findByRole("checkbox", { name: "选择账户 GitHub" });
    expect(returnedA).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "选择账户 Google" })).toBeChecked();
    expect(screen.getByText("已选 1")).toBeInTheDocument();

    // 注入一次 write_accounts 失败后发起批量移动 -> B 保持勾选，A 保持未选中
    mocks.writeAccountsErrorQueue = ["move write failed"];
    fireEvent.click(screen.getByRole("button", { name: "移动到分组" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Work" }));

    await waitFor(() => {
      expect(
        screen.getAllByRole("alert").some((el) => el.textContent?.includes("move write failed")),
      ).toBe(true);
    });
    expect(screen.getByRole("checkbox", { name: "选择账户 Google" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "选择账户 GitHub" })).not.toBeChecked();

    // 再次点击批量移动成功 -> 仅 B 被移动到 work，A 仍留在 default
    fireEvent.click(screen.getByRole("button", { name: "移动到分组" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Work" }));

    await waitFor(() => {
      const saved = JSON.parse(mocks.accountsJson) as OTPAccount[];
      expect(saved.find((a) => a.id === "acc-b")?.groupId).toBe("work");
    });
    const finalAccounts = JSON.parse(mocks.accountsJson) as OTPAccount[];
    expect(finalAccounts.find((a) => a.id === "acc-a")?.groupId).toBe("default");
    expect(finalAccounts.find((a) => a.id === "acc-b")?.groupId).toBe("work");
  });
});
