import { describe, expect, it } from "vitest";
import { shouldSetSecureSessionCookie } from "@/lib/auth";

function secure(url: string | undefined, host: string | null, proto = "http") {
  return shouldSetSecureSessionCookie(host, proto, { NODE_ENV: "production", NEXT_PUBLIC_APP_URL: url });
}

describe("session cookie transport", () => {
  it("supports the exact explicitly configured LAN HTTP address", () => {
    expect(secure("http://192.168.1.13:7446", "192.168.1.13:7446")).toBe(false);
    expect(secure("http://172.31.0.2:3000", "172.31.0.2:3000")).toBe(false);
    expect(secure("http://10.0.0.2:3000", "10.0.0.2:3000")).toBe(false);
  });

  it("keeps cookies secure when serving HTTPS or an alternate address", () => {
    expect(secure("http://192.168.1.13:7446", "192.168.1.13:7446", "https")).toBe(true);
    expect(secure("https://192.168.1.13:7446", "192.168.1.13:7446")).toBe(true);
    expect(secure("http://192.168.1.13:7446", "192.168.1.13:3000")).toBe(true);
    expect(secure("http://192.168.1.13:7446", "fairway.example")).toBe(true);
  });

  it("keeps cookies secure when the configured HTTP address is public or invalid", () => {
    expect(secure("http://172.32.0.2:3000", "172.32.0.2:3000")).toBe(true);
    expect(secure("http://fairway.example", "fairway.example")).toBe(true);
    expect(secure(undefined, "192.168.1.13:7446")).toBe(true);
  });

  it("keeps localhost HTTP available for local Docker and development", () => {
    expect(secure("http://localhost:3000", "localhost:3000")).toBe(false);
    expect(secure("http://[::1]:3000", "[::1]:3000")).toBe(false);
    expect(shouldSetSecureSessionCookie(null, null, { NODE_ENV: "development" })).toBe(false);
  });
});
