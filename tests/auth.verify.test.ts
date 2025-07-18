import request from "supertest";
import app from "../app";
import supabase from "../config/db";
import { hashPassword } from "../utils/password";
import { compareOtp } from "../utils/password";

jest.mock("../config/db");
jest.mock("../utils/otp");
jest.mock("../utils/sendMail");
jest.mock("../utils/password");
jest.mock("../utils/jwt");

const mockFrom = (supabase as any).from;

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: "u-1",
    email: "v@x.com",
    password_hash: "hashed:pw",
    is_verified: false,
    otp: "hashedOtp",
    otp_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    provider: null,
    provider_id: null,
    ...overrides,
  };
}

function chainFactory(partial: Partial<Record<string, any>> = {}) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    single: jest.fn(),
    ...partial,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /auth/verify (hashed OTP)", () => {
  it("400: missing email/otp", async () => {
    const res = await request(app).post("/auth/verify").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_BODY");
  });

  it("404: user not found", async () => {
    const chain = chainFactory();
    chain.single.mockResolvedValue({ data: null, error: { code: "PGRST116" } });
    mockFrom.mockReturnValueOnce(chain);

    const res = await request(app)
      .post("/auth/verify")
      .send({ email: "none@x.com", otp: "123456" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("NOT_FOUND");
  });

  it("400: no active OTP", async () => {
    const chain = chainFactory();
    chain.single.mockResolvedValue({
      data: makeUser({ otp: null, otp_expires_at: null }),
      error: null,
    });
    mockFrom.mockReturnValueOnce(chain);

    const res = await request(app)
      .post("/auth/verify")
      .send({ email: "v@x.com", otp: "123456" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("NO_OTP");
  });

  it("400: OTP expired", async () => {
    const chain = chainFactory();
    chain.single.mockResolvedValue({
      data: makeUser({
        otp: "hashedOtp",
        otp_expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
      error: null,
    });
    mockFrom.mockReturnValueOnce(chain);

    const res = await request(app)
      .post("/auth/verify")
      .send({ email: "v@x.com", otp: "123456" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("OTP_EXPIRED");
  });

  it("400: OTP invalid (compareOtp false)", async () => {
    (compareOtp as jest.Mock).mockResolvedValue(false);

    // user lookup
    const chain = chainFactory();
    chain.single.mockResolvedValue({
      data: makeUser(),
      error: null,
    });
    mockFrom.mockReturnValueOnce(chain);

    const res = await request(app)
      .post("/auth/verify")
      .send({ email: "v@x.com", otp: "WRONG" });

    expect(compareOtp).toHaveBeenCalledWith("WRONG", "hashedOtp");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("OTP_INVALID");
  });

  it("200: signup verification success (user NOT verified, no newPassword)", async () => {
    (compareOtp as jest.Mock).mockResolvedValue(true);

    // lookup
    const chainLookup = chainFactory();
    chainLookup.single.mockResolvedValue({
      data: makeUser({ is_verified: false }),
      error: null,
    });
    mockFrom.mockReturnValueOnce(chainLookup);

    // update patch
    const chainUpdate = chainFactory();
    chainUpdate.single.mockResolvedValue({
      data: makeUser({
        is_verified: true,
        otp: null,
        otp_expires_at: null,
      }),
      error: null,
    });
    mockFrom.mockReturnValueOnce(chainUpdate);

    const res = await request(app)
      .post("/auth/verify")
      .send({ email: "v@x.com", otp: "111222" });

    expect(compareOtp).toHaveBeenCalledWith("111222", "hashedOtp");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Verification successful/i);
    expect(res.body.isVerified).toBe(true);
  });

  it("200: OTP accepted (user already verified, no newPassword)", async () => {
    (compareOtp as jest.Mock).mockResolvedValue(true);

    // lookup (already verified)
    const chainLookup = chainFactory();
    chainLookup.single.mockResolvedValue({
      data: makeUser({ is_verified: true }),
      error: null,
    });
    mockFrom.mockReturnValueOnce(chainLookup);

    // update patch (clear otp)
    const chainUpdate = chainFactory();
    chainUpdate.single.mockResolvedValue({
      data: makeUser({
        is_verified: true,
        otp: null,
        otp_expires_at: null,
      }),
      error: null,
    });
    mockFrom.mockReturnValueOnce(chainUpdate);

    const res = await request(app)
      .post("/auth/verify")
      .send({ email: "v@x.com", otp: "111222" });

    expect(compareOtp).toHaveBeenCalledWith("111222", "hashedOtp");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/OTP accepted/i);
    expect(res.body.isVerified).toBe(true);
  });

  it("200: password reset path (newPassword present)", async () => {
    (compareOtp as jest.Mock).mockResolvedValue(true);
    (hashPassword as jest.Mock).mockResolvedValue("hashed:newpw");

    // lookup (user maybe verified or not; controller forces verified)
    const chainLookup = chainFactory();
    chainLookup.single.mockResolvedValue({
      data: makeUser({ is_verified: true }), // could be false, logic still marks verified
      error: null,
    });
    mockFrom.mockReturnValueOnce(chainLookup);

    // update (store new pw, clear otp)
    const chainUpdate = chainFactory();
    chainUpdate.single.mockResolvedValue({
      data: makeUser({
        is_verified: true,
        password_hash: "hashed:newpw",
        otp: null,
        otp_expires_at: null,
      }),
      error: null,
    });
    mockFrom.mockReturnValueOnce(chainUpdate);

    const res = await request(app)
      .post("/auth/verify")
      .send({ email: "v@x.com", otp: "111222", newPassword: "NewPw1!" });

    expect(compareOtp).toHaveBeenCalledWith("111222", "hashedOtp");
    expect(hashPassword).toHaveBeenCalledWith("NewPw1!");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Password reset successful/i);
    expect(res.body.isVerified).toBe(true);
  });
});
