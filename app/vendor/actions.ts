"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { uploadOwnedFile } from "@/lib/storage";
import { logAudit } from "@/lib/audit";
import { requireVendor } from "@/lib/dal";
import { normalizeUaePhone } from "@/lib/format";
import { businessProfileSchema } from "@/lib/validations/business";
import type { Database } from "@/types/database";

type BusinessUpdate = Database["public"]["Tables"]["businesses"]["Update"];
import {
  ACCEPTED_DOCUMENT_TYPES,
  ACCEPTED_IMAGE_TYPES,
  MAX_LICENSE_SIZE_BYTES,
  MAX_LOGO_SIZE_BYTES,
  MAX_PRODUCT_PHOTOS,
  MAX_PRODUCT_PHOTO_SIZE_BYTES,
} from "@/lib/validations/business";
import type { ActionResult } from "@/app/auth/actions";

function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult {
  return { ok: false, error, fieldErrors };
}

export async function updateBusinessProfileAction(formData: FormData): Promise<ActionResult> {
  const { authUser } = await requireVendor();
  const supabase = await createClient();

  const { data: business, error: fetchError } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", authUser.id)
    .maybeSingle();

  if (fetchError || !business) {
    return fail("We couldn't find your business profile.");
  }

  const raw = {
    businessName: String(formData.get("businessName") ?? ""),
    ownerName: String(formData.get("ownerName") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    instagramUsername: String(formData.get("instagramUsername") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    description: String(formData.get("description") ?? ""),
  };

  const parsed = businessProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("Please fix the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;
  const normalizedPhone = normalizeUaePhone(data.phone);

  if (data.email !== business.email) {
    const { data: emailAvailable } = await supabase.rpc("check_email_available", { p_email: data.email });
    if (emailAvailable === false) {
      return fail("That email is already in use by another account.", { email: ["Already in use."] });
    }
  }
  if (normalizedPhone !== business.phone) {
    const { data: phoneAvailable } = await supabase.rpc("check_phone_available", { p_phone: normalizedPhone });
    if (phoneAvailable === false) {
      return fail("That phone number is already in use by another account.", { phone: ["Already in use."] });
    }
  }

  const updates: BusinessUpdate = {
    business_name: data.businessName,
    owner_name: data.ownerName,
    email: data.email,
    phone: normalizedPhone,
    instagram_username: data.instagramUsername ? data.instagramUsername.replace(/^@/, "") : null,
    category_id: data.categoryId,
    description: data.description,
    last_profile_update: new Date().toISOString(),
  };

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > MAX_LOGO_SIZE_BYTES) return fail("Logo file is too large.", { logo: ["Must be under 3MB."] });
    if (!ACCEPTED_IMAGE_TYPES.includes(logo.type)) {
      return fail("Unsupported logo format.", { logo: ["Use PNG, JPEG, or WEBP."] });
    }
    const path = await uploadOwnedFile(supabase, "business-logos", authUser.id, logo);
    updates.logo_url = supabase.storage.from("business-logos").getPublicUrl(path).data.publicUrl;
  }

  const tradeLicense = formData.get("tradeLicense");
  if (tradeLicense instanceof File && tradeLicense.size > 0) {
    if (tradeLicense.size > MAX_LICENSE_SIZE_BYTES) {
      return fail("Trade licence file is too large.", { tradeLicense: ["Must be under 8MB."] });
    }
    if (!ACCEPTED_DOCUMENT_TYPES.includes(tradeLicense.type)) {
      return fail("Unsupported trade licence format.", { tradeLicense: ["Use PNG, JPEG, WEBP, or PDF."] });
    }
    updates.trade_license_url = await uploadOwnedFile(supabase, "trade-licenses", authUser.id, tradeLicense);
  }

  const newProductPhotos = formData
    .getAll("productPhotos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (newProductPhotos.length > 0) {
    const existing = business.product_photo_urls ?? [];
    const room = Math.max(0, MAX_PRODUCT_PHOTOS - existing.length);
    const toUpload = newProductPhotos.slice(0, room);
    const uploadedUrls: string[] = [];
    for (const photo of toUpload) {
      if (photo.size > MAX_PRODUCT_PHOTO_SIZE_BYTES) {
        return fail("A product photo is too large.", { productPhotos: ["Each photo must be under 5MB."] });
      }
      if (!ACCEPTED_IMAGE_TYPES.includes(photo.type)) {
        return fail("Unsupported product photo format.", { productPhotos: ["Use PNG, JPEG, or WEBP."] });
      }
      const path = await uploadOwnedFile(supabase, "product-photos", authUser.id, photo);
      uploadedUrls.push(supabase.storage.from("product-photos").getPublicUrl(path).data.publicUrl);
    }
    updates.product_photo_urls = [...existing, ...uploadedUrls];
  }

  // Material edits to an already-approved profile require the admin to
  // re-review before the vendor can select a booth again.
  if (business.approval_status === "approved") {
    updates.requires_reapproval = true;
  }

  const { error: updateError } = await supabase.from("businesses").update(updates).eq("id", business.id);
  if (updateError) {
    if (updateError.code === "23505") {
      return fail("That email or phone number is already in use by another account.");
    }
    return fail("Could not save your profile. Please try again.");
  }

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "vendor",
    action: "business.updated",
    entityType: "business",
    entityId: business.id,
    previousValue: {
      business_name: business.business_name,
      email: business.email,
      phone: business.phone,
      category_id: business.category_id,
      description: business.description,
    },
    newValue: updates as never,
  });

  revalidatePath("/vendor");
  revalidatePath("/vendor/profile");
  return { ok: true };
}

