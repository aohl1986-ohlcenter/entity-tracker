const ENDPOINT = "https://api.resend.com/emails";

export type SendEmailInput = {
  to: string | string[];
  from?: string;
  subject: string;
  html: string;
};

export async function sendEmail(input: SendEmailInput): Promise<{ id: string } | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[resend] RESEND_API_KEY not set — skipping email dispatch");
    return null;
  }
  const from = input.from ?? process.env.ALERT_EMAIL_FROM ?? "Pragma-Code Tracker <onboarding@resend.dev>";

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}
