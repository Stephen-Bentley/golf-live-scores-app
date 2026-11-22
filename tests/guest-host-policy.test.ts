import { describe, expect, it } from "vitest";
import { guestHostingEnabled } from "@/app/api/auth/guest-host/route";

describe("guest host policy", () => {
  it("allows temporary hosts outside production", () => {
    expect(guestHostingEnabled({ NODE_ENV: "development" })).toBe(true);
  });

  it("allows temporary hosts in production when explicitly enabled", () => {
    expect(
      guestHostingEnabled({
        NODE_ENV: "production",
        ALLOW_GUEST_HOSTS: "true",
      })
    ).toBe(true);
  });

  it("keeps temporary hosts disabled for production unless enabled", () => {
    expect(guestHostingEnabled({ NODE_ENV: "production" })).toBe(false);
  });
});
