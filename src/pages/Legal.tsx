import { PingoMark } from "@/components/Wordmark";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";

type Doc = "terms" | "privacy" | "guidelines";

const UPDATED = "22 November 2026";
const POLICY_VERSION = "2026-11-22";

const COPY: Record<Doc, { title: string; intro: string; sections: [string, string[]][] }> = {
  terms: {
    title: "Terms of Service",
    intro:
      "These terms govern your use of PINGO. By creating an account you agree to them.",
    sections: [
      [
        "Your account",
        [
          "You must provide a phone number you control and keep your account secure.",
          "You are responsible for activity performed through your account.",
          "You must be old enough to consent to digital services in your country.",
        ],
      ],
      [
        "Acceptable use",
        [
          "Do not harass, threaten, impersonate or defraud other people.",
          "Do not publish illegal content, malware, or content that violates another person's rights.",
          "Do not attempt to access accounts, conversations or systems you are not authorised to access.",
          "Automated scraping, bulk messaging and evasion of rate limits are prohibited.",
        ],
      ],
      [
        "Your content",
        [
          "You retain ownership of the content you send. You grant PINGO the limited licence needed to store, transmit and display it to the people you choose.",
          "You are responsible for having the rights to the media you upload.",
        ],
      ],
      [
        "Moderation and suspension",
        [
          "We may remove content or restrict accounts that violate these terms or applicable law.",
          "Administrators act through audited tools and do not read private message contents beyond what the system permits.",
        ],
      ],
      [
        "Service availability",
        [
          "PINGO depends on Supabase and network providers. Features may change or be unavailable during maintenance.",
          "Calls require compatible browsers, permissions and, on restrictive networks, a TURN relay.",
        ],
      ],
      [
        "Ending use",
        [
          "You may stop using PINGO at any time and request account deletion from Settings → Account.",
          "Provisions that by nature survive termination, such as content licences already granted and dispute terms, continue to apply.",
        ],
      ],
      [
        "Contact",
        [
          "Questions about these terms can be sent to the support contact published in the application.",
        ],
      ],
    ],
  },
  privacy: {
    title: "Privacy Policy",
    intro:
      "This policy explains what PINGO stores, why, and the choices you have. It describes the current implementation, not a promise of features that do not exist.",
    sections: [
      [
        "Data we process",
        [
          "Account data: phone number, username, display name, about text and profile photo.",
          "Content: messages, attachments, voice notes, statuses, channel posts, reactions, receipts and call records.",
          "Technical data: session information, device presence, security events and the timestamps needed to deliver messages.",
        ],
      ],
      [
        "Why we process it",
        [
          "To authenticate you, deliver messages, synchronise devices, provide calls, prevent abuse and operate the service.",
          "To show your profile according to the privacy settings you choose.",
        ],
      ],
      [
        "Storage and security",
        [
          "Data is stored in Supabase PostgreSQL and Supabase Storage, protected by row-level security.",
          "Media is served through short-lived signed URLs. Service-role keys are never sent to the browser.",
          "PINGO does not claim end-to-end encryption. Transport is TLS and access is enforced by database policies.",
        ],
      ],
      [
        "Sharing",
        [
          "Your messages are visible to the participants of the conversation you send them to.",
          "Administrators can see account and moderation records permitted by role-based policies, not arbitrary private message bodies.",
          "We do not sell personal data.",
        ],
      ],
      [
        "Retention",
        [
          "Messages remain until you delete them for yourself or, where permitted, for everyone.",
          "Statuses expire after 24 hours. Expired rows are removed by the scheduled purge function when configured.",
          "Call records and audit entries are retained for operational and security purposes.",
        ],
      ],
      [
        "Your choices",
        [
          "Control last seen, online status, profile photo, read receipts and status audience in Settings → Privacy.",
          "Block accounts, clear local drafts, and request deletion from Settings → Account.",
        ],
      ],
      [
        "Contact picker",
        [
          "PINGO only uses the device contact picker when you open it. Your address book is not uploaded in plaintext.",
        ],
      ],
    ],
  },
  guidelines: {
    title: "Community Guidelines",
    intro:
      "PINGO is used across countries and cultures. These guidelines keep conversations safe and useful.",
    sections: [
      [
        "Respect people",
        [
          "No harassment, hate speech, threats, doxxing or targeted abuse.",
          "Do not create accounts or groups to evade a block or a suspension.",
        ],
      ],
      [
        "Keep it lawful",
        [
          "Do not share content that sexualises minors, incites violence, or violates intellectual property.",
          "Do not distribute malware or phishing links.",
        ],
      ],
      [
        "Channels and groups",
        [
          "Channel owners are responsible for what they publish and for their administrators.",
          "Do not add people to groups repeatedly after they leave.",
          "Label sensitive content and respect audience settings.",
        ],
      ],
      [
        "Spam and automation",
        [
          "No bulk unsolicited messaging, fake engagement or scraping.",
          "Use official integrations rather than automating a personal account.",
        ],
      ],
      [
        "Reporting",
        [
          "Report accounts and messages from their action menus. Reports create a moderation record for review.",
          "Emergency situations should be reported to local authorities as well as in-app.",
        ],
      ],
    ],
  },
};

export function LegalPage({ doc }: { doc: Doc }) {
  const navigate = useNavigate();
  const copy = COPY[doc];
  return (
    <div className="min-h-dvh bg-background">
      <header className="glass sticky top-0 z-10 flex h-14 items-center gap-2 px-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
          aria-label="Back"
        >
          <ArrowLeft className="size-[19px]" />
        </button>
        <span className="flex items-center gap-2">
          <PingoMark className="size-6" />
          <span className="text-xs font-semibold tracking-[0.12em]">PINGO</span>
        </span>
      </header>
      <main className="mx-auto w-full max-w-2xl px-5 py-8">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{copy.title}</h1>
        <p className="mt-2 text-xs text-muted-foreground">
          Version {POLICY_VERSION} · Last updated {UPDATED}
        </p>
        <p className="mt-5 text-sm leading-7 text-muted-foreground">{copy.intro}</p>

        <div className="mt-7 space-y-7">
          {copy.sections.map(([heading, paragraphs]) => (
            <section key={heading}>
              <h2 className="text-[0.95rem] font-semibold">{heading}</h2>
              <ul className="mt-2 space-y-2">
                {paragraphs.map((paragraph) => (
                  <li
                    key={paragraph}
                    className="flex gap-2 text-sm leading-6 text-muted-foreground"
                  >
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
                    <span>{paragraph}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-10 border-t border-border pt-4 text-[0.68rem] leading-5 text-muted-foreground">
          This document describes PINGO's current product behaviour. It is not
          legal advice; operators should have counsel review it for their
          jurisdiction before a public launch.
        </p>
      </main>
    </div>
  );
}

