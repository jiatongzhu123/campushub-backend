import { expect, test } from "@playwright/test";
import type { APIRequestContext, APIResponse, Page, Response, TestInfo } from "@playwright/test";
import type { ReservationResponse, Resource } from "../shared/types/api";

interface ResourceNames {
  room: string;
  printer: string;
}

interface BookingWindow {
  startValue: string;
  endValue: string;
  startTime: string;
  endTime: string;
}

interface BrowserFixtures {
  page: Page;
  request: APIRequestContext;
}

const namesByProject: Record<string, ResourceNames> = {
  chromium: { room: "Study Room 302", printer: "3D Printer A" },
  firefox: { room: "Study Room 303", printer: "3D Printer B" },
  webkit: { room: "Study Room 304", printer: "3D Printer C" },
};

test.beforeEach(async ({ request }: { request: APIRequestContext }): Promise<void> => {
  const response: APIResponse = await request.delete("http://127.0.0.1:3000/__e2e/reservations");
  expect(response.status()).toBe(204);
});

function namesForProject(testInfo: TestInfo): ResourceNames {
  const names: ResourceNames | undefined = namesByProject[testInfo.project.name];
  if (names === undefined) {
    throw new Error(`No E2E resource fixtures for ${testInfo.project.name}.`);
  }
  return names;
}

async function resourceByName(request: APIRequestContext, name: string): Promise<Resource> {
  const response: APIResponse = await request.get("/api/v1/resources");
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  expect(Array.isArray(body)).toBe(true);
  const resource: Resource | undefined = (body as Resource[]).find(
    (item: Resource): boolean => item.name === name,
  );
  expect(resource).toBeDefined();
  if (resource === undefined) {
    throw new Error(`E2E resource fixture ${name} was not seeded.`);
  }
  expect(resource.isAvailable).toBe(true);
  return resource;
}

async function tomorrowWindow(page: Page, hour: number): Promise<BookingWindow> {
  return page.evaluate((targetHour: number): BookingWindow => {
    const start: Date = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(targetHour, 0, 0, 0);
    const end: Date = new Date(start);
    end.setHours(targetHour + 1, 0, 0, 0);
    const localDate: string = [
      start.getFullYear(),
      String(start.getMonth() + 1).padStart(2, "0"),
      String(start.getDate()).padStart(2, "0"),
    ].join("-");
    return {
      startValue: `${localDate}T${String(targetHour).padStart(2, "0")}:00`,
      endValue: `${localDate}T${String(targetHour + 1).padStart(2, "0")}:00`,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    };
  }, hour);
}

async function selectResource(page: Page, name: string): Promise<void> {
  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", { name, exact: true }),
  });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Select resource" }).click();
  await expect(card.getByRole("button", { name: "Selected" })).toBeVisible();
}

async function enterUser(page: Page, userId: string): Promise<void> {
  await page.getByLabel("User ID", { exact: true }).fill(userId);
  await page.getByRole("button", { name: "Use this ID" }).click();
  await expect(page.getByText(`Viewing bookings for ${userId}`)).toBeVisible();
}

async function enterWindow(page: Page, window: BookingWindow): Promise<void> {
  await page.getByLabel("Start date and time").fill(window.startValue);
  await page.getByLabel("End date and time").fill(window.endValue);
}

async function reservationsForUser(request: APIRequestContext, userId: string): Promise<unknown> {
  const response: APIResponse = await request.get(`/api/v1/reservations/user/${encodeURIComponent(userId)}`);
  expect(response.status()).toBe(200);
  return response.json() as Promise<unknown>;
}

