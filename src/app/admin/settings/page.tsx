import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { formatMobile } from "@/lib/settings/format";
import { settingsImageUrl } from "@/lib/settings/files";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "../tenants/[tenancyId]/tenant-forms";
import {
  ChangePasswordForm,
  GcashForm,
  MeterSerialsForm,
  MyNameForm,
  ReceiptForm,
} from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div>
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        {description && <p className="text-sm text-zinc-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

async function Settings() {
  const me = await requireUser("admin");
  const supabase = await createClient();
  const [settings, rooms, tenants] = await Promise.all([
    supabase.from("app_settings").select("*").single(),
    supabase.from("rooms").select("id, number, meter_serial").order("number"),
    supabase
      .from("tenants")
      .select(
        "id, first_name, last_name, profile:profiles(id, username, must_change_password), tenancies(room:rooms(number), status, start_date)",
      )
      .not("profile_id", "is", null),
  ]);
  if (settings.error) throw new Error(`Couldn't load settings: ${settings.error.message}`);
  if (rooms.error) throw new Error(`Couldn't load rooms: ${rooms.error.message}`);
  if (tenants.error) throw new Error(`Couldn't load tenants: ${tenants.error.message}`);

  const s = settings.data;
  const [qrUrl, signatureUrl] = await Promise.all([
    settingsImageUrl(s.gcash_qr_path),
    settingsImageUrl(s.receipt_signature_path),
  ]);

  const logins = tenants.data
    .flatMap((t) => {
      if (!t.profile) return [];
      const latest = [...t.tenancies].sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
      return [
        {
          id: t.id,
          name: `${t.first_name} ${t.last_name}`,
          profile: t.profile,
          room: latest?.room?.number ?? null,
          active: latest?.status === "active",
        },
      ];
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || (a.room ?? 99) - (b.room ?? 99));

  return (
    <>
      <Section id="gcash" title="GCash" description="Shown to tenants when they pay by GCash.">
        <GcashForm
          name={s.gcash_name}
          number={s.gcash_number ? formatMobile(s.gcash_number) : null}
          qrUrl={qrUrl}
        />
      </Section>

      <Section id="receipts" title="Receipts">
        <ReceiptForm address={s.apartment_address} signatureUrl={signatureUrl} />
      </Section>

      <Section
        id="meters"
        title="Room meter serial numbers"
        description="The serial printed on each room's electric meter, to match photos and readings."
      >
        <MeterSerialsForm rooms={rooms.data} />
      </Section>

      <Section id="account" title="Your account" description={`Signed in as ${me.username}.`}>
        <MyNameForm displayName={me.displayName} />
        <hr className="border-zinc-200 dark:border-zinc-800" />
        <h3 className="text-sm font-semibold">Change password</h3>
        <ChangePasswordForm />
      </Section>

      <Section
        id="logins"
        title="Tenant logins"
        description="Forgot their password? Give them a new temporary one; they must change it when they sign in."
      >
        {logins.length === 0 ? (
          <p className="text-sm text-zinc-500">No tenant logins yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {logins.map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <span className="text-sm">
                  <span className="font-medium">{t.name}</span>
                  <span className="block text-xs text-zinc-500">
                    {t.room ? `Room ${t.room}` : "No room"}
                    {t.active ? "" : " · moved out"} ·{" "}
                    <span className="font-mono">{t.profile.username}</span>
                    {t.profile.must_change_password && " · temporary password"}
                  </span>
                </span>
                <ResetPasswordForm profileId={t.profile.id} username={t.profile.username} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Settings />
      </Suspense>
    </div>
  );
}
