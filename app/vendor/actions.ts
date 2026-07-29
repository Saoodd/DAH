"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getOwnedPublicFilePath,
  removeSupersededOwnedFile,
  uploadOwnedFile,
} from "@/lib/storage";
import { logAudit } from "@/lib/audit";
import { sendTrustedNotification } from "@/lib/notifications";
import { requireVendor } from "@/lib/dal";
import { normalizeUaePhone } from "@/lib/format";
import { businessProfileSchema } from "@/lib/validations/business";
import {
  ACCEPTED_DOCUMENT_TYPES,
  ACCEPTED_IMAGE_TYPES,
  MAX_LICENSE_SIZE_BYTES,
  MAX_LOGO_SIZE_BYTES,
  MAX_PRODUCT_PHOTOS,
  MAX_PRODUCT_PHOTO_SIZE_BYTES,
} from "@/lib/validations/business";
import type { ActionResult } from "@/app/auth/actions";
import { isEventRegistrationOpen } from "@/lib/event-registration";

function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult {
  return { ok: false, error, fieldErrors };
}

type UploadedObject = { bucket: string; path: string };

async function cleanupUploadedObjects(
  supabase: Awaited<ReturnType<typeof createClient>>,
  objects: UploadedObject[]
) {
  const pathsByBucket = new Map<string, string[]>();
  for (const { bucket, path } of objects) {
    pathsByBucket.set(bucket, [...(pathsByBucket.get(bucket) ?? []), path]);
  }

  for (const [bucket, paths] of pathsByBucket) {
    try {
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) console.error(`Profile upload cleanup failed for ${bucket}.`, error.message);
    } catch {
      console.error(`Profile upload cleanup failed for ${bucket}.`);
    }
  }
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

  if (data.email !== business.email.toLowerCase()) {
    return fail("Email changes require a verified support request.", {
      email: ["This account email cannot be changed here."],
    });
  }
  if (normalizedPhone !== business.phone) {
    const { data: phoneAvailable } = await supabase.rpc("check_phone_available", { p_phone: normalizedPhone });
    if (phoneAvailable === false) {
      return fail("That phone number is already in use by another account.", { phone: ["Already in use."] });
    }
  }

  const logoValue = formData.get("logo");
  const logo = logoValue instanceof File && logoValue.size > 0 ? logoValue : null;
  if (logo?.size && logo.size > MAX_LOGO_SIZE_BYTES) {
    return fail("Logo file is too large.", { logo: ["Must be under 3MB."] });
  }
  if (logo && !ACCEPTED_IMAGE_TYPES.includes(logo.type)) {
    return fail("Unsupported logo format.", { logo: ["Use PNG, JPEG, or WEBP."] });
  }

  const tradeLicenseValue = formData.get("tradeLicense");
  const tradeLicense =
    tradeLicenseValue instanceof File && tradeLicenseValue.size > 0 ? tradeLicenseValue : null;
  if (tradeLicense?.size && tradeLicense.size > MAX_LICENSE_SIZE_BYTES) {
    return fail("Trade licence file is too large.", { tradeLicense: ["Must be under 8MB."] });
  }
  if (tradeLicense && !ACCEPTED_DOCUMENT_TYPES.includes(tradeLicense.type)) {
    return fail("Unsupported trade licence format.", {
      tradeLicense: ["Use PNG, JPEG, WEBP, or PDF."],
    });
  }

  const newProductPhotos = formData
    .getAll("productPhotos")
    .filter((file): file is File => file instanceof File && file.size > 0);
  const existingProductPhotos = business.product_photo_urls ?? [];
  const productPhotoRoom = Math.max(0, MAX_PRODUCT_PHOTOS - existingProductPhotos.length);
  const productPhotosToUpload = newProductPhotos.slice(0, productPhotoRoom);
  for (const photo of productPhotosToUpload) {
    if (photo.size > MAX_PRODUCT_PHOTO_SIZE_BYTES) {
      return fail("A product photo is too large.", {
        productPhotos: ["Each photo must be under 5MB."],
      });
    }
    if (!ACCEPTED_IMAGE_TYPES.includes(photo.type)) {
      return fail("Unsupported product photo format.", {
        productPhotos: ["Use PNG, JPEG, or WEBP."],
      });
    }
  }

  const uploadedObjects: UploadedObject[] = [];
  let uploadedLogoPath: string | null = null;
  let uploadedTradeLicensePath: string | null = null;
  let logoUrl: string | null = null;
  let tradeLicenseUrl: string | null = null;
  let newProductPhotoUrls: string[] | null = null;

  try {
    if (logo) {
      uploadedLogoPath = await uploadOwnedFile(supabase, "business-logos", authUser.id, logo);
      uploadedObjects.push({ bucket: "business-logos", path: uploadedLogoPath });
      logoUrl = supabase.storage
        .from("business-logos")
        .getPublicUrl(uploadedLogoPath).data.publicUrl;
    }

    if (tradeLicense) {
      uploadedTradeLicensePath = await uploadOwnedFile(
        supabase,
        "trade-licenses",
        authUser.id,
        tradeLicense
      );
      uploadedObjects.push({ bucket: "trade-licenses", path: uploadedTradeLicensePath });
      tradeLicenseUrl = uploadedTradeLicensePath;
    }

    if (productPhotosToUpload.length > 0) {
      newProductPhotoUrls = [];
      for (const photo of productPhotosToUpload) {
        const path = await uploadOwnedFile(supabase, "product-photos", authUser.id, photo);
        uploadedObjects.push({ bucket: "product-photos", path });
        newProductPhotoUrls.push(
          supabase.storage.from("product-photos").getPublicUrl(path).data.publicUrl
        );
      }
    }
  } catch (error) {
    await cleanupUploadedObjects(supabase, uploadedObjects);
    console.error("Profile upload failed.", error instanceof Error ? error.message : "Unknown error");
    return fail("Could not upload your files. Please try again.");
  }

  // Vendors have no direct UPDATE grant on businesses (migration 0010) —
  // this function only ever touches profile fields, never approval_status,
  // so a vendor can't self-approve by calling the table API directly.
  const { error: updateError } = await supabase.rpc("update_business_profile", {
    p_business_name: data.businessName,
    p_owner_name: data.ownerName,
    p_email: data.email,
    p_phone: normalizedPhone,
    p_instagram_username: data.instagramUsername ? data.instagramUsername.replace(/^@/, "") : null,
    p_category_id: data.categoryId,
    p_description: data.description,
    p_logo_url: logoUrl,
    p_trade_license_url: tradeLicenseUrl,
    p_new_product_photo_urls: newProductPhotoUrls,
  });
  if (updateError) {
    await cleanupUploadedObjects(supabase, uploadedObjects);
    if (updateError.code === "23505") {
      return fail("That email or phone number is already in use by another account.");
    }
    return fail("Could not save your profile. Please try again.");
  }

  if (uploadedLogoPath) {
    await removeSupersededOwnedFile(
      supabase,
      "business-logos",
      getOwnedPublicFilePath(supabase, "business-logos", business.logo_url, authUser.id),
      uploadedLogoPath,
      authUser.id
    );
  }
  if (uploadedTradeLicensePath) {
    await removeSupersededOwnedFile(
      supabase,
      "trade-licenses",
      business.trade_license_url,
      uploadedTradeLicensePath,
      authUser.id
    );
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
    newValue: { business_name: data.businessName, email: data.email, phone: normalizedPhone, category_id: data.categoryId },
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

  // Vendors have no direct UPDATE grant on businesses — this function only
  // ever moves profile_incomplete/rejected -> pending_review.
  const { error } = await supabase.rpc("submit_business_profile_for_review");

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

  await sendTrustedNotification({ businessId: business.id, templateKey: "profile_submitted" });

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
    .select(
      "id, registration_status, registration_opens_at, registration_closes_at, end_at, is_archived"
    )
    .eq("id", eventId)
    .maybeSingle();

  if (!event || !isEventRegistrationOpen(event)) {
    return fail("This event is not currently open for registration.");
  }
  if (business.requires_reapproval) {
    return fail(
      "Your updated business profile must be approved before you can apply to this event."
    );
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

  // The actual write happens in a SECURITY DEFINER function (vendors have no
  // direct INSERT/UPDATE grant on applications — see migration 0008) so it
  // re-validates business approval, event status, and duplicate-application
  // rules server-side regardless of what this pre-check already confirmed.
  const { data: application, error } = await supabase.rpc("apply_to_event", { p_event_id: eventId });
  if (error) {
    if (error.message.includes("EVENT_NOT_OPEN")) {
      return fail("This event is no longer open for registration.");
    }
    if (error.message.includes("BUSINESS_REAPPROVAL_REQUIRED")) {
      return fail("Your updated business profile must be approved before you can apply.");
    }
    if (error.message.includes("BUSINESS_NOT_APPROVED")) {
      return fail("Your business must be approved before applying to an event.");
    }
    if (error.message.includes("ALREADY_APPLIED")) {
      return fail("You've already applied to this event.");
    }
    return fail("Could not submit your application. Please try again.");
  }

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "vendor",
    action: "application.submitted",
    entityType: "application",
    entityId: application?.id ?? null,
    newValue: { event_id: eventId, status: application?.status },
  });

  revalidatePath("/vendor");
  return { ok: true };
}
