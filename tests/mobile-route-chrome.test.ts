import { describe, expect, it } from "vitest";
import { mobileRouteChrome } from "../components/mobile-shell/mobile-route-chrome";

describe("mobile route chrome", () => {
  it("gives Character Hub its own focused mobile navigation", () => {
    expect(mobileRouteChrome("character")).toMatchObject({ topBar: false, bottomDock: false });
  });

  it("preserves the accepted Home and immersive Reels chrome", () => {
    expect(mobileRouteChrome("home")).toMatchObject({ topBar: true, flowTopBar: true, bottomDock: true });
    expect(mobileRouteChrome("reels")).toMatchObject({ topBar: false, bottomDock: false });
  });
});
