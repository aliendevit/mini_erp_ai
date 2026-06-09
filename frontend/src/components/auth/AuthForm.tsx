'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { useI18n } from '../../lib/i18n';

const passwordPattern = /(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+/;
const phonePattern = /^\+?[1-9]\d{7,14}$/;

type AuthFormProps = {
  mode: 'login' | 'signup';
};

type AuthFormValues = {
  email: string;
  password: string;
  phone?: string;
  confirmPassword?: string;
};

export function AuthForm({ mode }: AuthFormProps) {
  const { messages } = useI18n();
  const msgs = messages as any;
  const [status, setStatus] = useState<string>('');

  const loginSchema = z.object({
    email: z.string().min(1, msgs.authPage.validation.emailRequired).email(msgs.authPage.validation.emailInvalid),
    password: z.string().min(8, msgs.authPage.validation.passwordRequired).regex(passwordPattern, msgs.authPage.validation.passwordStrength),
  });

  const signUpSchema = loginSchema.extend({
    phone: z.string().min(1, msgs.authPage.validation.phoneRequired).regex(phonePattern, msgs.authPage.validation.phoneInvalid),
    confirmPassword: z.string().min(1, msgs.authPage.validation.confirmRequired),
  }).superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: msgs.authPage.validation.passwordsMatch,
      });
    }
  });

  const schema = mode === 'signup' ? signUpSchema : loginSchema;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuthFormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<AuthFormValues>,
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      phone: '',
    },
    mode: 'onTouched',
  });

  const onSubmit = (data: AuthFormValues) => {
    const message = mode === 'signup' ? msgs.authPage.validation.successSignup : msgs.authPage.validation.successLogin;
    setStatus(message);
    window.setTimeout(() => setStatus(''), 4500);
    console.log('Auth form submitted', data);
  };

  return (
    <div className="flex items-center justify-center min-h-screen px-12 py-16 bg-slate-900/5">
      <div className="w-[33vw] min-w-[340px] max-w-lg bg-white/6 border border-white/20 backdrop-blur-md rounded-3xl p-8 mx-auto shadow-lg">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-200">{mode === 'login' ? msgs.authPage.loginTitle : msgs.authPage.signupTitle}</p>
          <h2 className="mt-4 text-2xl font-semibold text-white">{mode === 'login' ? msgs.authPage.loginTitle : msgs.authPage.signupTitle}</h2>
        </div>

        <form className="space-y-6 w-full flex flex-col items-center" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className='w-full max-w-[350px] px-4'>
            <label className="block text-left w-full">
              <span className="text-sm font-medium text-slate-200">{msgs.authPage.email}</span>
              <input
                type="email"
                autoComplete="email"
                placeholder={msgs.authPage.emailPlaceholder}
                {...register('email')}
                aria-invalid={!!errors.email}
                className="mt-2 w-full max-w-[300px] mx-auto rounded-xl border border-slate-300 bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
              {errors.email && <p className="mt-2 text-sm text-rose-600">{String(errors.email?.message)}</p>}
            </label>
          </div>

          {mode === 'signup' && (
            <div >
              <label className="block text-left w-full">
                <span className="text-sm font-medium text-slate-200">{msgs.authPage.phone}</span>
                <input
                  type="tel"
                  autoComplete="tel"
                  placeholder={msgs.authPage.phonePlaceholder}
                  {...register('phone')}
                  aria-invalid={!!errors.phone}
                  className="m-2 w-48 mx-auto rounded-xl border border-slate-300 bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
                {errors.phone && <p className="mt-2 text-sm text-rose-600">{String(errors.phone?.message)}</p>}
              </label>
            </div>
          )}

          <div >
            <label className="block text-left w-full">
              <span className="text-sm font-medium text-slate-200">{msgs.authPage.password}</span>
              <input
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={msgs.authPage.passwordPlaceholder}
                {...register('password')}
                aria-invalid={!!errors.password}
                className="mt-2 w-48 mx-auto rounded-xl border border-slate-300 bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
              {errors.password && <p className="mt-2 text-sm text-rose-600">{String(errors.password?.message)}</p>}
            </label>
          </div>

          {mode === 'signup' && (
            <div >
              <label className="block text-left w-full">
                <span className="text-sm font-medium text-slate-200">{msgs.authPage.confirmPassword}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder={msgs.authPage.confirmPasswordPlaceholder}
                  {...register('confirmPassword')}
                  aria-invalid={!!errors.confirmPassword}
                  className="mt-2 w-48 mx-auto rounded-xl border border-slate-300 bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
                {errors.confirmPassword && <p className="mt-2 text-sm text-rose-600">{String(errors.confirmPassword?.message)}</p>}
              </label>
            </div>
          )}

          <div className="pt-2">
            <button type="submit" disabled={isSubmitting} className="btn primary w-full py-3 text-sm font-semibold">
              {mode === 'login' ? msgs.authPage.submitLogin : msgs.authPage.submitSignup}
            </button>
            <p className="mt-3 text-xs text-slate-200 text-center">{msgs.authPage.helperText}</p>
          </div>
        </form>

        {status ? (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 text-center w-full">
            {status}
          </div>
        ) : null}
      </div>
    </div>
  );
}
