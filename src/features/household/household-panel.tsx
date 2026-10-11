"use client";

import {
  type FormEvent,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { keyFingerprint } from "@/crypto/household";
import { exportPublicKey } from "@/crypto/keys";
import { fromBase64url, toBase64url } from "@/crypto/wire";
import { type KeySession, keySession } from "@/features/lock/key-session";
import type { PrfApi } from "@/features/lock/passkey-prf";
import {
  RecoveryChooser,
  RecoveryContext,
} from "@/features/lock/recovery-chooser";
import { type Check, CodeCheck } from "./code-check";
import {
  addInvitee,
  httpPanelApi,
  type Member,
  type OpenInvite,
  type PanelApi,
  RecoveryRequiredError,
} from "./panel-client";

/**
 * Minimal Household panel (#64, UX.md §3.8, ADR-0031): members, open invites, invite by
 * email, and the inviter's code check before the household key is wrapped to anyone.
 * Rendered inside the household gate, so the session holds the household key.
 */
export function HouseholdPanel({
  keys = keySession,
  api = httpPanelApi,
  prf,
  addPasskey,
}: {
  keys?: KeySession;
  api?: PanelApi;
  prf?: PrfApi;
  addPasskey?: () => Promise<boolean>;
}) {
  const recovery = useContext(RecoveryContext);
  /** The address waiting on "Protect your account first" (ADR-0040). */
  const [protecting, setProtecting] = useState<string | null>(null);
  const householdId = keys.householdKey()?.householdId ?? null;
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<OpenInvite[]>([]);
  const [ownKey, setOwnKey] = useState<string | null>(null);
  const [ownCode, setOwnCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [check, setCheck] = useState<Check | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const identity = keys.identity();
    if (!identity) return;
    let live = true;
    exportPublicKey(identity.publicKey).then(async (pub) => {
      const code = await keyFingerprint(pub);
      if (live) {
        setOwnKey(toBase64url(pub));
        setOwnCode(code);
      }
    });
    return () => {
      live = false;
    };
  }, [keys]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `reload` refreshes after a change.
  useEffect(() => {
    if (!householdId) return;
    let live = true;
    Promise.all([api.members(householdId), api.invites(householdId)]).then(
      ([m, i]) => {
        if (!live) return;
        setMembers(m);
        setInvites(i);
      },
      () => live && setError("Couldn't load your household."),
    );
    return () => {
      live = false;
    };
  }, [api, householdId, reload]);

  if (!householdId) return null;
  const refresh = () => setReload((n) => n + 1);

  async function invite(e?: FormEvent, address = email.trim()) {
    e?.preventDefault();
    if (!householdId || !address) return;
    setError(null);
    try {
      await api.invite(householdId, address);
      setEmail("");
      refresh();
    } catch (err) {
      if (!(err instanceof RecoveryRequiredError))
        return setError(
          "Couldn't send the invite. Check the address and try again.",
        );
      if (recovery) return setProtecting(address);
      setError(
        "Add a way back in (passkey, passphrase or recovery kit) before inviting anyone.",
      );
    }
  }

  if (protecting && recovery)
    return (
      <RecoveryChooser
        source={recovery}
        prf={prf}
        addPasskey={addPasskey}
        onProtected={() => {
          setProtecting(null);
          invite(undefined, protecting);
        }}
        onCancel={() => setProtecting(null)}
      />
    );

  async function openCheck(invite: OpenInvite) {
    if (!invite.invitee) return;
    const invitee = invite.invitee;
    const theirs = await keyFingerprint(fromBase64url(invitee.publicKey));
    setCheck({ at: "comparing", invite, invitee, theirs });
  }

  async function matches() {
    const identity = keys.identity();
    const household = keys.householdKey();
    if (check?.at !== "comparing" || !identity || !household) return;
    const { invitee } = check;
    setCheck({ at: "adding" });
    try {
      await addInvitee(identity, household, invitee, api);
      setCheck(null);
    } catch {
      setCheck(null);
      setError(`Couldn't add ${invitee.email}. Try again.`);
    }
    refresh();
  }

  async function doesNotMatch() {
    if (check?.at !== "comparing" || !householdId) return;
    const { invite } = check;
    setCheck({ at: "stopped" }); // nothing is wrapped
    try {
      await api.cancel(householdId, invite.emailHash);
    } catch {
      setError("Couldn't cancel the invite. Cancel it again before retrying.");
    }
    refresh();
  }

  return (
    <section className="flex w-full max-w-sm flex-col gap-4 text-left text-sm">
      <h2 className="text-lg font-semibold">Household</h2>
      {members === null && !error && <p>Loading members…</p>}
      <ul className="flex flex-col gap-2">
        {members?.map((m) => (
          <Row key={m.userId} chip="🔑 Has access">
            {m.publicKey === ownKey ? "You" : "Member"}
          </Row>
        ))}
        {invites.map((i) => (
          <Row
            key={i.emailHash}
            chip={i.invitee ? "🔑 Ready to add" : "⏳ Invite pending"}
            onClick={i.invitee ? () => openCheck(i) : undefined}
          >
            {i.invitee?.email ?? "Invited"}
          </Row>
        ))}
      </ul>
      {members?.length === 1 && invites.length === 0 && (
        <p className="text-neutral-500">
          Add your spouse or family member to share this household.
        </p>
      )}
      <form onSubmit={invite} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span>Invite member</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <p className="text-xs text-neutral-500">
          They'll be able to unlock and see this household's data on their own
          device.
        </p>
        <button type="submit" className={primary}>
          Invite
        </button>
      </form>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {check && (
        <CodeCheck
          check={check}
          ownCode={ownCode}
          onMatch={matches}
          onMismatch={doesNotMatch}
          onClose={() => setCheck(null)}
        />
      )}
    </section>
  );
}

function Row({
  chip,
  onClick,
  children,
}: {
  chip: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const body = (
    <>
      <span className="truncate">{children}</span>
      <span className="shrink-0 text-xs text-neutral-500">{chip}</span>
    </>
  );
  const cls =
    "flex w-full items-center justify-between gap-2 rounded-md border border-neutral-200 px-3 py-2 dark:border-neutral-800";
  return (
    <li>
      {onClick ? (
        <button type="button" onClick={onClick} className={`${cls} text-left`}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

const primary =
  "rounded-md bg-neutral-900 px-3 py-2 font-medium text-white dark:bg-white dark:text-neutral-900";
