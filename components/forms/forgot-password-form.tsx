"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { forgotPasswordAction } from "@/app/auth/actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Icon } from "@/components/ui/icon";

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ email: string }>({ resolver: zodResolver(forgotPasswordSchema) });

  function onSubmit(values: { email: string }) {
    const formData = new FormData();
    formData.set("email", values.email);
    startTransition(async () => {
      setServerError(null);
      const result = await forgotPasswordAction(formData);
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      setSentTo(values.email);
    });
  }

  if (sentTo) {
    return (
      <div className="py-4 text-center" role="status">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <Icon name="mail" strokeWidth={1.5} />
        </div>
        <h2 className="mt-4 font-display text-h4 text-ink-950">Check your email</h2>
        <p className="mx-auto mt-2 max-w-xs text-body-sm text-ink-500">
          If an account exists for <span className="font-medium text-ink-700">{sentTo}</span>, a password reset link
          is on its way. It can take a minute to arrive.
        </p>
        <Button type="button" variant="outline" className="mt-6 w-full" onClick={() => setSentTo(null)}>
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {serverError ? <Alert variant="error">{serverError}</Alert> : null}
      <Field label="Email address" htmlFor="email" error={errors.email?.message} required>
        <Input id="email" type="email" autoComplete="email" {...register("email")} aria-invalid={!!errors.email} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={isPending}>
        Send reset link
      </Button>
    </form>
  );
}
