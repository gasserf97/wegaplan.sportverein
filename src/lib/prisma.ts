import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { currentClubId } from "@/lib/tenant-context";
import "@/lib/tenant";

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

const TENANT_MODELS = [
  "user",
  "section",
  "course",
  "court",
  "device",
  "subscriptionPlan",
  "supportTicket",
  "clubEvent",
] as const;

function andClub(where: object | undefined, clubId: string) {
  if (!where || Object.keys(where).length === 0) return { clubId };
  return { AND: [where, { clubId }] };
}

function tenantOps(
  model: (typeof TENANT_MODELS)[number],
  base: PrismaClient,
) {
  async function rowClub(where: object) {
    const row = await (base as unknown as Record<string, {
      findUnique: (args: object) => Promise<{ clubId: string } | null>;
    }>)[model].findUnique({
      where,
      select: { clubId: true },
    });
    return row;
  }

  async function rejectOtherClub(where: object) {
    const clubId = await currentClubId();
    if (!clubId) return null;
    const row = await rowClub(where);
    if (!row || row.clubId !== clubId) {
      throw new Error("Datensatz gehört zu einem anderen Verein.");
    }
    return clubId;
  }

  return {
    async findMany({ args, query }: { args: { where?: object }; query: (args: object) => Promise<unknown> }) {
      const clubId = await currentClubId();
      if (!clubId) return query(args);
      return query({ ...args, where: andClub(args.where, clubId) });
    },
    async findFirst({ args, query }: { args: { where?: object }; query: (args: object) => Promise<unknown> }) {
      const clubId = await currentClubId();
      if (!clubId) return query(args);
      return query({ ...args, where: andClub(args.where, clubId) });
    },
    async findFirstOrThrow({ args, query }: { args: { where?: object }; query: (args: object) => Promise<unknown> }) {
      const clubId = await currentClubId();
      if (!clubId) return query(args);
      return query({ ...args, where: andClub(args.where, clubId) });
    },
    async count({ args, query }: { args: { where?: object }; query: (args: object) => Promise<unknown> }) {
      const clubId = await currentClubId();
      if (!clubId) return query(args);
      return query({ ...args, where: andClub(args.where, clubId) });
    },
    async aggregate({ args, query }: { args: { where?: object }; query: (args: object) => Promise<unknown> }) {
      const clubId = await currentClubId();
      if (!clubId) return query(args);
      return query({ ...args, where: andClub(args.where, clubId) });
    },
    async groupBy({ args, query }: { args: { where?: object }; query: (args: object) => Promise<unknown> }) {
      const clubId = await currentClubId();
      if (!clubId) return query(args);
      return query({ ...args, where: andClub(args.where, clubId) });
    },
    async updateMany({ args, query }: { args: { where?: object }; query: (args: object) => Promise<unknown> }) {
      const clubId = await currentClubId();
      if (!clubId) return query(args);
      return query({ ...args, where: andClub(args.where, clubId) });
    },
    async deleteMany({ args, query }: { args: { where?: object }; query: (args: object) => Promise<unknown> }) {
      const clubId = await currentClubId();
      if (!clubId) return query(args);
      return query({ ...args, where: andClub(args.where, clubId) });
    },
    async create({ args, query }: { args: { data: object }; query: (args: object) => Promise<unknown> }) {
      const clubId = await currentClubId();
      if (!clubId) return query(args);
      return query({ ...args, data: { ...args.data, clubId } });
    },
    async createMany({
      args,
      query,
    }: {
      args: { data: object | object[] };
      query: (args: object) => Promise<unknown>;
    }) {
      const clubId = await currentClubId();
      if (!clubId) return query(args);
      const data = Array.isArray(args.data)
        ? args.data.map((row) => ({ ...row, clubId }))
        : { ...args.data, clubId };
      return query({ ...args, data });
    },
    async findUnique({ args, query }: { args: { where: object }; query: (args: object) => Promise<unknown> }) {
      const clubId = await currentClubId();
      if (!clubId) return query(args);
      const row = await rowClub(args.where);
      if (!row || row.clubId !== clubId) return null;
      return query(args);
    },
    async findUniqueOrThrow({ args, query }: { args: { where: object }; query: (args: object) => Promise<unknown> }) {
      await rejectOtherClub(args.where);
      return query(args);
    },
    async update({ args, query }: { args: { where: object }; query: (args: object) => Promise<unknown> }) {
      await rejectOtherClub(args.where);
      return query(args);
    },
    async delete({ args, query }: { args: { where: object }; query: (args: object) => Promise<unknown> }) {
      await rejectOtherClub(args.where);
      return query(args);
    },
    async upsert({
      args,
      query,
    }: {
      args: { where: object; create: object };
      query: (args: object) => Promise<unknown>;
    }) {
      const clubId = await currentClubId();
      if (!clubId) return query(args);
      const row = await rowClub(args.where);
      if (row && row.clubId !== clubId) {
        throw new Error("Datensatz gehört zu einem anderen Verein.");
      }
      return query({ ...args, create: { ...args.create, clubId } });
    },
  };
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

  const base = new PrismaClient({ adapter });
  const withEnrollment = base.$extends({
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

  const tenantQuery = Object.fromEntries(
    TENANT_MODELS.map((model) => [model, tenantOps(model, base)]),
  );

  return withEnrollment.$extends({
    query: tenantQuery as Parameters<typeof withEnrollment.$extends>[0] extends {
      query?: infer Q;
    }
      ? Q
      : never,
  });
}

type AppPrisma = ReturnType<typeof createPrisma>;

const globalForPrisma = globalThis as unknown as { prisma?: AppPrisma };

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
