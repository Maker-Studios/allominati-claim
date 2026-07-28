import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

// One client per process: dev hot-reloads re-evaluate modules, and each new
// PrismaClient would open its own connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Server-only. Callers must check DATABASE_URL is configured first. */
export function db(): PrismaClient {
  globalForPrisma.prisma ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  return globalForPrisma.prisma;
}