test("student reserves an available study room", async ({ page, request }: BrowserFixtures, testInfo: TestInfo): Promise<void> => {
  const resource: Resource = await resourceByName(request, namesForProject(testInfo).room);
  const userId: string = `room-student-${testInfo.project.name}`;
  const window: BookingWindow = await tomorrowWindow(page, 10);

  await page.goto("/");
  await page.getByRole("group", { name: "Filter resources by type" })
    .getByRole("button", { name: "Rooms" }).click();
  await selectResource(page, resource.name);
  await enterUser(page, userId);
  await enterWindow(page, window);

  const createResponsePromise: Promise<Response> = page.waitForResponse(
    (response: Response): boolean =>
      response.url().endsWith("/api/v1/reservations") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Request booking" }).click();
  const createResponse: Response = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  const createdBody: unknown = await createResponse.json();
  expect(createdBody).toEqual(expect.objectContaining({
    id: expect.any(String), resourceId: resource.id, userId,
    startTime: window.startTime, endTime: window.endTime, status: "PENDING",
  }));
  const created: ReservationResponse = createdBody as ReservationResponse;

  await expect(page.getByRole("status").getByText("Booking created. It now appears in My Bookings.")).toBeVisible();
  const bookings = page.getByRole("region", { name: "My Bookings" });
  await expect(bookings).toBeVisible();
  const bookingCard = bookings.getByRole("listitem").filter({ hasText: `Resource ID: ${resource.id}` });
  await expect(bookingCard).toBeVisible();
  await expect(bookingCard.getByText(`Resource ID: ${resource.id}`)).toBeVisible();
  await expect(bookingCard.getByText("PENDING", { exact: true })).toBeVisible();
  const expectedTimeRange: string = await page.evaluate((times: BookingWindow): string => {
    const options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
    return `${new Date(times.startTime).toLocaleString(undefined, options)} to ${new Date(times.endTime).toLocaleString(undefined, options)}`;
  }, window);
  await expect(bookingCard).toContainText(expectedTimeRange);

  expect(await reservationsForUser(request, userId)).toEqual([
    expect.objectContaining({ id: created.id, resourceId: resource.id, userId, status: "PENDING" }),
  ]);
});

test("student receives a double-booking conflict for a 3D printer", async ({ page, request }: BrowserFixtures, testInfo: TestInfo): Promise<void> => {
  const resource: Resource = await resourceByName(request, namesForProject(testInfo).printer);
  const existingUserId: string = `existing-printer-student-${testInfo.project.name}`;
  const secondUserId: string = `second-printer-student-${testInfo.project.name}`;
  const window: BookingWindow = await tomorrowWindow(page, 14);

  const initialResponse: APIResponse = await request.post("/api/v1/reservations", {
    data: {
      resourceId: resource.id,
      userId: existingUserId,
      startTime: window.startTime,
      endTime: window.endTime,
    },
  });
  expect(initialResponse.status()).toBe(201);
  const initialBody: unknown = await initialResponse.json();
  expect(initialBody).toEqual(expect.objectContaining({
    resourceId: resource.id, userId: existingUserId,
    startTime: window.startTime, endTime: window.endTime, status: "PENDING",
  }));

  await page.goto("/");
  await page.getByRole("group", { name: "Filter resources by type" })
    .getByRole("button", { name: "Equipment" }).click();
  await selectResource(page, resource.name);
  await enterUser(page, secondUserId);
  await enterWindow(page, window);

  const conflictResponsePromise: Promise<Response> = page.waitForResponse(
    (response: Response): boolean =>
      response.url().endsWith("/api/v1/reservations") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Request booking" }).click();
  const conflictResponse: Response = await conflictResponsePromise;
  expect(conflictResponse.status()).toBe(409);
  expect(await conflictResponse.json()).toEqual({
    code: "DOUBLE_BOOKING",
    message: "Resource is already reserved for this time slot.",
  });
  await expect(page.getByRole("alert").getByText(
    "This resource is already reserved for that time window. Choose different times and try again.",
  )).toBeVisible();
  await expect(page.getByText("No bookings found for this demo user ID.")).toBeVisible();

  expect(await reservationsForUser(request, secondUserId)).toEqual([]);
  expect(await reservationsForUser(request, existingUserId)).toEqual([
    expect.objectContaining({ resourceId: resource.id, userId: existingUserId, status: "PENDING" }),
  ]);
});
