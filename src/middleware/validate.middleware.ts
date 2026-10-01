import { NextFunction, Request, Response } from "express";
import { ZodType } from "zod";

/*
Schema validation for request bodies, params and queries.

The controllers each hand-rolled their own `if (!x) return 400` checks.
They were inconsistent in wording, several missed fields entirely, and
none of them checked types — a body of {"repoId": {"$gt": ""}} would sail
through `if (!repoId)` and reach Mongo as a query operator.

Validating up front also means a controller can trust its input, so the
checks disappear from the business logic instead of being duplicated.
*/

type Schemas = {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
};

export function validate(schemas: Schemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const key of ["body", "params", "query"] as const) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key]);

      if (!result.success) {
        return res.status(400).json({
          message: "Invalid request",
          action: "validation failed",
          // Field-by-field, so the client can mark the offending input
          errors: result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
      }

      /*
      req.query and req.params are getter-only on Express 5, so the
      parsed value is assigned with defineProperty rather than `=`.
      This matters because the schemas coerce strings to numbers.
      */
      Object.defineProperty(req, key, {
        value: result.data,
        writable: true,
        configurable: true,
      });
    }

    next();
  };
}
