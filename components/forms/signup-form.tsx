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
import { Icon } from "@/components/ui/icon";

interface Category {
  id: string;
  name: string;
}

/** Visual grouping only — the form still submits as a single FormData POST. */
function FormSection({
  step,
  title,
  description,
  className,
  children,
}: {
  step: string;
  title: string;
  description: string;
  className?: string;
  children: React.ReactNode;
}) {
  const headingId = `signup-section-${step}`;
  return (
    <section aria-labelledby={headingId} className={className}>
      <div className="flex items-start gap-3.5">
        <span
          className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-brand-50 font-display text-sm font-semibold text-brand-700 ring-1 ring-brand-200"
          aria-hidden="true"
        >
          {step}
        </span>
        <div>
          <h2 id={headingId} className="text-base font-semibold tracking-tight text-ink-900">
            {title}
          </h2>
          <p className="mt-0.5 text-body-sm text-ink-500">{description}</p>
        </div>
      </div>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
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
      <div className="py-6 text-center" role="status">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <Icon name="mail" strokeWidth={1.5} className="h-6 w-6" />
        </div>
        <h2 className="mt-5 font-display text-h3 text-ink-950">Check your inbox</h2>
        <p className="mx-auto mt-3 max-w-sm text-body-sm text-ink-500">
          We&rsquo;ve sent a verification link to your email address. Click it to activate your account, then log in
          to complete your profile.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8" noValidate encType="multipart/form-data">
      {serverError && <Alert variant="error">{serverError}</Alert>}

      <FormSection step="1" title="Your business" description="Who you are and what you sell.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" htmlFor="businessName" error={errors.businessName?.message} required>
            <Input id="businessName" {...register("businessName")} aria-invalid={!!errors.businessName} />
          </Field>
          <Field label="Owner's full name" htmlFor="ownerName" error={errors.ownerName?.message} required>
            <Input id="ownerName" {...register("ownerName")} aria-invalid={!!errors.ownerName} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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
          <Field
            label="Business Instagram username"
            htmlFor="instagramUsername"
            error={errors.instagramUsername?.message}
            hint="Optional — helps our team get to know your brand"
          >
            <Input
              id="instagramUsername"
              placeholder="@yourbusiness"
              {...register("instagramUsername")}
              aria-invalid={!!errors.instagramUsername}
            />
          </Field>
        </div>

        <Field
          label="Short business description"
          htmlFor="description"
          error={errors.description?.message}
          hint="What do you sell, and what makes it special? A sentence or two is perfect."
          required
        >
          <Textarea id="description" rows={4} {...register("description")} aria-invalid={!!errors.description} />
        </Field>
      </FormSection>

      <FormSection
        step="2"
        title="Contact & sign-in"
        description="How we reach you, and how you'll log in."
        className="border-t border-ink-100 pt-8"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email address" htmlFor="email" error={errors.email?.message} required>
            <Input id="email" type="email" autoComplete="email" {...register("email")} aria-invalid={!!errors.email} />
          </Field>
          <Field label="UAE phone number" htmlFor="phone" error={errors.phone?.message} hint="e.g. 050 123 4567" required>
            <Input id="phone" type="tel" {...register("phone")} aria-invalid={!!errors.phone} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Password"
            htmlFor="password"
            error={errors.password?.message}
            hint="8+ characters, with at least one letter and one number"
            required
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...register("password")}
              aria-invalid={!!errors.password}
            />
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
      </FormSection>

      <FormSection
        step="3"
        title="Documents"
        description="Only your logo is needed now — the rest you can add anytime from your dashboard."
        className="border-t border-ink-100 pt-8"
      >
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
      </FormSection>

      <div className="border-t border-ink-100 pt-6">
        <Button type="submit" size="lg" className="w-full" loading={isPending}>
          Create account
        </Button>
        <p className="mt-4 text-center text-xs text-ink-400">
          By continuing, you confirm the information is accurate and agree to receive event-related messages.
        </p>
      </div>
    </form>
  );
}
