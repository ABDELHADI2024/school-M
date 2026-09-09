import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isPlatformOwnerEmail } from '@/lib/platform-owner';
import { devLog } from '@/lib/logger';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — writes updated tokens to cookies
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // --- Public routes (no auth required) ---
  // Les routes /api/* sont accessibles sans session : chaque route handler
  // gère sa propre authentification/autorisation.
  const isPublicRoute =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api');

  // --- Auth required: redirect to /login?redirect=... if not authenticated ---
  if (!isPublicRoute && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // --- Already logged in: redirect away from login/signup ---
  if (user && (pathname === '/login' || pathname === '/signup')) {
    devLog('[BLOCAGE ROUTE]', {
      fichier: 'proxy',
      reason: 'already_logged_in_on_auth_page',
      user: user.id,
      role: null,
      schoolSlug: null,
    });
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/';
    return NextResponse.redirect(homeUrl);
  }

  // --- Super Admin route protection ---
  if (pathname.startsWith('/super-admin')) {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const role = profile?.role ?? null;
    // Propriétaire de la plateforme : SUPER_ADMIN_OVERRIDE_EMAIL ou fallback galaxprap@gmail.com.
    const isOwner = isPlatformOwnerEmail(user.email);

    devLog(`[proxy] /super-admin — user=${user.email} role=${role} isOwner=${isOwner}`);

    // Accès PRIORITAIRE : le rôle super_admin (via user_profiles) prime sur tout,
    // y compris lorsque school_id est null — aucune redirection vers un dashboard école.
    const canAccess = isOwner || role === 'super_admin';

    if (!canAccess) {
      devLog('[BLOCAGE ROUTE]', {
        fichier: 'proxy',
        reason: 'not_super_admin',
        user: user.id,
        role,
        schoolSlug: null,
      });

      // Renvoyer vers l'espace école s'il en a un, sinon l'accueil.
      const { data: myProfile } = await supabase
        .from('user_profiles')
        .select('school_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (myProfile?.school_id) {
        const { data: mySchool } = await supabase
          .from('schools')
          .select('slug')
          .eq('id', myProfile.school_id)
          .single();
        if (mySchool?.slug) {
          const homeUrl = request.nextUrl.clone();
          homeUrl.pathname = `/${mySchool.slug}/dashboard`;
          return NextResponse.redirect(homeUrl);
        }
      }
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = '/';
      return NextResponse.redirect(homeUrl);
    }
  }

  // --- School Dashboard route protection ---
  const schoolMatch = pathname.match(/^\/([^/]+)\/dashboard/);
  if (schoolMatch) {
    const schoolSlug = schoolMatch[1];

    // super_admin or owner: full access to every school
    const isOwner = isPlatformOwnerEmail(user?.email);
    const { data: myProfile } = user
      ? await supabase
          .from('user_profiles')
          .select('role')
          .eq('user_id', user.id)
          .single()
      : { data: null };

    const myRole = myProfile?.role ?? null;

    // Rôle parent : JAMAIS d'accès au dashboard école — redirection stricte
    // vers le portail parent dédié (responsive).
    if (myRole === 'parent') {
      devLog('[BLOCAGE ROUTE]', {
        fichier: 'proxy',
        reason: 'parent_not_allowed_on_dashboard',
        user: user?.id,
        role: myRole,
        schoolSlug,
      });
      const parentUrl = request.nextUrl.clone();
      parentUrl.pathname = `/${schoolSlug}/parent`;
      return NextResponse.redirect(parentUrl);
    }

    if (isOwner || myRole === 'super_admin') {
      devLog(`[proxy] /${schoolSlug}/dashboard — user=${user?.email} role=${myRole} (full access)`);
      return supabaseResponse;
    }

    // For other users: verify membership via school_id
    const { data: school, error: schoolError } = await supabase
      .from('schools')
      .select('id')
      .eq('slug', schoolSlug)
      .single();

    if (schoolError || !school) {
      devLog('[BLOCAGE ROUTE]', {
        fichier: 'proxy',
        reason: 'school_not_found',
        user: user?.id,
        role: myRole,
        schoolSlug,
        schoolError: schoolError?.message,
      });
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = '/';
      return NextResponse.redirect(homeUrl);
    }

    const { data: membership } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user!.id)
      .eq('school_id', school.id)
      .single();

    if (!membership) {
      // Allowed: authenticated + school exists. Membership is only logged for diagnosis, not blocking.
      devLog('[BLOCAGE ROUTE]', {
        fichier: 'proxy',
        reason: 'not_a_member_but_allowed',
        user: user!.id,
        role: myRole,
        schoolSlug,
        schoolId: school.id,
      });
    } else {
      devLog(`[proxy] /${schoolSlug}/dashboard — user=${user!.email} role=${membership.role} (member)`);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
