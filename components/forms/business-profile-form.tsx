"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { businessProfileSchema, type BusinessProfileInput } from "@/lib/validations/business";
import { updateBusinessProfileAction } from "@/app/vendor/actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { useToast } from "@/components/ui/toast";
import { applyServerFieldErrors } from "@/lib/form-errors";

interface Category {
  id: string;
  name: string;
}

interface BusinessProfileFormProps {
  categories: Category[];
  defaultValues: BusinessProfileInput;
  logoUrl: string | null;
  productPhotoUrls: string[];
  tradeLicenseSignedUrl: string | null;
}

export function BusinessProfileForm({
  categories,
  defaultValues,
  logoUrl,
  productPhotoUrls,
  tradeLicenseSignedUrl,
}: BusinessProfileFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = React.useTransition();
  const [logo, setLogo] = React.useState<File | null>(null);
  const [tradeLicense, setTradeLicense] = React.useState<File | null>(null);
  const [productPhotos, setProductPhotos] = React.useState<File[]>([]);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<BusinessProfileInput>({ resolver: zodResolver(businessProfileSchema), defaultValues });

  function onSubmit(values: BusinessProfileInput) {
    const formData = new FormData();
    formData.set("businessName", values.businessName);
    formData.set("ownerName", values.ownerName);
    formData.set("email", values.email);
    formData.set("phone", values.phone);
    formData.set("instagramUsername", values.instagramUsername ?? "");
    formData.set("categoryId", values.categoryId);
    formData.set("description", values.description);
    if (logo) formData.set("logo", logo);
    if (tradeLicense) formData.set("tradeLicense", tradeLicense);
    productPhotos.forEach((photo) => formData.append("productPhotos", photo));

    startTransition(async () => {
      const result = await updateBusinessProfileAction(formData);
      if (!result.ok) {
        applyServerFieldErrors(setError, result.fieldErrors);
        toast({ title: "Couldn't save changes", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Profile saved", variant: "success" });
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate encType="multipart/form-data">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" htmlFor="businessName" error={errors.businessName?.message} required>
          <Input id="businessName" {...register("businessName")} aria-invalid={!!errors.businessName} />
        </Field>
        <Field label="Owner's full name" htmlFor="ownerName" error={errors.ownerName?.message} required>
          <Input id="ownerName" {...register("ownerName")} aria-invalid={!!errors.ownerName} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Email address"
          htmlFor="email"
          error={errors.email?.message}
          hint="Contact support to change this verified account email."
          required
        >
          <Input id="email" type="email" readOnly {...register("email")} aria-invalid={!!errors.email} />
        </Field>
        <Field label="UAE phone number" htmlFor="phone" error={errors.phone?.message} required>
          <Input id="phone" type="tel" {...register("phone")} aria-invalid={!!errors.phone} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business Instagram username" htmlFor="instagramUsername" error={errors.instagramUsername?.message}>
          <Input
            id="instagramUsername"
            placeholder="@yourbusiness"
            {...register("instagramUsername")}
            aria-invalid={!!errors.instagramUsername}
          />
        </Field>
        <Field label="Business category" htmlFor="categoryId" error={errors.categoryId?.message} required>
          <Select id="categoryId" {...register("categoryId")} aria-invalid={!!errors.categoryId}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Short business description" htmlFor="description" error={errors.description?.message} required>
        <Textarea id="description" rows={3} {...register("description")} aria-invalid={!!errors.description} />
      </Field>

      <Field label="Business logo" htmlFor="logo">
        <FileInput
          id="logo"
          accept="image/png,image/jpeg,image/webp"
          onFilesChange={(files) => setLogo(files[0] ?? null)}
          previewUrls={logoUrl ? [logoUrl] : []}
          hint="Upload to replace the current logo"
        />
      </Field>

      <Field label="Trade licence" htmlFor="tradeLicense" hint="Optional — upload to replace the current file">
        <FileInput
          id="tradeLicense"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          onFilesChange={(files) => setTradeLicense(files[0] ?? null)}
        />
        {tradeLicenseSignedUrl && (
          <a
            href={tradeLicenseSignedUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            View current trade licence
          </a>
        )}
      </Field>

      <Field label="Product photos" htmlFor="productPhotos" hint="Add up to 6 photos total">
        <FileInput
          id="productPhotos"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onFilesChange={(files) => setProductPhotos(files)}
          previewUrls={productPhotoUrls}
        />
      </Field>

      <Button type="submit" loading={isPending}>
        Save changes
      </Button>
    </form>
  );
}
