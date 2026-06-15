'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { useI18n } from '../../lib/i18n';
import { apiJson } from '../../lib/api';

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

type AuthResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    phone?: string | null;
    companyProfileComplete?: boolean;
  };
};

export function AuthForm({ mode }: AuthFormProps) {
  const { messages } = useI18n();
  const msgs = messages as any;
  const [status, setStatus] = useState<string>('');
  const [apiError, setApiError] = useState<string>('');
  const router = useRouter();

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
    mode: 'onChange',
  });

  const phoneField = register('phone');

  const onSubmit = async (data: AuthFormValues) => {
    setApiError('');
    setStatus('');
    try {
      const response = mode === 'signup'
        ? await apiJson<AuthResponse>('/auth/register', 'POST', {
            email: data.email,
            password: data.password,
            phone: data.phone,
          })
        : await apiJson<AuthResponse>('/auth/login', 'POST', {
            email: data.email,
            password: data.password,
          });

      localStorage.setItem('omran_auth_token', response.token);
      localStorage.setItem('omran_auth_user', JSON.stringify(response.user));
      window.dispatchEvent(new Event('omran-auth-changed'));
      const message = mode === 'signup' ? msgs.authPage.validation.successSignup : msgs.authPage.validation.successLogin;
      setStatus(message);
      router.push(response.user.companyProfileComplete ? '/' : '/setup');
    } catch (error) {
      setApiError(error instanceof Error ? error.message : msgs.authPage.validation.genericError || 'Authentication failed.');
    }
  };

  return (
    <div>
      <div className="auth-hero">
        <h2>{mode === 'login' ? msgs.authPage.loginTitle : msgs.authPage.signupTitle}</h2>
      </div>

      <form className="auth-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="auth-field">
            <label>
              <span>{msgs.authPage.email}</span>
              <input
                type="email"
                autoComplete="email"
                placeholder={msgs.authPage.emailPlaceholder}
                {...register('email')}
                aria-invalid={!!errors.email}
                className="auth-input"
              />
              {errors.email && <p className="auth-error">{String(errors.email?.message)}</p>}
            </label>
          </div>

          {mode === 'signup' && (
            <div className="auth-field">
              <label>
                <span>{msgs.authPage.phone}</span>
                <input
                  type="tel"
                  autoComplete="tel"
                  placeholder={msgs.authPage.phonePlaceholder}
                  {...phoneField}
                  onChange={(event) => {
                    event.currentTarget.value = event.currentTarget.value.replace(/(?!^\+)[^\d]/g, '').replace(/^\+{2,}/, '+');
                    phoneField.onChange(event);
                  }}
                  aria-invalid={!!errors.phone}
                  className="auth-input"
                />
                {errors.phone && <p className="auth-error">{String(errors.phone?.message)}</p>}
              </label>
            </div>
          )}

          <div className="auth-field">
            <label>
              <span>{msgs.authPage.password}</span>
              <input
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={msgs.authPage.passwordPlaceholder}
                {...register('password')}
                aria-invalid={!!errors.password}
                className="auth-input"
              />
              {errors.password && <p className="auth-error">{String(errors.password?.message)}</p>}
            </label>
          </div>

          {mode === 'signup' && (
            <div className="auth-field">
              <label>
                <span>{msgs.authPage.confirmPassword}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder={msgs.authPage.confirmPasswordPlaceholder}
                  {...register('confirmPassword')}
                  aria-invalid={!!errors.confirmPassword}
                  className="auth-input"
                />
                {errors.confirmPassword && <p className="auth-error">{String(errors.confirmPassword?.message)}</p>}
              </label>
            </div>
          )}

          <div className="auth-actions">
            <button type="submit" disabled={isSubmitting} className="btn primary">
              {mode === 'login' ? msgs.authPage.submitLogin : msgs.authPage.submitSignup}
            </button>
            <p className="auth-helper">{msgs.authPage.helperText}</p>
          </div>
      </form>

      {apiError ? (
        <div className="status-msg" role="alert">
          {apiError}
        </div>
      ) : null}

      {status ? (
        <div className="status-msg">
          {status}
        </div>
      ) : null}
    </div>
  );
}
