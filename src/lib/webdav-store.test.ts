import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_WEBDAV_CONFIG,
  buildWebDavFileUrl,
  clearWebDavConfig,
  isValidWebDavConfig,
  loadWebDavConfig,
  normalizeWebDavPath,
  saveWebDavConfig,
} from "./webdav-store";

describe("webdav-store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("localStorage 为空时返回默认配置", () => {
    expect(loadWebDavConfig()).toEqual(DEFAULT_WEBDAV_CONFIG);
  });

  it("保存后可以读回合法配置", () => {
    const config = {
      baseUrl: "https://dav.example.com/remote.php/dav/files/demo/",
      path: "/MFA-Tool/",
      username: "demo",
    };

    saveWebDavConfig(config);

    expect(loadWebDavConfig()).toEqual({
      baseUrl: "https://dav.example.com/remote.php/dav/files/demo",
      path: "/MFA-Tool/",
      username: "demo",
    });
  });

  it("兼容旧版 fileUrl 配置并迁移成地址和路径", () => {
    window.localStorage.setItem("mfa-tool:webdav-config", JSON.stringify({
      fileUrl: "https://dav.example.com/remote.php/dav/files/demo/MFA-Tool/sync.json",
      username: "alice",
    }));

    expect(loadWebDavConfig()).toEqual({
      baseUrl: "https://dav.example.com",
      path: "/remote.php/dav/files/demo/MFA-Tool/",
      username: "alice",
    });
  });

  it("遇到非法值时回退到默认配置", () => {
    window.localStorage.setItem("mfa-tool:webdav-config", JSON.stringify({
      baseUrl: 1,
      path: [],
      username: {},
    }));

    expect(loadWebDavConfig()).toEqual(DEFAULT_WEBDAV_CONFIG);
    expect(isValidWebDavConfig({
      baseUrl: "https://dav.example.com",
      path: "/sync/",
      username: "alice",
    })).toBe(true);
  });

  it("会把地址和路径拼成最终 sync.json URL", () => {
    expect(buildWebDavFileUrl({
      baseUrl: "https://dav.example.com/remote.php/dav/files/demo",
      path: "/MFA-Tool/",
      username: "demo",
    })).toBe("https://dav.example.com/remote.php/dav/files/demo/MFA-Tool/sync.json");

    expect(buildWebDavFileUrl({
      baseUrl: "https://dav.example.com",
      path: "/remote.php/dav/files/demo/custom.json",
      username: "demo",
    })).toBe("https://dav.example.com/remote.php/dav/files/demo/custom.json");
  });

  it("clearWebDavConfig 会清空已保存配置", () => {
    saveWebDavConfig({
      baseUrl: "https://dav.example.com",
      path: "/MFA-Tool/",
      username: "alice",
    });

    clearWebDavConfig();

    expect(loadWebDavConfig()).toEqual(DEFAULT_WEBDAV_CONFIG);
  });

  it("normalizeWebDavPath 会补全前导斜杠和默认目录", () => {
    expect(normalizeWebDavPath("sync")).toBe("/sync");
    expect(normalizeWebDavPath("")).toBe("/MFA-Tool/");
  });
});
