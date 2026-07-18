"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadOwnedFile } from "@/lib/storage";
import { logAudit } from "@/lib/audit";
import { sendNotification } from "@/lib/notifications";
import { getSiteUrl } from "@/lib/env";
import { normalizeUaePhone } from "@/lib/format";
import {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validations/auth";
import {
  ACCEPTED_DOCUMENT_TYPES,
  ACCEPTED_IMAGE_TYPES,
  MAX_LICENSE_SIZE_BYTES,
  MAX_LOGO_SIZE_BYTES,
  MAX_PRODUCT_PHOTOS,
  MAX_PRODUCT_PHOTO_SIZE_BYTES,
} from "@/lib/validations/business";

export type ActionResult =
  | { ok: true; needsEmailConfirmation?: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult {
  return { ok: false, error, fieldErrors };
}

export async function signupAction(formData: FormData): Promise<ActionResult> {
  const raw = {
    businessName: String(formData.get("businessName") ?? ""),
    ownerName: String(formData.get("ownerName") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    instagramUsername: String(formData.get("instagramUsername") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    description: String(formData.get("description") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  };

  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("Please fix the highlighted fields.", parsed.error.flatten().fieldErrors);
  }

  const logo = formData.get("logo");
  if (!(logo instanceof File) || logo.size === 0) {
    return fail("A business logo is required.", { logo: ["Upload a business logo."] });
  }
  if (logo.size > MAX_LOGO_SIZE_BYTES) {
    return fail("Logo file is too large.", { logo: ["Logo must be under 3MB."] });
  }
  if (!ACCEPTED_IMAGE_TYPES.includes(logo.type)) {
    return fail("Unsupported logo format.", { logo: ["Use PNG, JPEG, or WEBP."] });
  }

  const tradeLicense = formData.get("tradeLicense");
  const hasTradeLicense = tradeLicense instanceof File && tradeLicense.size > 0;
  if (hasTradeLicense) {
    const file = tradeLicense as File;
    if (file.size > MAX_LICENSE_SIZE_BYTES) {
      return fail("Trade licence file is too large.", { tradeLicense: ["Must be under 8MB."] });
    }
    if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type)) {
      return fail("Unsupported trade licence format.", { tradeLicense: ["Use PNG, JPEG, WEBP, or PDF."] });
    }
  }

  const productPhotos = formData
    .getAll("productPhotos")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_PRODUCT_PHOTOS);
  for (const photo of productPhotos) {
    if (photo.size > MAX_PRODUCT_PHOTO_SIZE_BYTES) {
      return fail("A product photo is too large.", { productPhotos: ["Each photo must be under 5MB."] });
    }
    if (!ACCEPTED_IMAGE_TYPES.includes(photo.type)) {
      return fail("Unsupported product photo format.", { productPhotos: ["Use PNG, JPEG, or WEBP."] });
    }
  }

  const data = parsed.data;
  const normalizedPhone = normalizeUaePhone(data.phone);

  const supabase = await createClient();

  const [{ data: emailAvailable }, { data: phoneAvailable }] = await Promise.all([
    supabase.rpc("check_email_available", { p_email: data.email }),
    supabase.rpc("check_phone_available", { p_phone: normalizedPhone }),
  ]);

  if (emailAvailable === false) {
    return fail("An account with this email already exists.", { email: ["Email already registered."] });
  }
  if (phoneAvailable === false) {
    return fail("An account with this phone number already exists.", { phone: ["Phone already registered."] });
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      emailRedirectTo: `${getSiteUrl()}/auth/callback`,
      data: { role: "vendor", full_name: data.ownerName },
    },
  });

  if (signUpError || !signUpData.user) {
    if (signUpError?.message.toLowerCase().includes("already registered")) {
      return fail("An account with this email already exists.", { email: ["Email already registered."] });
    }
    return fail(signUpError?.message ?? "Could not create your account. Please try again.");
  }

  const userId = signUpData.user.id;
  const admin = createAdminClient();

  try {
    const logoPath = await uploadOwnedFile(admin, "business-logos", userId, logo);
    const logoUrl = admin.storage.from("business-logos").getPublicUrl(logoPath).data.publicUrl;

    let tradeLicenseUrl: string | null = null;
    if (hasTradeLicense) {
      const licensePath = await uploadOwnedFile(admin, "trade-licenses", userId, tradeLicense as File);
      tradeLicenseUrl = licensePath; // private bucket — resolved via signed URL when displayed
    }

    const productPhotoUrls: string[] = [];
    for (const photo of productPhotos) {
      const path = await uploadOwnedFile(admin, "product-photos", userId, photo);
      productPhotoUrls.push(admin.storage.from("product-photos").getPublicUrl(path).data.publicUrl);
    }

    const { data: newBusiness, error: insertError } = await admin
      .from("businesses")
      .insert({
        owner_id: userId,
        business_name: data.businessName,
        owner_name: data.ownerName,
        email: data.email,
        phone: normalizedPhone,
        instagram_username: data.instagramUsername ? data.instagramUsername.replace(/^@/, "") : null,
        category_id: data.categoryId,
        description: data.description,
        logo_url: logoUrl,
        trade_license_url: tradeLicenseUrl,
        product_photo_urls: productPhotoUrls,
        approval_status: "profile_incomplete",
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return fail("An account with this email or phone number already exists.");
      }
      throw insertError;
    }

    await logAudit(admin, {
      actorId: userId,
      actorRole: "vendor",
      action: "business.created",
      entityType: "business",
      entityId: newBusiness.id,
      newValue: { business_name: data.businessName, email: data.email },
    });

    await sendNotification(admin, { businessId: newBusiness.id, templateKey: "account_created" });
  } catch (err) {
    console.error("Signup profile creation failed", err);
    return fail("Your account was created but we couldn't save your profile. Please contact support.");
  }

  return { ok: true, needsEmailConfirmation: !signUpData.session };
}

export async function loginAction(formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return fail("Please fix the highlighted fields.", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return fail("Incorrect email or password.");
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function forgotPasswordAction(formData: FormData): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse({ email: String(formData.get("email") ?? "") });
  if (!parsed.success) {
    return fail("Enter a valid email address.", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getSiteUrl()}/auth/callback?next=/reset-password`,
  });

  // Always return ok — do not reveal whether the email exists.
  return { ok: true };
}

export async function resetPasswordAction(formData: FormData): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse({
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!parsed.success) {
    return fail("Please fix the highlighted fields.", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return fail("Your password reset link has expired. Request a new one.");
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return fail(error.message);
  }

  return { ok: true };
}
