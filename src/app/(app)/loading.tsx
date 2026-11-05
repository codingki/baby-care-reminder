import { getLocale } from "@/i18n/get-locale";
import { getMessages } from "@/i18n/get-messages";

export default async function Loading() {
  const messages = getMessages(await getLocale());

  return (
    <p className="text-sm text-muted" role="status" aria-live="polite">
      {messages.common.loading}
    </p>
  );
}
