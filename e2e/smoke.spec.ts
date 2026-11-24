import { expect, test } from "@playwright/test";
import type { Page, Response } from "@playwright/test";

test("React loads resources through the real API and isolated MongoDB", async ({ page }: { page: Page }): Promise<void> => {
  const resourcesResponsePromise: Promise<Response> = page.waitForResponse(
    (response: Response): boolean =>
      response.url() === "http://127.0.0.1:5173/api/v1/resources" &&
      response.request().method() === "GET",
  );

  await page.goto("/");
  const resourcesResponse: Response = await resourcesResponsePromise;
  const resources: unknown = await resourcesResponse.json();

  expect(resourcesResponse.status()).toBe(200);
  expect(resources).toHaveLength(6);
  expect(resources).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "Study Room 302", type: "ROOM", isAvailable: true }),
    expect.objectContaining({ name: "3D Printer A", type: "EQUIPMENT", isAvailable: true }),
  ]));
  await expect(page.getByRole("heading", { name: "CampusHub", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Study Room 302", exact: true })).toBeVisible();
});
