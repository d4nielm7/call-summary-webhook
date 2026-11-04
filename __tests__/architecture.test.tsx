import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Page, { metadata } from "@/app/architecture/page";
import { CONTROLS, SECTIONS } from "@/app/architecture/content";

function testSources(dir = join(process.cwd(), "__tests__")): string {
  return readdirSync(dir)
    .map((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? testSources(path) : readFileSync(path, "utf8");
    })
    .join("\n");
}

describe("architecture page", () => {
  const html = renderToStaticMarkup(<Page />);

  it("has a section for every entry in its navigation", () => {
    for (const { id } of SECTIONS) expect(html).toContain(`id="${id}"`);
  });

  it("draws the diagrams as labelled images", () => {
    expect(html.match(/<svg[^>]*role="img"/g)?.length).toBe(4);
  });

  it("links back to the dashboard", () => {
    expect(html).toContain('href="/"');
  });

  it("is kept out of search results", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("ships no inline script or event handler that the page's CSP would block", () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
  });

  it("no longer describes the old Hono server", () => {
    expect(html).not.toMatch(/hono|assets\.ts|npm run simulate|dashboard\.js|allow-listed files/i);
  });

  it("points at the real webhook path", () => {
    expect(html).toContain("POST /api/webhooks/call-summary");
  });

  it("only cites tests that exist", () => {
    const sources = testSources();
    for (const control of CONTROLS) {
      for (const name of control.proof.split(" · ")) {
        expect(sources, `${control.title}: ${name}`).toContain(name);
      }
    }
  });
});
