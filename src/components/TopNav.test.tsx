import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TopNav } from "./TopNav";
import type { EngineInfo, Project } from "../types";

const engine: EngineInfo = {
  id: "locust", display_name: "Locust", engine_language: "Python", license: "MIT",
  license_tier: "Core", supported_script_languages: ["Python"], availability: { Ready: {} },
};
const project: Project = {
  id: "billing", name: "Billing", description: "", targetHost: "https://billing.test",
  defaultEngine: "locust", createdAt: "2026-09-27T00:00:00.000Z", suites: [],
};

const createProps = (overrides = {}) => ({
  activeTab: "dashboard", openTabs: ["dashboard", "runner"], onSelectTab: vi.fn(), onCloseTab: vi.fn(),
  isRunning: false, onRunTest: vi.fn(), onStopTest: vi.fn(),
  engines: [engine], selectedEngineId: "locust", onSelectEngine: vi.fn(), selectedEngineName: "Locust",
  projects: [project], activeProjectId: "billing", onSelectProject: vi.fn(), onOpenNewProject: vi.fn(),
  onOpenCmdk: vi.fn(), onToggleNavigation: vi.fn(), navigationOpen: false,
  targetHost: "https://billing.test", onChangeTargetHost: vi.fn(), activeTestName: "checkout.py",
  ...overrides,
});

describe("TopNav", () => {
  it("uses the shared action control without changing the idle run callback", async () => {
    const user = userEvent.setup();
    const onRunTest = vi.fn();

    render(<TopNav {...createProps({ onRunTest })} />);

    const runTest = screen.getByRole("button", { name: "Run Test" });
    expect(runTest).toHaveClass("loom-button");
    await user.click(runTest);
    expect(onRunTest).toHaveBeenCalledTimes(1);
  });

  it("places the project picker immediately after the Loom brand and routes selection and creation", async () => {
    const user = userEvent.setup();
    const onSelectProject = vi.fn();
    const onOpenNewProject = vi.fn();
    const secondProject = { ...project, id: "inventory", name: "Inventory" };
    render(<TopNav {...createProps({ projects: [project, secondProject], onSelectProject, onOpenNewProject })} />);

    const brand = screen.getByRole("img", { name: "Loom" });
    const picker = screen.getByRole("button", { name: /Billing/ });
    expect(brand.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(picker);
    await user.click(screen.getByRole("menuitemradio", { name: /Inventory/ }));
    expect(onSelectProject).toHaveBeenCalledWith("inventory");
    await user.click(screen.getByRole("button", { name: "Create project" }));
    expect(onOpenNewProject).toHaveBeenCalledTimes(1);
  });

  it("keeps tabs keyboard selectable, closable, and reopenable", async () => {
    const user = userEvent.setup();
    const onSelectTab = vi.fn();
    const onCloseTab = vi.fn();
    render(<TopNav {...createProps({ onSelectTab, onCloseTab })} />);

    const overview = screen.getByRole("tab", { name: "Overview" });
    expect(overview).toHaveAttribute("aria-selected", "true");
    overview.focus();
    await user.keyboard("{ArrowRight}");
    expect(onSelectTab).toHaveBeenCalledWith("runner");
    expect(screen.getByRole("tab", { name: /checkout.py/ })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Close checkout.py tab" }));
    expect(onCloseTab).toHaveBeenCalledWith("runner");
    await user.click(screen.getByRole("button", { name: "Open workspace tab" }));
    await user.click(screen.getByRole("menuitem", { name: "Script editor" }));
    expect(onSelectTab).toHaveBeenCalledWith("editor");
  });

  it("keeps engine, target, running status, quick actions, and stop available in context", async () => {
    const user = userEvent.setup();
    const onSelectEngine = vi.fn();
    const onChangeTargetHost = vi.fn();
    const onOpenCmdk = vi.fn();
    const onStopTest = vi.fn();
    const k6 = { ...engine, id: "k6", display_name: "k6" };
    render(<TopNav {...createProps({ engines: [engine, k6], isRunning: true, onSelectEngine, onChangeTargetHost, onOpenCmdk, onStopTest })} />);

    expect(screen.getByRole("status", { name: "Run status" })).toHaveTextContent("Running");
    await user.selectOptions(screen.getByRole("combobox", { name: "Active engine" }), "k6");
    expect(onSelectEngine).toHaveBeenCalledWith("k6");
    await user.clear(screen.getByRole("textbox", { name: "Target host" }));
    await user.type(screen.getByRole("textbox", { name: "Target host" }), "https://new.test");
    expect(onChangeTargetHost).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Quick actions" }));
    expect(onOpenCmdk).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Stop Test" }));
    expect(onStopTest).toHaveBeenCalledTimes(1);
  });

  it("shows a useful empty project context and a navigation toggle", async () => {
    const user = userEvent.setup();
    const onToggleNavigation = vi.fn();
    render(<TopNav {...createProps({ projects: [], activeProjectId: "", canRun: false, onToggleNavigation })} />);

    expect(screen.getByRole("button", { name: "No project selected" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Run Test" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Toggle workspace navigation" }));
    expect(onToggleNavigation).toHaveBeenCalledTimes(1);
  });

  it("returns keyboard focus to the project picker after Escape and project selection", async () => {
    const user = userEvent.setup();
    const onSelectProject = vi.fn();
    const inventory = { ...project, id: "inventory", name: "Inventory" };
    render(<TopNav {...createProps({ projects: [project, inventory], onSelectProject })} />);

    const picker = screen.getByRole("button", { name: "Billing" });
    picker.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menuitemradio", { name: /Billing/ })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menuitemradio", { name: /Billing/ })).not.toBeInTheDocument();
    expect(picker).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: /Inventory/ })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSelectProject).toHaveBeenCalledWith("inventory");
    expect(picker).toHaveFocus();
  });

  it("restores focus from the new-tab menu and focuses the opened tab", async () => {
    const user = userEvent.setup();
    const onSelectTab = vi.fn();
    const { rerender } = render(<TopNav {...createProps({ onSelectTab, openTabs: ["dashboard"] })} />);
    const add = screen.getByRole("button", { name: "Open workspace tab" });
    add.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menuitem", { name: "Visual flow" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(add).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("menuitem", { name: "Script editor" }));
    expect(onSelectTab).toHaveBeenCalledWith("editor");
    rerender(<TopNav {...createProps({ activeTab: "editor", openTabs: ["dashboard", "editor"], onSelectTab })} />);
    expect(screen.getByRole("tab", { name: "Script editor" })).toHaveFocus();
  });

  it("shows the selected engine's availability and its installation reason", () => {
    const unavailable: EngineInfo = {
      ...engine, availability: { NotInstalled: { install_hint: "Install Locust with the Runtime Manager" } },
    };
    render(<TopNav {...createProps({ engines: [unavailable] })} />);

    expect(screen.getByRole("status", { name: "Engine availability" }))
      .toHaveTextContent("Install Locust with the Runtime Manager");
  });

  it("keeps the new-tab menu within a narrow viewport near its right edge", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    render(<TopNav {...createProps()} />);
    const add = screen.getByRole("button", { name: "Open workspace tab" });
    vi.spyOn(add, "getBoundingClientRect").mockReturnValue({
      left: 296, right: 328, top: 10, bottom: 42, width: 32, height: 32, x: 296, y: 10, toJSON: () => ({}),
    });
    await user.click(add);
    expect(screen.getByRole("menu")).toHaveStyle({ left: "120px", top: "48px", width: "192px" });
  });
});