export async function submitProfileForReviewAction(): Promise<ActionResult> {
  const { authUser } = await requireVendor();
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", authUser.id)
    .maybeSingle();

  if (!business) return fail("Complete your business profile first.");
  if (!["profile_incomplete", "rejected"].includes(business.approval_status)) {
    return fail("Your profile has already been submitted.");
  }

  const { error } = await supabase
    .from("businesses")
    .update({
      approval_status: "pending_review",
      submitted_at: new Date().toISOString(),
      requires_reapproval: false,
    })
    .eq("id", business.id);

  if (error) return fail("Could not submit your profile. Please try again.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "vendor",
    action: "business.submitted",
    entityType: "business",
    entityId: business.id,
    previousValue: { approval_status: business.approval_status },
    newValue: { approval_status: "pending_review" },
  });

  revalidatePath("/vendor");
  return { ok: true };
}

export async function applyToEventAction(eventId: string): Promise<ActionResult> {
  const { authUser } = await requireVendor();
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, approval_status, requires_reapproval")
    .eq("owner_id", authUser.id)
    .maybeSingle();

  if (!business) return fail("Complete your business profile first.");
  if (business.approval_status !== "approved") {
    return fail("Your business must be approved before applying to an event.");
  }

  const { data: event } = await supabase
    .from("events")
    .select("id, registration_status")
    .eq("id", eventId)
    .maybeSingle();

  if (!event || event.registration_status !== "open") {
    return fail("This event is not currently open for registration.");
  }

  const { data: existing } = await supabase
    .from("applications")
    .select("id, status")
    .eq("event_id", eventId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (existing && existing.status !== "not_started") {
    return fail("You've already applied to this event.");
  }

  // A vendor who is already approved at the business level doesn't need a
  // second manual review for a routine event — unless the admin has flagged
  // their profile for reapproval (e.g. after a material profile edit), in
  // which case the application waits in "submitted" for admin action.
  const now = new Date().toISOString();
  const autoApprove = !business.requires_reapproval;
  const applicationUpdate = {
    event_id: eventId,
    business_id: business.id,
    status: autoApprove ? "approved" : "submitted",
    submitted_at: now,
    reviewed_at: autoApprove ? now : null,
  } as const;

  const { error } = existing
    ? await supabase.from("applications").update(applicationUpdate).eq("id", existing.id)
    : await supabase.from("applications").insert(applicationUpdate);

  if (error) return fail("Could not submit your application. Please try again.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "vendor",
    action: "application.submitted",
    entityType: "application",
    entityId: existing?.id ?? null,
    newValue: { event_id: eventId, status: applicationUpdate.status },
  });

  revalidatePath("/vendor");
  return { ok: true };
}
