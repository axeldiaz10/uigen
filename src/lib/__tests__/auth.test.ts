// @vitest-environment node
import { describe, test, expect, vi, beforeEach } from "vitest";
import { SignJWT } from "jose";

// Mock server-only before importing auth
vi.mock("server-only", () => ({}));

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

// Mock next/headers
const mockGet = vi.fn();
const mockSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve({ get: mockGet, set: mockSet })),
}));

// Import after mocks are set up
const { getSession, createSession } = await import("@/lib/auth");

async function makeToken(payload: object, expiresIn = "7d") {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .setIssuedAt()
    .sign(JWT_SECRET);
}

describe("createSession", () => {
  beforeEach(() => {
    mockSet.mockReset();
  });

  test("sets the auth-token cookie", async () => {
    await createSession("user_123", "test@example.com");

    expect(mockSet).toHaveBeenCalledOnce();
    const [name] = mockSet.mock.calls[0];
    expect(name).toBe("auth-token");
  });

  test("sets cookie with correct options", async () => {
    await createSession("user_123", "test@example.com");

    const [, , options] = mockSet.mock.calls[0];
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.expires).toBeInstanceOf(Date);
  });

  test("cookie expires ~7 days from now", async () => {
    const before = Date.now();
    await createSession("user_123", "test@example.com");
    const after = Date.now();

    const [, , options] = mockSet.mock.calls[0];
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(options.expires.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(options.expires.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
  });

  test("token contains correct userId and email", async () => {
    await createSession("user_123", "test@example.com");

    const [, token] = mockSet.mock.calls[0];
    const { jwtVerify } = await import("jose");
    const { payload } = await jwtVerify(token, JWT_SECRET);
    expect(payload.userId).toBe("user_123");
    expect(payload.email).toBe("test@example.com");
  });

  test("does not set secure flag outside production", async () => {
    // NODE_ENV is 'test' by default in vitest
    await createSession("user_123", "test@example.com");

    const [, , options] = mockSet.mock.calls[0];
    expect(options.secure).toBe(false);
  });
});

describe("getSession", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  test("returns null when no cookie is present", async () => {
    mockGet.mockReturnValue(undefined);
    expect(await getSession()).toBeNull();
  });

  test("returns session payload for a valid token", async () => {
    const token = await makeToken({
      userId: "user_123",
      email: "test@example.com",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    mockGet.mockReturnValue({ value: token });

    const session = await getSession();

    expect(session).not.toBeNull();
    expect(session?.userId).toBe("user_123");
    expect(session?.email).toBe("test@example.com");
  });

  test("returns null for an expired token", async () => {
    const token = await makeToken(
      { userId: "user_123", email: "test@example.com" },
      "-1s"
    );
    mockGet.mockReturnValue({ value: token });

    expect(await getSession()).toBeNull();
  });

  test("returns null for a tampered token", async () => {
    const token = await makeToken({ userId: "user_123", email: "test@example.com" });
    const tampered = token.slice(0, -5) + "XXXXX";
    mockGet.mockReturnValue({ value: tampered });

    expect(await getSession()).toBeNull();
  });
});
