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

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
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
    formData.set("startAt", values.startAt);
    formData.set("endAt", values.endAt);
    formData.set("setupStartAt", values.setupStartAt ?? "");
    formData.set("setupEndAt", values.setupEndAt ?? "");
    formData.set("registrationOpensAt", values.registrationOpensAt ?? "");
    formData.set("registrationClosesAt", values.registrationClosesAt ?? "");
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate encType="multipart/form-data">
      {serverError && <Alert variant="error">{serverError}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Event name" htmlFor="name" error={errors.name?.message} required>
          <Input id="name" {...register("name")} aria-invalid={!!errors.name} />
        </Field>
        <Field label="Location" htmlFor="location" error={errors.location?.message}>
          <Input id="location" placeholder="e.g. Dubai Design District" {...register("location")} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date & time" htmlFor="startAt" error={errors.startAt?.message} required>
          <Input id="startAt" type="datetime-local" {...register("startAt")} aria-invalid={!!errors.startAt} />
        </Field>
        <Field label="End date & time" htmlFor="endAt" error={errors.endAt?.message} required>
          <Input id="endAt" type="datetime-local" {...register("endAt")} aria-invalid={!!errors.endAt} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Setup start" htmlFor="setupStartAt" hint="Optional">
          <Input id="setupStartAt" type="datetime-local" {...register("setupStartAt")} />
        </Field>
        <Field label="Setup end" htmlFor="setupEndAt" hint="Optional">
          <Input id="setupEndAt" type="datetime-local" {...register("setupEndAt")} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Registration opens" htmlFor="registrationOpensAt" hint="Optional — informational only">
          <Input id="registrationOpensAt" type="datetime-local" {...register("registrationOpensAt")} />
        </Field>
        <Field label="Registration closes" htmlFor="registrationClosesAt" hint="Optional — informational only">
          <Input id="registrationClosesAt" type="datetime-local" {...register("registrationClosesAt")} />
        </Field>
      </div>

      <Field label="Description" htmlFor="description" error={errors.description?.message}>
        <Textarea id="description" rows={3} {...register("description")} />
      </Field>

      <Field label="Vendor rules" htmlFor="vendorRules" error={errors.vendorRules?.message}>
        <Textarea id="vendorRules" rows={3} {...register("vendorRules")} />
      </Field>

      <Field label="Setup instructions" htmlFor="setupInstructions" error={errors.setupInstructions?.message}>
        <Textarea id="setupInstructions" rows={3} {...register("setupInstructions")} />
      </Field>

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
            {...register("paymentDeadlineMinutes", { valueAsNumber: true })}
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
            {...register("boothLockMinutes", { valueAsNumber: true })}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" {...register("recommendationsEnabled")} />
          Enable smart booth recommendations
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" {...register("boothChangesLocked")} />
          Lock booth changes
        </label>
      </div>

      <Field label="Event banner" htmlFor="banner" hint="Optional">
        <FileInput
          id="banner"
          accept="image/png,image/jpeg,image/webp"
          onFilesChange={(files) => setBanner(files[0] ?? null)}
          previewUrls={bannerUrl ? [bannerUrl] : []}
        />
      </Field>

      <Button type="submit" loading={isPending}>
        {eventId ? "Save changes" : "Create event"}
      </Button>
    </form>
  );
}
