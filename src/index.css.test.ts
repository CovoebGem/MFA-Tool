/// <reference types="node" />

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("index.css", () => {
  it("defines the Tailwind 4 class-based dark variant used by the theme toggle", () => {
    const css = readFileSync(`${process.cwd()}/src/index.css`, "utf8");

    expect(css).toContain('@custom-variant dark (&:where(.dark, .dark *));');
  });
});
