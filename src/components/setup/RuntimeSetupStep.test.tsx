import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RuntimeSetupStep } from "./RuntimeSetupStep";

describe("RuntimeSetupStep", () => {
  it("defaults to Locust and Goose and requires separate k6 license consent", async () => {
    const install = vi.fn().mockResolvedValue(undefined);
    render(<RuntimeSetupStep statuses={[]} progress={null} onInstall={install} onCancel={vi.fn()} onContinue={vi.fn()} />);

    expect(screen.getByLabelText("Install Locust")).toBeChecked();
    expect(screen.getByLabelText("Install Goose")).toBeChecked();
    expect(screen.getByLabelText("Install k6")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Install k6"));
    fireEvent.click(screen.getByRole("button", { name: "Install selected runtimes" }));
    expect(install).not.toHaveBeenCalled();
    expect(screen.getByText(/accept the AGPL-3.0 license separately/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/I accept k6's AGPL-3.0 license/i));
    fireEvent.click(screen.getByRole("button", { name: "Install selected runtimes" }));
    expect(install).toHaveBeenCalledWith({ locust: true, goose: true, k6: true }, expect.objectContaining({ license: "AGPL-3.0-only" }));
  });

  it("shows indeterminate download progress and offers cancel and continue", () => {
    const cancel = vi.fn();
    const proceed = vi.fn();
    render(<RuntimeSetupStep statuses={[]} progress={{ runtime: "goose", stage: "toolchain", bytesReceived: 500, totalBytes: null, message: "Installing Rust" }} isInstalling onInstall={vi.fn()} onCancel={cancel} onContinue={proceed} />);

    expect(screen.getByRole("status")).toHaveTextContent("Installing Rust");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "Progress is being determined");
    fireEvent.click(screen.getByRole("button", { name: "Cancel installation" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to Loom" }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(proceed).toHaveBeenCalledOnce();
  });
});
