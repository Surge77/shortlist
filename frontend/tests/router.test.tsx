import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ROUTES } from "../src/App";
import { Link, matchPath, navigate, useLocation } from "../src/router";

function Where() {
  const { path, search } = useLocation();
  return <p data-testid="where">{`${path}|${search.get("next") ?? ""}`}</p>;
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("router", () => {
  it.each([
    ["/jobs/:id", "/jobs/42", { id: "42" }],
    ["/jobs/:id", "/jobs/a%20b", { id: "a b" }],
    ["/hr", "/hr/", {}],
    ["/jobs/:id", "/jobs", null],
    ["/hr/jobs/:id", "/hr/apps/1", null],
  ])("matches %s against %s", (pattern, path, expected) => {
    expect(matchPath(pattern, path)).toEqual(expected);
  });

  it("re-renders when navigating and reads the query string", () => {
    render(<Where />);
    act(() => navigate("/login?next=%2Fhr"));
    expect(screen.getByTestId("where")).toHaveTextContent("/login|/hr");
  });

  it("links navigate in place on a plain click but leave modified clicks to the browser", () => {
    render(<><Link to="/jobs/7">Job</Link><Where /></>);

    fireEvent.click(screen.getByRole("link", { name: "Job" }), { ctrlKey: true });
    expect(screen.getByTestId("where")).toHaveTextContent("/|");

    fireEvent.click(screen.getByRole("link", { name: "Job" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/jobs/7|");
  });

  it("routes /hr/jobs/new to the editor rather than an applicant list", () => {
    const first = ROUTES.find((route) => matchPath(route.pattern, "/hr/jobs/new"));
    expect(first?.pattern).toBe("/hr/jobs/new");
  });
});
