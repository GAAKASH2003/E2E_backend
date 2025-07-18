import request from "supertest";
import app from "../app";
import supabase from "../config/db";
import { generateOTP } from "../utils/otp";
import { hashOtp } from "../utils/password";
import { sendEmail } from "../utils/sendMail";

// Mock external deps
jest.mock("../config/db");
jest.mock("../utils/otp");
jest.mock("../utils/password");
jest.mock("../utils/sendMail");

const mockFrom = (supabase as any).from;

function makeUser(overrides = {}) {
  return {
    id: "u-1",
    email: "test@example.com",
    is_verified: true,
    otp: null,
    otp_expires_at: null,
    ...overrides,
  };
}

// Build a chain object for supabase.from("users") calls
const chainFactory = () => ({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
  update: jest.fn().mockReturnThis(),
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  (generateOTP as jest.Mock).mockReturnValue("123456");
  (hashOtp as jest.Mock).mockResolvedValue("hashed-123456");
  (sendEmail as jest.Mock).mockResolvedValue(undefined);
});

describe("POST /auth/forgot-password", () => {
  it("400 when email missing", async () => {
    const res = await request(app).post("/auth/forgot-password").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_BODY");
  });

  it("200 success when OTP generated & stored", async () => {
    const user = makeUser();

    // 1) lookup user succeeds
    const chainLookup = chainFactory();
    chainLookup.single.mockResolvedValue({ data: user, error: null });
    mockFrom.mockReturnValueOnce(chainLookup);

    // 2) update succeeds (setNewOTP path)
    const chainUpdate = chainFactory();
    chainUpdate.eq.mockResolvedValue({ error: null });
    mockFrom.mockReturnValueOnce(chainUpdate);

    const res = await request(app)
      .post("/auth/forgot-password")
      .send({ email: user.email });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Reset OTP sent/i);

    // OTP generation + hashing called
    expect(generateOTP).toHaveBeenCalled();
    expect(hashOtp).toHaveBeenCalledWith("123456");

    // Email sent to user
    expect(sendEmail).toHaveBeenCalledWith(
      user.email,
      expect.any(String),
      expect.stringContaining("123456")
    );
  });
});
