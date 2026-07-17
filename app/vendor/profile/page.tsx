import type { Metadata } from "next";
import { getOwnedBusiness } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { getSignedFileUrl } from "@/lib/storage";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BusinessProfileForm } from "@/components/forms/business-profile-form";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Business Profile" };

export default async function VendorProfilePage() {
  const business = await getOwnedBusiness();
  const supabase = await createClient();
  const { data: categories } = await supabase.from("categories").select("id, name").order("sort_order");

  if (!business) {
    return (
      <Alert variant="error" title="Profile not found">
        Please contact support — your account has no linked business profile.
      </Alert>
    );
  }

  const tradeLicenseSignedUrl = business.trade_license_url
    ? await getSignedFileUrl(supabase, "trade-licenses", business.trade_license_url)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-950">Business profile</h1>
        <p className="mt-1 text-sm text-ink-500">
          This information is saved permanently and reused for every future Dar Al Hay event.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Editing after approval requires a quick admin re-review.</CardDescription>
        </CardHeader>
        <CardContent>
          <BusinessProfileForm
            categories={categories ?? []}
            defaultValues={{
              businessName: business.business_name,
              ownerName: business.owner_name,
              email: business.email,
              phone: business.phone,
              instagramUsername: business.instagram_username ?? "",
              categoryId: business.category_id ?? "",
              description: business.description ?? "",
            }}
            logoUrl={business.logo_url}
            productPhotoUrls={business.product_photo_urls ?? []}
            tradeLicenseSignedUrl={tradeLicenseSignedUrl}
          />
        </CardContent>
      </Card>
    </div>
  );
}
