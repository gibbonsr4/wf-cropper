import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./error-boundary";

function Boom({ msg }: { msg: string }): never {
  throw new Error(msg);
}

// Silence React's error-boundary log noise during these tests — we assert
// on rendered fallback, not on console output.
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  consoleErrorSpy.mockRestore();
});

describe("ErrorBoundary", () => {
  it("renders children when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <div>safe content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("safe content")).toBeTruthy();
  });

  it("renders default fallback when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom msg="pipeline exploded" />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText("pipeline exploded")).toBeTruthy();
  });

  it("renders custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={(err) => <p>oops: {err.message}</p>}>
        <Boom msg="bad thing" />
      </ErrorBoundary>
    );
    expect(screen.getByText("oops: bad thing")).toBeTruthy();
  });

  it("clears error state and calls onReset when 'Start over' is clicked", () => {
    const onReset = vi.fn();
    render(
      <ErrorBoundary onReset={onReset}>
        <Boom msg="whoops" />
      </ErrorBoundary>
    );
    const button = screen.getByRole("button", { name: /start over/i });
    fireEvent.click(button);
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("uses a custom resetLabel when provided", () => {
    render(
      <ErrorBoundary resetLabel="Try again">
        <Boom msg="x" />
      </ErrorBoundary>
    );
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });
});
