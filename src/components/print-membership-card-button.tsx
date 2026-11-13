"use client";

import { Button } from "@/components/ui/button";

export function PrintMembershipCardButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      Drucken / als PDF speichern
    </Button>
  );
}
