import { describe, expect, test } from "bun:test";
import {
  authSchemas,
  prSchemas,
  repoSchemas,
  workflowSchemas,
} from "./request.schema";

/*
Guards the rules that replaced the hand-rolled `if (!x)` checks. The
injection cases matter most: before validation, an object where a string
was expected reached Mongo as a query operator.
*/

describe("register", () => {
  const parse = (body: unknown) => authSchemas.register.body.safeParse(body);

  test("accepts a valid signup", () => {
    const result = parse({
      name: "Ada",
      email: "Ada@Example.COM",
      password: "correct-horse-battery",
    });

    expect(result.success).toBe(true);
    // Email is lowercased so one address cannot register twice
    if (result.success) expect(result.data.email).toBe("ada@example.com");
  });

  test("rejects a short password", () => {
    // A single character used to be accepted
    expect(parse({ name: "A", email: "a@b.co", password: "a" }).success).toBe(
      false,
    );
  });

  test("rejects a password past bcrypt's 72-byte limit", () => {
    expect(
      parse({ name: "A", email: "a@b.co", password: "x".repeat(100) }).success,
    ).toBe(false);
  });

  test("rejects a malformed email", () => {
    expect(
      parse({ name: "A", email: "not-an-email", password: "longenoughpass" })
        .success,
    ).toBe(false);
  });
});

describe("login", () => {
  test("rejects an operator object where a string belongs", () => {
    // {"email": {"$gt": ""}} previously passed `if (!email)` and reached Mongo
    const result = authSchemas.login.body.safeParse({
      email: { $gt: "" },
      password: { $gt: "" },
    });

    expect(result.success).toBe(false);
  });

  test("does not apply the password policy when signing in", () => {
    // Accounts predating the policy must still be able to sign in, and
    // reporting "too short" here would leak the policy to an attacker.
    expect(
      authSchemas.login.body.safeParse({ email: "a@b.co", password: "old" })
        .success,
    ).toBe(true);
  });
});

describe("route params", () => {
  test("coerces a numeric repoId from the URL string", () => {
    const result = repoSchemas.byRepoId.params.safeParse({ repoId: "1224496015" });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.repoId).toBe(1224496015);
  });

  test("rejects a non-numeric repoId", () => {
    expect(repoSchemas.byRepoId.params.safeParse({ repoId: "abc" }).success).toBe(
      false,
    );
  });

  test("rejects a path-traversal attempt in a repo name", () => {
    expect(
      prSchemas.detail.params.safeParse({
        owner: "octocat",
        repo: "../../etc/passwd",
        pull_number: "1",
      }).success,
    ).toBe(false);
  });

  test("rejects a userId that is not a Mongo ObjectId", () => {
    expect(
      prSchemas.listForRepo.params.safeParse({
        userName: "octocat",
        repoName: "hello",
        userId: "not-an-id",
      }).success,
    ).toBe(false);
  });
});

describe("workflow save", () => {
  test("accepts a graph and keeps unknown node fields", () => {
    // React Flow owns the node shape; we check only what the executor reads
    const result = workflowSchemas.save.body.safeParse({
      repoId: 1,
      nodes: [{ id: "n1", type: "aiReview", position: { x: 0, y: 0 } }],
      edges: [{ id: "e1", source: "n1", target: "n2" }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nodes[0]).toHaveProperty("position");
    }
  });

  test("rejects a graph large enough to be a denial of service", () => {
    const nodes = Array.from({ length: 500 }, (_, i) => ({ id: `n${i}` }));

    expect(
      workflowSchemas.save.body.safeParse({ repoId: 1, nodes, edges: [] })
        .success,
    ).toBe(false);
  });

  test("defaults the trigger on execute", () => {
    const result = workflowSchemas.execute.body.safeParse({
      repoId: 1,
      prNumber: 2,
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.trigger).toBe("manual_trigger");
  });

  test("rejects a PR number of zero", () => {
    expect(
      workflowSchemas.execute.body.safeParse({ repoId: 1, prNumber: 0 }).success,
    ).toBe(false);
  });
});
