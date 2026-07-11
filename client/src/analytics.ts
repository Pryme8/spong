/**
 * Analytics and crash reporting.
 * PostHog for funnels/events, Sentry for crash triage.
 * Only active when the respective env keys are set at build time.
 */

import type { App } from 'vue';
import type { Router } from 'vue-router';

// Lazy-import so the SDKs tree-shake when keys are absent.
let posthogInstance: import('posthog-js').PostHog | null = null;

export async function initAnalytics(app: App, router: Router): Promise<void> {
  const posthogKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

  if (sentryDsn) {
    const Sentry = await import('@sentry/vue');
    Sentry.init({
      app,
      dsn: sentryDsn,
      integrations: [Sentry.browserTracingIntegration({ router })],
      tracesSampleRate: 0.1,
      environment: import.meta.env.MODE,
      release: import.meta.env.VITE_APP_VERSION as string | undefined,
    });
  }

  if (posthogKey) {
    const posthog = await import('posthog-js');
    posthog.default.init(posthogKey, {
      api_host: 'https://us.i.posthog.com',
      person_profiles: 'identified_only',
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
    });
    posthogInstance = posthog.default;
  }
}

/** Fire a named game event with optional properties. No-op if PostHog not configured. */
export function trackEvent(event: string, properties?: Record<string, unknown>): void {
  posthogInstance?.capture(event, properties);
}

/** Identify the session with an anonymous guest name. */
export function identifyGuest(displayName: string): void {
  if (!posthogInstance) return;
  posthogInstance.identify(posthogInstance.get_distinct_id(), { displayName });
}
