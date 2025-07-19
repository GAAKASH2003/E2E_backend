import { Router } from "express";
import {
  signup,
  verifyOTP,
  login,
  forgotPassword,
  providerLogin,
} from "../controllers/authController";
import { createServerClient } from "@supabase/ssr";
import { parseCookieHeader, serializeCookieHeader } from "@supabase/ssr"; // use ssr utils, not legacy auth-helpers

// import { requireSupabaseAuth } from "../middleware/jwtverify";

const router = Router();

router.post("/signup", signup);
router.post("/verify", verifyOTP);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/syncuser", providerLogin);
router.get("/callback", async (req, res) => {
  const code = req.query.code?.toString();
  if (!code) return res.redirect(303, "/auth/error");

  const cookies = {
    getAll() {
      const parsed = parseCookieHeader(req.headers.cookie ?? "");
      return parsed.map((c) => ({
        name: c.name,
        value: c.value ?? "", // ensure it's always a string
      }));
    },
    setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
      cookiesToSet.forEach(({ name, value, options }) => {
        res.append("Set-Cookie", serializeCookieHeader(name, value, options));
      });
    },
  };
  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_KEY!,
    { cookies }
  );

  // 1. Exchange code for session
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
    code
  );
  if (exchangeError) {
    console.error("Supabase exchange error:", exchangeError);
    return res.redirect(303, "/auth/error");
  }

  // 2. Get authenticated user
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    console.error("Failed to get user:", userError);
    return res.redirect(303, "/auth/error");
  }

  const user = userData.user;
  const provider = user.app_metadata?.provider || "email";
  const provider_id = user.identities?.[0]?.id || null;

  // 3. Check if user already exists
  const { data: existingUser, error: selectError } = await supabase
    .from("users")
    .select("id")
    .eq("email", user.email)
    .single();

  if (selectError && selectError.code !== "PGRST116") {
    console.error("Error checking user existence:", selectError);
  }

  // 4. Insert if new user
  if (!existingUser) {
    const { error: insertError } = await supabase.from("users").insert({
      id: user.id,
      email: user.email,
      password_hash: null, // since OAuth login doesn't provide password
      is_verified: true,
      otp: null,
      otp_expires_at: null,
      provider,
      provider_id,
      refresh_token_hash: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("Error inserting new user:", insertError);
    } else {
      console.log("New user inserted:", user.email);
    }
  }

  return res.redirect(303, `${process.env.FRONTEND_URL}/profile`);
});

export default router;
