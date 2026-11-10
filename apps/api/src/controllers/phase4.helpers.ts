import type { Request, Response } from "express";

// Shared by the Phase 4 controllers: one way to run a handler and turn thrown errors into `{ message }`.

export const getParam = (param: string | string[] | undefined): string => (Array.isArray(param) ? param[0] : param || "");

/** Runs `fn`; errors with a `statusCode` keep their message, anything else is a plain 500 (SYS-06). */
export function handle(fn: (req: Request, res: Response) => Promise<void>, fallback: string) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      await fn(req, res);
    } catch (err: any) {
      if (err?.statusCode) {
        res.status(err.statusCode).json({ message: err.message });
        return;
      }
      console.error(`[phase4] ${fallback}:`, err);
      res.status(500).json({ message: fallback });
    }
  };
}

/** The student id an authenticated student acts as (from the token, never the body). */
export const selfId = (req: Request): string => req.user!.studentId || req.user!.id;
