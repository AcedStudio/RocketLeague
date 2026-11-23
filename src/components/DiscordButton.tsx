import { getT } from "@/lib/i18n/server";
import { oauthConfigured } from "@/lib/discord";

function DiscordLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.6 5.3A17 17 0 0 0 15.4 4l-.5 1a15.7 15.7 0 0 0-5.8 0l-.5-1a17 17 0 0 0-4.2 1.3C1.7 9.2 1 13 1.3 16.8a17 17 0 0 0 5.2 2.6l1.1-1.8c-.6-.2-1.2-.5-1.7-.8l.4-.3a12.2 12.2 0 0 0 11.4 0l.4.3c-.5.3-1.1.6-1.7.8l1.1 1.8a17 17 0 0 0 5.2-2.6c.4-4.4-.7-8.2-3.1-11.5ZM8.7 14.6c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Zm6.6 0c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Z" />
    </svg>
  );
}

export async function DiscordButton({ mode, next, label }: { mode: "login" | "link"; next?: string; label?: string }) {
  if (!oauthConfigured()) return null;
  const t = await getT();
  const href = `/api/auth/discord?mode=${mode}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
  return (
    // A plain link: the OAuth flow is a full-page redirect.
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a href={href} className="btn btn-lg btn-discord">
      <DiscordLogo />
      {label ?? t("Войти через Discord")}
    </a>
  );
}
