"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { eventFormSchema, type EventFormInput } from "@/lib/validations/event";
import { createEventAction, updateEventAction } from "@/app/admin/events/actions";
import { applyServerFieldErrors } from "@/lib/form-errors";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { FileInput } from "@/components/ui/file-input";
import { useToast } from "@/components/ui/toast";

/** Visual grouping only — the form still submits as a single FormData POST. */
function FormSection({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description: string;
  className?: string;
  children: React.ReactNode;
}) {
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId} className={className}>
      <div>
        <h2 id={headingId} className="text-base font-semibold tracking-tight text-ink-900">
          {title}
        </h2>
        <p className="mt-0.5 text-body-sm text-ink-500">{description}</p>
      </div>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function datetimeLocalToIso(value: string | undefined): string {
  if (!value) return "";
  return new Date(value).toISOString();
}

export interface EventFormDefaults {
  name: string;
  location: string;
  description: string;
  vendorRules: string;
  setupInstructions: string;
  startAt: string | null;
  endAt: string | null;
  setupStartAt: string | null;
  setupEndAt: string | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  paymentDeadlineMinutes: number;
  boothLockMinutes: number;
  recommendationsEnabled: boolean;
  boothChangesLocked: boolean;
}

interface EventFormProps {
  eventId?: string;
  bannerUrl?: string | null;
  defaultValues?: Partial<EventFormDefaults>;
}

const emptyDefaults: EventFormDefaults = {
  name: "",
  location: "",
  description: "",
  vendorRules: "",
  setupInstructions: "",
  startAt: null,
  endAt: null,
  setupStartAt: null,
  setupEndAt: null,
  registrationOpensAt: null,
  registrationClosesAt: null,
  paymentDeadlineMinutes: 60,
  boothLockMinutes: 5,
  recommendationsEnabled: true,
  boothChangesLocked: false,
};

