"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema, type SignupInput } from "@/lib/validations/auth";
import { signupAction } from "@/app/auth/actions";
import { applyServerFieldErrors } from "@/lib/form-errors";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { FileInput } from "@/components/ui/file-input";

interface Category {
  id: string;
  name: string;
}

export function SignupForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const [logo, setLogo] = React.useState<File | null>(null);
  const [tradeLicense, setTradeLicense] = React.useState<File | null>(null);
  const [productPhotos, setProductPhotos] = React.useState<File[]>([]);
  const [fileErrors, setFileErrors] = React.useState<Record<string, string>>({});

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });

  function onSubmit(values: SignupInput) {
    setServerError(null);
    setFileErrors({});

    if (!logo) {
      setFileErrors({ logo: "Upload a business logo to continue." });
      document.getElementById("logo")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const formData = new FormData();
    formData.set("businessName", values.businessName);
    formData.set("ownerName", values.ownerName);
    formData.set("email", values.email);
    formData.set("phone", values.phone);
    formData.set("instagramUsername", values.instagramUsername ?? "");
    formData.set("categoryId", values.categoryId);
    formData.set("description", values.description);
    formData.set("password", values.password);
    formData.set("confirmPassword", values.confirmPassword);
    formData.set("logo", logo);
    if (tradeLicense) formData.set("tradeLicense", tradeLicense);
    productPhotos.forEach((photo) => formData.append("productPhotos", photo));

    startTransition(async () => {
      const result = await signupAction(formData);
      if (!result.ok) {
        applyServerFieldErrors(setError, result.fieldErrors);
        const fileFieldNames = ["logo", "tradeLicense", "productPhotos"] as const;
        const nextFileErrors: Record<string, string> = {};
        for (const name of fileFieldNames) {
          const message = result.fieldErrors?.[name]?.[0];
          if (message) nextFileErrors[name] = message;
        }
        setFileErrors(nextFileErrors);
        setServerError(result.error);
        return;
      }
      if (result.needsEmailConfirmation) {
        setNeedsConfirmation(true);
        return;
      }
      router.push("/vendor");
      router.refresh();
    });
  }

  if (needsConfirmation) {
    return (
      <Alert variant="success" title="Check your inbox">
        We&rsquo;ve sent a verification link to your email address. Click it to activate your account,
        then log in to complete your profile.
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate encType="multipart/form-data">
      {serverError && <Alert variant="error">{serverError}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name" htmlFor="businessName" error={errors.businessName?.message} required>
          <Input id="businessName" {...register("businessName")} aria-invalid={!!errors.businessName} />
        </Field>
        <Field label="Owner's full name" htmlFor="ownerName" error={errors.ownerName?.message} required>
          <Input id="ownerName" {...register("ownerName")} aria-invalid={!!errors.ownerName} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email address" htmlFor="email" error={errors.email?.message} required>
          <Input id="email" type="email" autoComplete="email" {...register("email")} aria-invalid={!!errors.email} />
        </Field>
        <Field label="UAE phone number" htmlFor="phone" error={errors.phone?.message} hint="e.g. 050 123 4567" required>
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
          <Select id="categoryId" defaultValue="" {...register("categoryId")} aria-invalid={!!errors.categoryId}>
            <option value="" disabled>
              Select a category
            </option>
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Password" htmlFor="password" error={errors.password?.message} required>
          <Input id="password" type="password" autoComplete="new-password" {...register("password")} aria-invalid={!!errors.password} />
        </Field>
        <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword?.message} required>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            {...register("confirmPassword")}
            aria-invalid={!!errors.confirmPassword}
          />
        </Field>
      </div>

      <Field label="Business logo" htmlFor="logo" error={fileErrors.logo} required>
        <FileInput
          id="logo"
          accept="image/png,image/jpeg,image/webp"
          onFilesChange={(files) => setLogo(files[0] ?? null)}
          hint="PNG, JPEG, or WEBP — up to 3MB"
        />
      </Field>

      <Field
        label="Trade licence"
        htmlFor="tradeLicense"
        error={fileErrors.tradeLicense}
        hint="Optional — PNG, JPEG, WEBP, or PDF, up to 8MB"
      >
        <FileInput
          id="tradeLicense"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          onFilesChange={(files) => setTradeLicense(files[0] ?? null)}
        />
      </Field>

      <Field
        label="Product photos"
        htmlFor="productPhotos"
        error={fileErrors.productPhotos}
        hint="Optional — up to 6 photos, 5MB each"
      >
        <FileInput
          id="productPhotos"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onFilesChange={(files) => setProductPhotos(files.slice(0, 6))}
        />
      </Field>

      <Button type="submit" className="w-full" loading={isPending}>
        Create account
      </Button>
      <p className="text-center text-xs text-ink-400">
        By continuing you agree to Dar Al Hay Events&rsquo; vendor terms.
      </p>
    </form>
  );
}
