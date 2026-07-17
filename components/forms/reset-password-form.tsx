"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { resetPasswordAction } from "@/app/auth/actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function ResetPasswordForm() {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ password: string; confirmPassword: string }>({ resolver: zodResolver(resetPasswordSchema) });

  function onSubmit(values: { password: string; confirmPassword: string }) {
    setServerError(null);
    const formData = new FormData();
    formData.set("password", values.password);
    formData.set("confirmPassword", values.confirmPassword);

    startTransition(async () => {
      const result = await resetPasswordAction(formData);
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push("/vendor"), 1500);
    });
  }

  if (success) {
    return <Alert variant="success" title="Password updated">Redirecting to your dashboard…</Alert>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <Alert variant="error">{serverError}</Alert>}

      <Field label="New password" htmlFor="password" error={errors.password?.message} required>
        <Input id="password" type="password" autoComplete="new-password" {...register("password")} aria-invalid={!!errors.password} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword?.message} required>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          {...register("confirmPassword")}
          aria-invalid={!!errors.confirmPassword}
        />
      </Field>
      <Button type="submit" className="w-full" loading={isPending}>
        Update password
      </Button>
    </form>
  );
}
