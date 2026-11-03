import { test } from "node:test";
import assert from "node:assert/strict";
import { createSite, siteSchema } from "../src/model";
import { describeIssue } from "../src/validation";
import { createTranslator } from "../src/translations";

test("Validation identifies LinkedIn and email with actionable DE/EN messages", () => {
  const site = createSite("developer");
  const result = siteSchema.safeParse({
    ...site,
    contact: { ...site.contact, email: "invalid" },
    integrations: {
      ...site.integrations,
      linkedinUrl: "www.linkedin.com/in/perl-m-iris",
    },
  });
  assert.equal(result.success, false);
  if (result.success) return;
  for (const language of ["de", "en"] as const) {
    const errors = result.error.issues.map((issue) =>
      describeIssue(issue, createTranslator(language)),
    );
    const linkedin = errors.find(
      (item) => item.key === "integrations.linkedinUrl",
    )!;
    assert.match(linkedin.label, /LinkedIn/);
    assert.match(linkedin.message, /https:\/\/www.linkedin.com\/in\//);
    const email = errors.find((item) => item.key === "contact.email")!;
    assert.match(email.message, /name@/);
    assert.doesNotMatch(JSON.stringify(errors), /"code"|"custom"|Zod/);
  }
});

test("Validation identifies numbered content and character limits", () => {
  const site = createSite("developer");
  site.services[1].description = "x".repeat(1501);
  site.sections[0].blocks[0].text = "x".repeat(12001);
  const result = siteSchema.safeParse(site);
  assert.equal(result.success, false);
  if (result.success) return;
  const errors = result.error.issues.map((issue) =>
    describeIssue(issue, createTranslator("de")),
  );
  const service = errors.find((item) => item.key === "services.1.description")!;
  assert.equal(service.label, "Leistung 2: Beschreibung");
  assert.match(service.message, /1500 Zeichen/);
  site.grid.columns = 25;
  const grid = siteSchema.safeParse(site);
  if (grid.success) assert.fail("invalid grid accepted");
  const columnError = grid.error.issues.find(
    (issue) => issue.path.join(".") === "grid.columns",
  )!;
  assert.doesNotMatch(
    describeIssue(columnError, createTranslator("de")).message,
    /Zeichen/,
  );
});
