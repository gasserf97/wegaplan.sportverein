import { Badge } from "@/components/ui/badge";

export type AdminRecentRegistrationItem = {
  id: string;
  personName: string;
  title: string;
  statusLabel: string;
  statusSettled: boolean;
  paymentLabel: string | null;
  amountLabel: string | null;
  whenLabel: string;
};

export function AdminRecentRegistrations({
  items,
  emptyLabel,
}: {
  items: AdminRecentRegistrationItem[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">{emptyLabel}</p>
    );
  }

  return (
    <ul className="mt-4 grid gap-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex flex-col gap-2 rounded-xl bg-card px-4 py-3 text-sm ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>
            <strong>{item.personName}</strong> · {item.title}
          </span>
          <span className="flex flex-wrap items-center gap-2 sm:justify-end">
            {item.amountLabel ? (
              <span className="font-medium tabular-nums">{item.amountLabel}</span>
            ) : null}
            <Badge variant={item.statusSettled ? "default" : "secondary"}>
              {item.statusLabel}
            </Badge>
            {item.paymentLabel ? (
              <Badge variant="outline">{item.paymentLabel}</Badge>
            ) : null}
            <span className="text-muted-foreground">{item.whenLabel}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