export function EventForm({ eventId, bannerUrl, defaultValues }: EventFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [banner, setBanner] = React.useState<File | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const merged = { ...emptyDefaults, ...defaultValues };

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EventFormInput>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      name: merged.name,
      location: merged.location,
      description: merged.description,
      vendorRules: merged.vendorRules,
      setupInstructions: merged.setupInstructions,
      startAt: toDatetimeLocal(merged.startAt),
      endAt: toDatetimeLocal(merged.endAt),
      setupStartAt: toDatetimeLocal(merged.setupStartAt),
      setupEndAt: toDatetimeLocal(merged.setupEndAt),
      registrationOpensAt: toDatetimeLocal(merged.registrationOpensAt),
      registrationClosesAt: toDatetimeLocal(merged.registrationClosesAt),
      paymentDeadlineMinutes: merged.paymentDeadlineMinutes,
      boothLockMinutes: merged.boothLockMinutes,
      recommendationsEnabled: merged.recommendationsEnabled,
      boothChangesLocked: merged.boothChangesLocked,
    },
  });

  function onSubmit(values: EventFormInput) {
    setServerError(null);
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("location", values.location ?? "");
    formData.set("description", values.description ?? "");
    formData.set("vendorRules", values.vendorRules ?? "");
    formData.set("setupInstructions", values.setupInstructions ?? "");
    formData.set("startAt", datetimeLocalToIso(values.startAt));
    formData.set("endAt", datetimeLocalToIso(values.endAt));
    formData.set("setupStartAt", datetimeLocalToIso(values.setupStartAt));
    formData.set("setupEndAt", datetimeLocalToIso(values.setupEndAt));
    formData.set("registrationOpensAt", datetimeLocalToIso(values.registrationOpensAt));
    formData.set("registrationClosesAt", datetimeLocalToIso(values.registrationClosesAt));
    formData.set("paymentDeadlineMinutes", String(values.paymentDeadlineMinutes));
    formData.set("boothLockMinutes", String(values.boothLockMinutes));
    if (values.recommendationsEnabled) formData.set("recommendationsEnabled", "on");
    if (values.boothChangesLocked) formData.set("boothChangesLocked", "on");
    if (banner) formData.set("banner", banner);

    startTransition(async () => {
      const result = eventId ? await updateEventAction(eventId, formData) : await createEventAction(formData);
      if (result && !result.ok) {
        applyServerFieldErrors(setError, result.fieldErrors);
        setServerError(result.error);
        return;
      }
      if (eventId) {
        toast({ title: "Event saved", variant: "success" });
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8" noValidate encType="multipart/form-data">
      {serverError && <Alert variant="error">{serverError}</Alert>}

      <FormSection title="Basics" description="The name vendors will see, and where the event takes place.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Event name" htmlFor="name" error={errors.name?.message} required>
            <Input id="name" maxLength={120} {...register("name")} aria-invalid={!!errors.name} />
          </Field>
          <Field label="Location" htmlFor="location" error={errors.location?.message}>
            <Input
              id="location"
              placeholder="e.g. Dubai Design District"
              maxLength={200}
              {...register("location")}
              aria-invalid={!!errors.location}
            />
          </Field>
        </div>

        <Field label="Event banner" htmlFor="banner" hint="Optional — PNG, JPEG, or WEBP, up to 5 MB">
          <FileInput
            id="banner"
            accept="image/png,image/jpeg,image/webp"
            onFilesChange={(files) => setBanner(files[0] ?? null)}
            previewUrls={bannerUrl ? [bannerUrl] : []}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Schedule"
        description="When the event runs, and when vendors can set up."
        className="border-t border-ink-100 pt-8"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date & time" htmlFor="startAt" error={errors.startAt?.message} required>
            <Input id="startAt" type="datetime-local" {...register("startAt")} aria-invalid={!!errors.startAt} />
          </Field>
          <Field label="End date & time" htmlFor="endAt" error={errors.endAt?.message} required>
            <Input id="endAt" type="datetime-local" {...register("endAt")} aria-invalid={!!errors.endAt} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Setup start" htmlFor="setupStartAt" hint="Optional" error={errors.setupStartAt?.message}>
            <Input
              id="setupStartAt"
              type="datetime-local"
              {...register("setupStartAt")}
              aria-invalid={!!errors.setupStartAt}
            />
          </Field>
          <Field label="Setup end" htmlFor="setupEndAt" hint="Optional" error={errors.setupEndAt?.message}>
            <Input
              id="setupEndAt"
              type="datetime-local"
              {...register("setupEndAt")}
              aria-invalid={!!errors.setupEndAt}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Registration window"
        description="Leave either empty to open or close registration manually."
        className="border-t border-ink-100 pt-8"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Registration opens"
            htmlFor="registrationOpensAt"
            hint="Optional"
            error={errors.registrationOpensAt?.message}
          >
            <Input
              id="registrationOpensAt"
              type="datetime-local"
              {...register("registrationOpensAt")}
              aria-invalid={!!errors.registrationOpensAt}
            />
          </Field>
          <Field
            label="Registration closes"
            htmlFor="registrationClosesAt"
            hint="Optional"
            error={errors.registrationClosesAt?.message}
          >
            <Input
              id="registrationClosesAt"
              type="datetime-local"
              {...register("registrationClosesAt")}
              aria-invalid={!!errors.registrationClosesAt}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Vendor-facing content"
        description="Shown on every vendor's dashboard once they apply."
        className="border-t border-ink-100 pt-8"
      >
        <Field label="Description" htmlFor="description" error={errors.description?.message}>
          <Textarea id="description" rows={3} maxLength={3000} {...register("description")} aria-invalid={!!errors.description} />
        </Field>

        <Field label="Vendor rules" htmlFor="vendorRules" error={errors.vendorRules?.message}>
          <Textarea id="vendorRules" rows={3} maxLength={10000} {...register("vendorRules")} aria-invalid={!!errors.vendorRules} />
        </Field>

        <Field label="Setup instructions" htmlFor="setupInstructions" error={errors.setupInstructions?.message}>
          <Textarea
            id="setupInstructions"
            rows={3}
            maxLength={10000}
            {...register("setupInstructions")}
            aria-invalid={!!errors.setupInstructions}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Checkout & booth rules"
        description="How long holds last, and whether vendors can still change booths."
        className="border-t border-ink-100 pt-8"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Payment deadline (minutes)"
            htmlFor="paymentDeadlineMinutes"
            error={errors.paymentDeadlineMinutes?.message}
            hint="How long a vendor has to pay once they reach checkout"
            required
          >
            <Input
              id="paymentDeadlineMinutes"
              type="number"
              min={5}
              max={10080}
              {...register("paymentDeadlineMinutes", { valueAsNumber: true })}
              aria-invalid={!!errors.paymentDeadlineMinutes}
            />
          </Field>
          <Field
            label="Booth hold (minutes)"
            htmlFor="boothLockMinutes"
            error={errors.boothLockMinutes?.message}
            hint="How long a selected booth is held before release"
            required
          >
            <Input
              id="boothLockMinutes"
              type="number"
              min={1}
              max={120}
              {...register("boothLockMinutes", { valueAsNumber: true })}
              aria-invalid={!!errors.boothLockMinutes}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3.5 text-sm text-ink-700 shadow-xs transition-colors hover:border-ink-300 has-checked:border-brand-300 has-checked:bg-brand-50/60">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 accent-brand-700"
              {...register("recommendationsEnabled")}
            />
            <span>
              <span className="block font-medium text-ink-900">Smart booth recommendations</span>
              <span className="mt-0.5 block text-caption text-ink-500">
                Suggest well-matched booths to each vendor during selection.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3.5 text-sm text-ink-700 shadow-xs transition-colors hover:border-ink-300 has-checked:border-brand-300 has-checked:bg-brand-50/60">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 accent-brand-700"
              {...register("boothChangesLocked")}
            />
            <span>
              <span className="block font-medium text-ink-900">Lock booth changes</span>
              <span className="mt-0.5 block text-caption text-ink-500">
                Stop vendors from switching booths after selecting one.
              </span>
            </span>
          </label>
        </div>
      </FormSection>

      <div className="flex justify-end border-t border-ink-100 pt-6">
        <Button type="submit" loading={isPending}>
          {eventId ? "Save changes" : "Create event"}
        </Button>
      </div>
    </form>
  );
}
