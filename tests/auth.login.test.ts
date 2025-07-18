import request from "supertest";
import app from "../app";
import supabase from "../config/db";
import { generateOTP } from "../utils/otp";
import { sendEmail } from "../utils/sendMail";
import { comparePassword } from "../utils/password";
import * as AuthController from "../controllers/authController";
import { generateTokens } from "../utils/jwt";
jest.mock("../config/db");
jest.mock("../utils/otp");
jest.mock("../utils/sendMail");
jest.mock("../utils/password");
jest.mock("../utils/jwt");

const mockFrom = (supabase as any).from;

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: "u-login",
    email: "login@example.com",
    password_hash: "hashed:pw",
    is_verified: true,
    provider: "email",
    provider_id: null,
    ...overrides,
  };
}

function chainFactory(partial: Partial<Record<string, any>> = {}) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    ...partial,
  };
}
beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /auth/login", () => {
  it("400 when missing email/password", async () => {
    const res = await request(app).post("/auth/login").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_BODY");
  });

  it("404 when user not found", async () => {
    const chain = chainFactory();
    chain.single.mockResolvedValue({ data: null, error: { code: "PGRST116" } });
    mockFrom.mockReturnValueOnce(chain);

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "nope@example.com", password: "pw" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("NOT_FOUND");
  });

  it("403 when user not verified (triggers OTP resend)", async () => {
    const unverifiedUser = makeUser({ is_verified: false });

    // 1st: lookup by email
    const chainLookup = chainFactory();
    chainLookup.single.mockResolvedValue({ data: unverifiedUser, error: null });
    mockFrom.mockReturnValueOnce(chainLookup);

    // 2nd: update to setNewOTP (controller helper does this)
    const chainUpdate = chainFactory();
    // When setNewOTP runs, we don't care about returning data; just no error:
    chainUpdate.eq.mockResolvedValue({ error: null });
    mockFrom.mockReturnValueOnce(chainUpdate);

    const res = await request(app)
      .post("/auth/login")
      .send({ email: unverifiedUser.email, password: "pw" });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("NOT_VERIFIED");
  });

  it("401 when password mismatch", async () => {
    const user = makeUser();
    (comparePassword as jest.Mock).mockResolvedValue(false);

    const chain = chainFactory();
    chain.single.mockResolvedValue({ data: user, error: null });
    mockFrom.mockReturnValueOnce(chain);

    const res = await request(app)
      .post("/auth/login")
      .send({ email: user.email, password: "wrong" });

    expect(comparePassword).toHaveBeenCalledWith("wrong", "hashed:pw");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("INVALID_CREDENTIALS");
  });
  it("200 login success returns tokens", async () => {
    const user = makeUser();

    (comparePassword as jest.Mock).mockResolvedValue(true);
    (generateTokens as jest.Mock).mockReturnValue({
      accessToken: "mock-access-token",
      refreshToken: "mock-refresh-token",
    });

    jest
      .spyOn(AuthController, "storeRefreshToken")
      .mockResolvedValue(undefined);

    const chain = chainFactory();
    chain.single.mockResolvedValue({ data: user, error: null });
    mockFrom.mockReturnValueOnce(chain);

    const res = await request(app)
      .post("/auth/login")
      .send({ email: user.email, password: "plainPassword" });

    expect(comparePassword).toHaveBeenCalledWith("plainPassword", "hashed:pw");
    expect(generateTokens).toHaveBeenCalledWith("u-login");
    expect(AuthController.storeRefreshToken).toHaveBeenCalledWith(
      "u-login",
      "mock-refresh-token"
    );

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe("mock-access-token");
    expect(res.body.refreshToken).toBe("mock-refresh-token");
    expect(res.body.user.email).toBe(user.email);
  });
});
