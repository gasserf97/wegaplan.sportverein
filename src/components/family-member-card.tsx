"use client";

import { useCallback, useRef, useState } from "react";
import { EditFamilyMemberForm } from "@/components/family-forms";
import { RemoveFamilyMemberButton } from "@/components/remove-family-member-button";
import { Badge } from "@/components/ui/badge";

type FamilyMemberCardProps = {
  memberId: string;
  name: string;
  email: string;
  phone: string;
  taxId: string;
  street: string;
  postalCode: string;
  city: string;
  birthDate: string;
  birthDateLabel: string;
  age: number;
  emailVerified: boolean;
  hasMembership: boolean;
  isSelf: boolean;
  canManage: boolean;
  canLogin?: boolean;
  defaultOpen?: boolean;
  className?: string;
};

export function FamilyMemberCard({
  memberId,
  name,
  email,
  phone,
  taxId,
  street,
  postalCode,
  city,
  birthDate,
  birthDateLabel,
  age,
  emailVerified,
  hasMembership,
  isSelf,
  canManage,
  canLogin = true,
  defaultOpen = false,
  className = "",
}: FamilyMemberCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [saved, setSaved] = useState(false);
  const [savedNote, setSavedNote] = useState("Daten gespeichert.");
  const cardRef = useRef<HTMLDivElement>(null);
  const panelId = `family-member-${memberId}`;
  const handleSaved = useCallback((result?: { inviteSent?: boolean }) => {
    setSavedNote(
      result?.inviteSent
        ? "Daten gespeichert. Die Einladungs-E-Mail wurde gesendet."
        : "Daten gespeichert.",
    );
    setOpen(false);
    setSaved(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        cardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  }, []);

  return (
    <div
      ref={cardRef}
      className={`scroll-mt-4 min-w-0 max-w-full rounded-xl border border-border bg-card ${className}`.trim()}
    >
      <button
        type="button"
        id={`${panelId}-trigger`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setSaved(false);
          setOpen((value) => !value);
        }}
        className="relative grid w-full min-w-0 max-w-full grid-cols-1 items-start gap-2 py-4 pr-10 pl-4 text-left sm:flex sm:flex-wrap sm:items-start sm:gap-3 sm:p-5"
      >
        <div className="min-w-0 sm:flex-1">
          <p className="font-medium break-words">
            {name || "Profil unvollständig"}
            {isSelf ? " (Sie)" : ""}
          </p>
          <p className="text-sm break-words text-muted-foreground">
            {birthDate
              ? `Geboren ${birthDateLabel} · ${age} Jahre`
              : "Geburtsdatum noch nicht hinterlegt"}
          </p>
          <p className="text-sm break-words text-muted-foreground">
            {email ? email : "Keine eigene E-Mail"}
            {canLogin && email && !emailVerified ? " · E-Mail unbestätigt" : ""}
            {phone ? ` · ${phone}` : ""}
          </p>
        </div>
        <Badge
          variant={hasMembership ? "default" : "secondary"}
          className="h-auto max-w-full whitespace-normal"
        >
          {hasMembership ? "Mitgliedschaft aktiv" : "Keine Mitgliedschaft"}
        </Badge>
        <span
          aria-hidden
          className={`absolute top-4 right-4 text-muted-foreground transition-transform sm:static sm:shrink-0 ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {saved ? (
        <p
          role="status"
          className="border-t border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 sm:px-5"
        >
          {savedNote}
        </p>
      ) : null}

      {open ? (
        <div id={panelId} className="border-t border-border px-4 pt-4 pb-4 sm:px-5 sm:pb-5">
          {isSelf || canManage ? (
            <div className="grid gap-3">
              <EditFamilyMemberForm
                memberId={memberId}
                name={name}
                email={email}
                phone={phone}
                taxId={taxId}
                street={street}
                postalCode={postalCode}
                city={city}
                birthDate={birthDate}
                isSelf={isSelf}
                canLogin={canLogin}
                onSaved={handleSaved}
              />
              {!isSelf && canManage ? (
                <RemoveFamilyMemberButton memberId={memberId} name={name} />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
