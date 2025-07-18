import request from "supertest";
import app from "../app";
import supabase from "../config/db";
import { generateOTP } from "../utils/otp";
import { sendEmail } from "../utils/sendMail";

jest.mock("../config/db");
jest.mock("../utils/otp");
jest.mock("../utils/sendMail");
jest.mock("../utils/password");
jest.mock("../utils/jwt");

const mockFrom = (supabase as any).from;

describe("POST /auth/signup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("400 when missing email/password", async () => {
    const res = await request(app).post("/auth/signup").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_BODY");
  });

  it("creates new unverified user & sends OTP", async () => {
    // Supabase call 1: lookup by email → no user
    const chain1 = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest
        .fn()
        .mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn(),
    };
    mockFrom.mockReturnValueOnce(chain1);

    // Supabase call 2: insert new user
    const chain2 = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { email: "check@gmail.com", is_verified: false },
        error: null,
      }),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn(),
    };
    mockFrom.mockReturnValueOnce(chain2);

    (generateOTP as jest.Mock).mockReturnValue("654321");

    const res = await request(app)
      .post("/auth/signup")
      .send({ email: "check@gmail.com", password: "pw" });

    expect(res.status).toBe(201);
    expect(sendEmail).toHaveBeenCalledWith(
      "check@gmail.com",
      expect.any(String),
      expect.stringContaining("654321")
    );
  });

  it("existing verified user returns 409", async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { email: "test@example.com", is_verified: true },
        error: null,
      }),
    };
    mockFrom.mockReturnValue(chain);

    const res = await request(app)
      .post("/auth/signup")
      .send({ email: "test@example.com", password: "pw" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("ALREADY_EXISTS");
  });
});
