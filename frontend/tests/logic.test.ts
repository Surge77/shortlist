import { describe, expect, it } from "vitest";

import { careerStrip } from "../src/career";
import { checkFile, MAX_FILE_BYTES } from "../src/files";
import { displayName, formatDuration, formatFileSize, formatMonth, formatSpan, initials } from "../src/format";
import { tokenizeJson } from "../src/jsonTokens";
import { makeJob } from "./fixtures";

const TODAY = new Date(2026, 9, 12);

describe("format", () => {
  it.each([
    [70, "5 yrs 10 mos"],
    [12, "1 yr"],
    [13, "1 yr 1 mo"],
    [5, "5 mos"],
    [0, "Less than a month"],
  ])("formats %i months as %s", (months, expected) => {
    expect(formatDuration(months)).toBe(expected);
  });

  it.each([
    ["2023-03", "Mar 2023"],
    ["2021", "2021"],
    ["Present", "Present"],
    [null, "?"],
  ])("formats the month %j as %s", (value, expected) => {
    expect(formatMonth(value)).toBe(expected);
  });

  it("joins a start and end into a span", () => {
    expect(formatSpan("2021-07", "2023-02")).toBe("Jul 2021 – Feb 2023");
    expect(formatSpan(null, null)).toBe("Dates not given");
  });

  it("title-cases a name written in capitals, and leaves mixed case alone", () => {
    expect(displayName("RIYA KULKARNI")).toBe("Riya Kulkarni");
    expect(displayName("Riya McKenzie")).toBe("Riya McKenzie");
    expect(displayName(null)).toBe("Unnamed candidate");
  });

  it("builds initials from the first and last name", () => {
    expect(initials("Riya Anand Kulkarni")).toBe("RK");
    expect(initials(null)).toBe("?");
  });

  it("formats file sizes", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
});

describe("careerStrip", () => {
  it("places each dated job on one shared axis", () => {
    const strip = careerStrip(
      [makeJob({ start: "2021-01", end: "2021-12" }), makeJob({ start: "2023-01", end: "2023-12" })],
      TODAY,
    );

    expect(strip?.firstYear).toBe(2021);
    expect(strip?.lastYear).toBe(2023);
    expect(strip?.segments[0].left).toBe(0);
    expect(strip?.segments[0].width).toBeCloseTo(100 / 3);
    expect(strip?.segments[1].left).toBeCloseTo(200 / 3);
  });

  it("runs a current job to today", () => {
    const strip = careerStrip([makeJob({ start: "2025-01", end: "Present" })], TODAY);

    expect(strip?.lastYear).toBe(2026);
    expect(strip?.segments[0].isCurrent).toBe(true);
  });

  it("puts overlapping jobs on separate lanes", () => {
    const strip = careerStrip(
      [makeJob({ start: "2020-01", end: "2020-12" }), makeJob({ start: "2020-06", end: "2021-06" })],
      TODAY,
    );

    expect(strip?.segments.map((segment) => segment.lane)).toEqual([0, 1]);
    expect(strip?.laneCount).toBe(2);
  });

  it("returns null when no job has usable dates", () => {
    expect(careerStrip([makeJob({ start: null, end: null })], TODAY)).toBeNull();
  });
});

describe("checkFile", () => {
  function fileOf(name: string, size: number, type = "") {
    const file = new File(["x"], name, { type });
    Object.defineProperty(file, "size", { value: size });
    return file;
  }

  it("accepts the supported formats", () => {
    for (const name of ["cv.pdf", "cv.docx", "scan.PNG", "photo.jpeg", "photo.jpg", "shot.webp"]) {
      expect(checkFile(fileOf(name, 1000))).toBeNull();
    }
  });

  it("explains why other files are refused", () => {
    expect(checkFile(fileOf("cv.doc", 1000))).toBe("Upload a PDF, Word (.docx), PNG, JPG or WebP file.");
    expect(checkFile(fileOf("cv.pdf", MAX_FILE_BYTES + 1))).toBe("Files are limited to 5 MB.");
    expect(checkFile(fileOf("cv.pdf", 0))).toBe("This file is empty.");
  });
});

describe("tokenizeJson", () => {
  it("labels keys, strings, numbers, booleans and null", () => {
    const tokens = tokenizeJson({ name: "Riya", years: 5, active: true, phone: null });
    const kinds = new Map(tokens.filter((token) => token.kind !== "plain").map((token) => [token.text, token.kind]));

    expect(kinds.get('"name"')).toBe("key");
    expect(kinds.get('"Riya"')).toBe("string");
    expect(kinds.get("5")).toBe("number");
    expect(kinds.get("true")).toBe("literal");
    expect(kinds.get("null")).toBe("literal");
  });

  it("loses no characters", () => {
    const value = { a: [1, "two", { b: false }] };

    expect(tokenizeJson(value).map((token) => token.text).join("")).toBe(JSON.stringify(value, null, 2));
  });
});
