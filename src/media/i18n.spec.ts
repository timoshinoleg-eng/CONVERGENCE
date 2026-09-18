import { describe, expect, it } from "vitest";
import { lookupCopy, pickLocale, resolveHeadline } from "./i18n";

describe("pickLocale", () => {
  it("accepts supported locales only", () => {
    expect(pickLocale(["ru", "en", "zh"])).toBe("ru");
    expect(pickLocale(["fr"])).toBe("en");
    expect(pickLocale([])).toBe("en");
  });

  it("REGRESSION: recognises Russian BCP-47 variants", () => {
    expect(pickLocale(["ru-RU"])).toBe("ru");
    expect(pickLocale(["ru-KZ"])).toBe("ru");
    expect(pickLocale(["ru-BY"])).toBe("ru");
  });

  it("REGRESSION: recognises English BCP-47 variants", () => {
    expect(pickLocale(["en-US"])).toBe("en");
    expect(pickLocale(["en-GB"])).toBe("en");
    expect(pickLocale(["en-AU"])).toBe("en");
  });

  it("recognises Chinese BCP-47 spellings", () => {
    expect(pickLocale(["zh-CN"])).toBe("zh");
    expect(pickLocale(["zh-Hans"])).toBe("zh");
    expect(pickLocale(["zh-Hans-CN"])).toBe("zh");
    expect(pickLocale(["zh-TW"])).toBe("zh");
  });

  it("ignores undefined entries", () => {
    expect(pickLocale([undefined, "zh-Hans-CN", undefined])).toBe("zh");
  });

  it("normalises underscore separators", () => {
    expect(pickLocale(["ru_RU"])).toBe("ru");
    expect(pickLocale(["en_US"])).toBe("en");
  });
});

describe("lookupCopy", () => {
  it("returns the requested locale when present", () => {
    const value = lookupCopy(
      { title: { ru: "Привет", en: "Hello", zh: "你好" } },
      "zh",
      "title",
    );
    expect(value).toBe("你好");
  });

  it("falls back to ru then en when missing", () => {
    expect(lookupCopy({ title: { en: "Hi", ru: "Привет" } }, "zh", "title")).toBe("Привет");
    expect(lookupCopy({ title: { en: "Hi" } }, "zh", "title")).toBe("Hi");
  });

  it("skips empty strings when falling back", () => {
    expect(
      lookupCopy({ title: { ru: "", en: "Hi" } }, "ru", "title"),
    ).toBe("Hi");
  });

  it("returns undefined when nothing usable is present", () => {
    expect(lookupCopy({ title: { ru: "", en: "" } }, "ru", "title")).toBeUndefined();
    expect(lookupCopy(undefined, "ru", "title")).toBeUndefined();
  });
});

describe("resolveHeadline", () => {
  it("prefers title, then caption, then label", () => {
    expect(
      resolveHeadline({ title: { en: "T" }, caption: { en: "C" }, label: "L" }, "en"),
    ).toBe("T");
    expect(resolveHeadline({ caption: { en: "C" }, label: "L" }, "en")).toBe("C");
    expect(resolveHeadline({ label: "L" }, "en")).toBe("L");
  });
});
