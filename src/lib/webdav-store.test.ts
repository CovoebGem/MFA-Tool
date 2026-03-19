import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_WEBDAV_CONFIG,
  clearWebDavConfig,
  isValidWebDavConfig,
  loadWebDavConfig,
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
      fileUrl: "https://dav.example.com/remote.php/dav/files/demo/MFA-Tool/sync.json",
      username: "demo",
    };

    saveWebDavConfig(config);

    expect(loadWebDavConfig()).toEqual(config);
  });

  it("遇到非法值时回退到默认配置", () => {
    window.localStorage.setItem("mfa-tool:webdav-config", JSON.stringify({
      fileUrl: 1,
      username: [],
    }));

    expect(loadWebDavConfig()).toEqual(DEFAULT_WEBDAV_CONFIG);
    expect(isValidWebDavConfig({
      fileUrl: "https://dav.example.com/sync.json",
      username: "alice",
    })).toBe(true);
  });

  it("clearWebDavConfig 会清空已保存配置", () => {
    saveWebDavConfig({
      fileUrl: "https://dav.example.com/sync.json",
      username: "alice",
    });

    clearWebDavConfig();

    expect(loadWebDavConfig()).toEqual(DEFAULT_WEBDAV_CONFIG);
  });
});
