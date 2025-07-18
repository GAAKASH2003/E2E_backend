import { Request, Response } from "express";
import supabase from "../config/db";
import { generateOTP } from "../utils/otp";
import { sendEmail } from "../utils/sendMail";
import {
  hashPassword,
  comparePassword,
  hashOtp,
  compareOtp,
} from "../utils/password";
import { generateTokens } from "../utils/jwt";
import bcrypt from "bcrypt";

const OTP_TTL_MIN = Number(process.env.OTP_TTL_MIN || 10);

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  is_verified: boolean;
  otp: string | null;
  otp_expires_at: string | null;
  provider: string | null;
  provider_id: string | null;
  refresh_token_hash: string | null;
  created_at?: string;
  updated_at?: string;
}

//Error handling functions
function invalidBody(res: Response, fields: string[]) {
  return res.status(400).json({
    error: "INVALID_BODY",
    message: `Missing required field(s): ${fields.join(", ")}`,
  });
}

function notFound(res: Response, msg = "User not found") {
  return res.status(404).json({ error: "NOT_FOUND", message: msg });
}

function serverError(res: Response, msg = "Internal server error") {
  return res.status(500).json({ error: "SERVER_ERROR", message: msg });
}

export const nowPlusMinutes = (m: number) =>
  new Date(Date.now() + m * 60_000).toISOString();

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();
  if (error) {
    return null;
  }
  return data;
}

async function updateUser(
  email: string,
  patch: Partial<UserRow>
): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from("users")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("email", email)
    .select("*")
    .single();
  if (error) {
    console.error("updateUser error:", error);
    return null;
  }
  return data;
}

async function createUser(
  email: string,
  passwordHash: string
): Promise<UserRow | null> {
  const otp = generateOTP();
  const hashotp = await hashOtp(otp);
  const otpExpires = nowPlusMinutes(OTP_TTL_MIN);
  const { data, error } = await supabase
    .from("users")
    .insert({
      email,
      password_hash: passwordHash,
      is_verified: false,
      otp: hashotp,
      otp_expires_at: otpExpires,
    } as Partial<UserRow>)
    .select("*")
    .single();
  if (error) {
    console.error("createUser error:", error);
    return null;
  }

  void sendEmail(
    email,
    "Your Signup OTP",
    `Your OTP is: ${otp} (valid ${OTP_TTL_MIN} min)`
  );
  return data;
}

export const setNewOTP = async (email: string): Promise<{ ok: boolean }> => {
  const otp = generateOTP();
  const otpExpires = nowPlusMinutes(OTP_TTL_MIN);
  const hashotp = await hashOtp(otp);
  const { error } = await supabase
    .from("users")
    .update({
      otp: hashotp,
      otp_expires_at: otpExpires,
      updated_at: new Date().toISOString(),
    })
    .eq("email", email);
  if (error) {
    console.error("setNewOTP error:", error);
    return { ok: false };
  }
  void sendEmail(
    email,
    "Your OTP from E2E Transit Solutions",
    `Your OTP is: ${otp} (valid ${OTP_TTL_MIN} min)`
  );
  return { ok: true };
};

export const storeRefreshToken = async (
  userId: string,
  refreshToken: string
): Promise<void> => {
  const refreshHash = await bcrypt.hash(refreshToken, 10);
  const { error } = await supabase
    .from("users")
    .update({
      refresh_token_hash: refreshHash,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) console.error("storeRefreshToken error:", error);
};

export const signup = async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return invalidBody(res, ["email", "password"]);

  // Already exists?
  const existing = await getUserByEmail(email);
  if (existing) {
    if (existing.is_verified) {
      return res.status(409).json({
        error: "ALREADY_EXISTS",
        message: "Account already exists and is verified. Please log in.",
      });
    } else {
      // Re‑issue OTP if user exists but not verified
      const { ok } = await setNewOTP(email);
      if (!ok) return serverError(res);
      return res.status(200).json({
        message: "User exists but not verified. OTP re-sent.",
      });
    }
  }

  // Create new
  const passwordHash = await hashPassword(password);
  const user = await createUser(email, passwordHash);
  if (!user) return serverError(res);
  return res
    .status(201)
    .json({ message: "Signup successful. OTP sent to email." });
};

