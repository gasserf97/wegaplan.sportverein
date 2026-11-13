import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-20 sm:px-6">
      <h1 className="text-4xl">Seite nicht gefunden</h1>
      <p className="mt-3 text-muted-foreground">
        Dieser Kurs oder diese Seite existiert nicht.
      </p>
      <Link href="/" className="mt-6 inline-block underline">
        Zur Startseite
      </Link>
    </div>
  );
}
