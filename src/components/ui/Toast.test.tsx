import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToastProvider, useToast } from "./Toast";

const Trigger = ({ message, kind }: { message: string; kind: "success" | "error" }) => {
  const { pushToast } = useToast();
  return (
    <button type="button" onClick={() => pushToast(message, kind)}>
      trigger
    </button>
  );
};

describe("Toast", () => {
  it("renders children inside the provider", () => {
    render(
      <ToastProvider>
        <p>child content</p>
      </ToastProvider>,
    );

    expect(screen.getByText("child content")).toBeVisible();
  });

  it("shows a success toast message via pushToast", () => {
    render(
      <ToastProvider>
        <Trigger message="Saved" kind="success" />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("trigger"));
    expect(screen.getByText("Saved")).toBeVisible();
  });

  it("renders error styling for error toasts", () => {
    render(
      <ToastProvider>
        <Trigger message="Launch failed" kind="error" />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("trigger"));
    const toast = screen.getByText("Launch failed").closest(".loom-toast");
    expect(toast).not.toBeNull();
    expect(toast).toHaveClass("loom-toast--error");
  });

  it("removes the toast when the dismiss button is clicked", () => {
    render(
      <ToastProvider>
        <Trigger message="Saved" kind="success" />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("trigger"));
    expect(screen.getByText("Saved")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText("Saved")).toBeNull();
  });
});
