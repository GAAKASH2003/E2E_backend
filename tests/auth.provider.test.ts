import request from "supertest";
import app from "../app";
import supabase from "../config/db";

jest.mock("../config/db");

const mockFrom = (supabase as any).from;

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: "auth-uid-1",
    email: "user@example.com",
    provider: "google",
    provider_id: "google-123",
    is_verified: true,
    ...overrides,
  };
}

const chainFactory = () => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),

  update: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
});

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.clearAllMocks();
});

describe("POST /auth/syncuser", () => {
  it("400 when id or email missing", async () => {
    const res = await request(app).post("/auth/syncuser").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_BODY");
  });

  it("500 when DB error during email lookup", async () => {
    const chain = chainFactory();
    chain.single.mockResolvedValue({
      data: null,
      error: { code: "XX001", message: "db failed" },
    });
    mockFrom.mockReturnValueOnce(chain);

    const res = await request(app)
      .post("/auth/syncuser")
      .send({ id: "abc", email: "fail@example.com" });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("DB_ERROR");
  });

  it("200 existing user w/ same id → login success", async () => {
    const existing = makeUser(); // id matches payload
    const chain = chainFactory();
    chain.single.mockResolvedValue({ data: existing, error: null });
    mockFrom.mockReturnValueOnce(chain);

    const res = await request(app).post("/auth/syncuser").send({
      id: existing.id,
      email: existing.email,
      provider: existing.provider,
      provider_id: existing.provider_id,
    });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    expect(res.body.user.email).toBe(existing.email);
  });

  it("500 when update fails on ID mismatch", async () => {
    const existing = makeUser({ id: "old-id" }); // different from payload id
    // Lookup by email
    const chainLookup = chainFactory();
    chainLookup.single.mockResolvedValue({ data: existing, error: null });
    mockFrom.mockReturnValueOnce(chainLookup);

    // Update path
    const chainUpdate = chainFactory();
    chainUpdate.single.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "update failed" },
    });
    mockFrom.mockReturnValueOnce(chainUpdate);

    const res = await request(app).post("/auth/syncuser").send({
      id: "new-id",
      email: existing.email,
      provider: "google",
      provider_id: "g-1",
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("DB_ERROR");
  });

  it("200 updates user when email exists but id differs", async () => {
    const existing = makeUser({ id: "old-id" });
    // Lookup by email
    const chainLookup = chainFactory();
    chainLookup.single.mockResolvedValue({ data: existing, error: null });
    mockFrom.mockReturnValueOnce(chainLookup);

    // Update returns updated user
    const updated = makeUser({
      id: "new-id",
      provider: "google",
      provider_id: "g-2",
    });
    const chainUpdate = chainFactory();
    chainUpdate.single.mockResolvedValue({ data: updated, error: null });
    mockFrom.mockReturnValueOnce(chainUpdate);

    const res = await request(app).post("/auth/syncuser").send({
      id: "new-id",
      email: existing.email,
      provider: "google",
      provider_id: "g-2",
    });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    expect(res.body.user.id).toBe("new-id");
  });

  it("200 inserts new user (first login)", async () => {
    // Lookup: not found
    const chainLookup = chainFactory();
    chainLookup.single.mockResolvedValue({
      data: null,
      error: { code: "PGRST116" },
    });
    mockFrom.mockReturnValueOnce(chainLookup);

    // Insert success
    const created = makeUser({ id: "new-user", email: "new@example.com" });
    const chainInsert = chainFactory();
    chainInsert.single.mockResolvedValue({ data: created, error: null });
    mockFrom.mockReturnValueOnce(chainInsert);

    const res = await request(app).post("/auth/syncuser").send({
      id: "new-user",
      email: "new@example.com",
      provider: "google",
      provider_id: "g-new",
    });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(true);
    expect(res.body.user.email).toBe("new@example.com");
  });
});