export const verifyOTP = async (req: Request, res: Response) => {
  const { email, otp, newPassword } = req.body ?? {};
  if (!email || !otp) return invalidBody(res, ["email", "otp"]);

  const user = await getUserByEmail(email);
  if (!user) return notFound(res);

  if (!user.otp || !user.otp_expires_at) {
    return res.status(400).json({
      error: "NO_OTP",
      message: "No active OTP. Please initiate signup or password reset.",
    });
  }

  const expired = new Date(user.otp_expires_at).getTime() < Date.now();
  if (expired) {
    return res.status(400).json({
      error: "OTP_EXPIRED",
      message: "OTP expired. Request a new one.",
    });
  }

  if (!(await compareOtp(otp, user.otp))) {
    return res.status(400).json({
      error: "OTP_INVALID",
      message: "Incorrect OTP.",
    });
  }

  // OTP valid
  let patch: Partial<UserRow> = {
    otp: null,
    otp_expires_at: null,
  };

  if (!user.is_verified && !newPassword) {
    // Signup verification
    patch.is_verified = true;
  } else if (newPassword) {
    // Password reset
    patch.password_hash = await hashPassword(newPassword);
    // Ensure verified (user proved email ownership)
    patch.is_verified = true;
  }

  const updated = await updateUser(email, patch);
  console.log("Updated user:", updated);
  if (!updated) return serverError(res);

  const msg = newPassword
    ? "Password reset successful."
    : user.is_verified
    ? "OTP accepted."
    : "Verification successful.";
  console.log("User verified:", updated.is_verified);
  console.log("User updated:", msg);
  return res.json({ message: msg, isVerified: updated.is_verified });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return invalidBody(res, ["email", "password"]);

  const user = await getUserByEmail(email);
  if (!user) return notFound(res);

  if (!user.is_verified) {
    // Re-send OTP to help user complete flow
    const { ok } = await setNewOTP(email);
    if (!ok) return serverError(res);
    return res.status(403).json({
      error: "NOT_VERIFIED",
      message: "Account not verified. OTP re-sent.",
    });
  }

  if (!user.password_hash) {
    return res.status(400).json({
      error: "NO_PASSWORD",
      message: "Account created via OAuth. Use social login.",
    });
  }

  const pwOk = await comparePassword(password, user.password_hash);
  if (!pwOk) {
    return res.status(401).json({
      error: "INVALID_CREDENTIALS",
      message: "Invalid email or password.",
    });
  }

  const { accessToken, refreshToken } = generateTokens(user.id);
  await storeRefreshToken(user.id, refreshToken);

  return res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email },
  });
};

// Issues OTP for password reset (reuses /verify to set new password).
export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body ?? {};
  if (!email) return invalidBody(res, ["email"]);

  const user = await getUserByEmail(email);
  if (!user) {
    return res.json({ message: "If that email exists, an OTP has been sent." });
  }

  const { ok } = await setNewOTP(email);
  if (!ok) return serverError(res);
  return res.json({ message: "Reset OTP sent to email." });
};

export async function providerLogin(req: Request, res: Response) {
  const { id, email, provider, provider_id } = req.body || {};

  if (!id || !email) {
    return res.status(400).json({
      error: "INVALID_BODY",
      message: "Fields 'id' and 'email' are required.",
    });
  }

  try {
    // Fetch by email first
    const { data: userByEmail, error: emailErr } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (emailErr && emailErr.code !== "PGRST116") {
      console.error("emailErr:", emailErr);
      return res
        .status(500)
        .json({ error: "DB_ERROR", message: emailErr.message });
    }

    if (userByEmail) {
      if (userByEmail.id === id) {
        return res.json({
          message: "User already exists. Login successful.",
          created: false,
          user: userByEmail,
        });
      }

      // ID mismatch → update user ID and provider info
      const { data: updatedUser, error: updateErr } = await supabase
        .from("users")
        .update({
          id,
          provider,
          provider_id,
          is_verified: true,
        })
        .eq("email", email)
        .select("*")
        .single();

      if (updateErr) {
        console.error("updateErr:", updateErr);
        return res
          .status(500)
          .json({ error: "DB_ERROR", message: updateErr.message });
      }

      return res.json({
        message: "User updated with new ID.",
        created: false,
        user: updatedUser,
      });
    }

    // No user found → Insert
    const { data: created, error: insertErr } = await supabase
      .from("users")
      .insert({
        id,
        email,
        provider,
        provider_id,
        is_verified: true,
      })
      .select("*")
      .single();

    if (insertErr) {
      console.error("insertErr:", insertErr);
      return res
        .status(500)
        .json({ error: "DB_ERROR", message: insertErr.message });
    }

    return res.json({
      message: "User created (first login).",
      created: true,
      user: created,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return res
      .status(500)
      .json({ error: "SERVER_ERROR", message: "Internal Server Error" });
  }
}
