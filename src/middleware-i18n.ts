import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { locales, defaultLocale, Locale } from '@/i18n';

const LOCALE_COOKIE_NAME = 'zaltyko-locale';

function getLocaleFromRequest(request: NextRequest): Locale {
  // 1. Check cookie first
  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;

  if (cookieLocale === 'es' || cookieLocale === 'en') {
    return cookieLocale;
  }

  // 2. Check Accept-Language header
  const acceptLanguage = request.headers.get('accept-language');

  if (acceptLanguage) {
    const normalizedLocale = acceptLanguage.toLowerCase().split('-')[0];

    if (normalizedLocale === 'en') return 'en';
    if (normalizedLocale === 'es') return 'es';
  }

  return defaultLocale;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip for API routes, static files, auth routes, and internal paths
  // Auth routes (/login, /auth/*) should not be redirected to locale
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/invite') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check if pathname already has a locale
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (pathnameHasLocale) {
    return NextResponse.next();
  }

  // Redirect to the same path with locale
  const locale = getLocaleFromRequest(request);
  const newUrl = new URL(`/${locale}${pathname}`, request.url);

  // Copy query params
  request.nextUrl.searchParams.forEach((value, key) => {
    newUrl.searchParams.set(key, value);
  });

  const response = NextResponse.redirect(newUrl);

  // Set cookie for future requests
  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    httpOnly: false, // Allow client-side access
    sameSite: 'lax',
  });

  return response;
}

export const config = {
  // Only run on specific paths (excluding auth routes)
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     * - auth routes (/auth/*, /login, /invite)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*$/|auth/|login|invite).*)',
  ],
};
