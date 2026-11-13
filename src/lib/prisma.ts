import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function statusValue(data: object): unknown {
  if (!("status" in data)) return undefined;
  const status = (data as { status?: unknown }).status;
  if (status && typeof status === "object" && "set" in status) {
    return (status as { set: unknown }).set;
  }
  return status;
}

function paidAtFromData(data: object): Date | null {
  if (!("paidAt" in data)) return null;
  const value = (data as { paidAt?: unknown }).paidAt;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/** Setzt statusChangedAt, sobald der Anmeldestatus geschrieben wird. */
function withStatusChangedAt<T extends object>(data: T): T {
  const status = statusValue(data);
  if (status == null) return data;
  if (
    "statusChangedAt" in data &&
    (data as { statusChangedAt?: unknown }).statusChangedAt != null
  ) {
    return data;
  }
  const paidAt = status === "PAID" ? paidAtFromData(data) : null;
  return { ...data, statusChangedAt: paidAt ?? new Date() };
}

function stampEnrollmentWrite<T extends { data?: object }>(args: T): T {
  if (!args.data || typeof args.data !== "object") return args;
  return { ...args, data: withStatusChangedAt(args.data) };
}

function createPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new PrismaPg({
    connectionString,
    // node-pg validiert SSL strenger als der alte Rust-Engine; Render/Managed-PG
    // liefert oft Zertifikate, die sonst P1010 auslösen.
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : undefined,
  });

  return new PrismaClient({ adapter }).$extends({
    query: {
      enrollment: {
        async create({ args, query }) {
          return query(stampEnrollmentWrite(args));
        },
        async createMany({ args, query }) {
          if (Array.isArray(args.data)) {
            return query({
              ...args,
              data: args.data.map((row) => withStatusChangedAt(row)),
            });
          }
          return query(stampEnrollmentWrite(args));
        },
        async update({ args, query }) {
          return query(stampEnrollmentWrite(args));
        },
        async updateMany({ args, query }) {
          return query(stampEnrollmentWrite(args));
        },
        async upsert({ args, query }) {
          return query({
            ...args,
            create: withStatusChangedAt(args.create),
            update: withStatusChangedAt(args.update),
          });
        },
      },
    },
  });
}

type AppPrisma = ReturnType<typeof createPrisma>;

const globalForPrisma = globalThis as unknown as { prisma?: AppPrisma };

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
