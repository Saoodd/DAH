"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { loginAction } from "@/app/auth/actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  function onSubmit(values: LoginInput) {
    setServerError(null);
    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);

    startTransition(async () => {
      const result = await loginAction(formData);
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      router.push(next && next.startsWith("/") ? next : "/vendor");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <Alert variant="error">{serverError}</Alert>}

      <Field label="Email address" htmlFor="email" error={errors.email?.message} required>
        <Input id="email" type="email" autoComplete="email" {...register("email")} aria-invalid={!!errors.email} />
      </Field>

      <Field label="Password" htmlFor="password" error={errors.password?.message} required>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register("password")}
          aria-invalid={!!errors.password}
        />
      </Field>

      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          Forgot password?
        </Link>
      </div>

      <Button type="submit" className="w-full" loading={isPending}>
        Log in
      </Button>
    </form>
  );
}
