import { initTRPC } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { ZodError } from "zod";

export interface Context {
  req: Request;
  sessionId?: string | undefined;
  adminSession?: string | undefined;
}

export function createContext({ req }: FetchCreateContextFnOptions): Context {
  const cookies = req.headers.get("cookie") ?? "";

  const parseCookie = (name: string): string | undefined => {
    const entry = cookies
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${name}=`));
    const raw = entry?.slice(name.length + 1).trim();
    if (!raw) return undefined;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  };

  const rawSession = parseCookie("stumble_session");
  // Validate UUID format to prevent session injection
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const sessionId =
    rawSession && UUID_RE.test(rawSession) ? rawSession : undefined;

  const adminSession = parseCookie("admin_session");

  return { req, sessionId, adminSession };
}

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
