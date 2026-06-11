import { describe, expect, it } from "vitest";
import { createJsonResponse, getClientIp, jsonError, readJson, trimTrailingSlash, ValidationError } from "./http";

describe("worker http helpers", () => {
  it("formats JSON errors with optional details", () => {
    expect(jsonError("bad request")).toEqual({ error: { message: "bad request" } });
    expect(jsonError("bad request", ["invalid"])).toEqual({
      error: { message: "bad request", details: ["invalid"] },
    });
  });

  it("trims trailing slashes without changing bare origins", () => {
    expect(trimTrailingSlash("https://api.example.com///")).toBe("https://api.example.com");
    expect(trimTrailingSlash("https://api.example.com/v1")).toBe("https://api.example.com/v1");
  });

  it("reads valid JSON and maps invalid JSON to a validation error", async () => {
    await expect(readJson(new Request("https://globaltrace.test", { body: "{\"ok\":true}", method: "POST" }))).resolves.toEqual({
      ok: true,
    });
    await expect(readJson(new Request("https://globaltrace.test", { body: "{", method: "POST" }))).rejects.toThrow(
      ValidationError,
    );
  });

  it("uses Cloudflare client IP before forwarded IP headers", () => {
    expect(
      getClientIp(
        new Request("https://globaltrace.test", {
          headers: {
            "CF-Connecting-IP": "203.0.113.9",
            "X-Forwarded-For": "198.51.100.2, 198.51.100.3",
          },
        }),
      ),
    ).toBe("203.0.113.9");
    expect(
      getClientIp(
        new Request("https://globaltrace.test", {
          headers: { "X-Forwarded-For": "198.51.100.2, 198.51.100.3" },
        }),
      ),
    ).toBe("198.51.100.2");
  });

  it("creates JSON responses with an explicit content type", async () => {
    const response = createJsonResponse({ ok: true }, { status: 201 });

    expect(response.status).toBe(201);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
