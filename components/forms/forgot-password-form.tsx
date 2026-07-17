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

export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = React.useState(false);
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
      await forgotPasswordAction(formData);
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <Alert variant="success" title="Check your email">
        If an account exists for that address, we&rsquo;ve sent a password reset link.
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field label="Email address" htmlFor="email" error={errors.email?.message} required>
        <Input id="email" type="email" autoComplete="email" {...register("email")} aria-invalid={!!errors.email} />
      </Field>
      <Button type="submit" className="w-full" loading={isPending}>
        Send reset link
      </Button>
    </form>
  );
}
