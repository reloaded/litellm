import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InheritedPermissionsView } from "./InheritedPermissionsView";
import * as networking from "../networking";

vi.mock("../networking", () => ({
  fetchMCPServers: vi.fn(),
}));

describe("InheritedPermissionsView", () => {
  beforeEach(() => {
    vi.mocked(networking.fetchMCPServers).mockReset();
  });

  it("always renders the card with an empty-state placeholder when nothing is inherited", () => {
    render(
      <InheritedPermissionsView
        sources={[{ label: "via team A", mcpServers: [], models: [], agents: [] }]}
      />,
    );
    // Card is shown (not null) so the feature is discoverable.
    expect(screen.getByText("Inherited Permissions")).toBeInTheDocument();
    expect(screen.getByText(/Nothing is inherited yet/)).toBeInTheDocument();
  });

  it("appends the caller-supplied empty-state hint", () => {
    render(
      <InheritedPermissionsView
        sources={[]}
        emptyStateHint="Assign this team to an Access Group."
      />,
    );
    expect(
      screen.getByText(/Assign this team to an Access Group\./),
    ).toBeInTheDocument();
  });

  it("renders grouped inherited items with provenance and hides empty rows", () => {
    render(
      <InheritedPermissionsView
        sources={[
          {
            label: "via team H&A General",
            mcpServers: ["MCP_Time"],
            models: [],
            agents: ["agent-core"],
          },
          {
            label: "via Access Groups",
            mcpServers: [],
            models: ["gpt-4o"],
            agents: [],
          },
        ]}
      />,
    );
    expect(screen.getByText("Inherited Permissions")).toBeInTheDocument();
    expect(screen.getByText("via team H&A General")).toBeInTheDocument();
    expect(screen.getByText("via Access Groups")).toBeInTheDocument();
    expect(screen.getByText("MCP_Time")).toBeInTheDocument();
    expect(screen.getByText("agent-core")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
    // empty "Inherited Models" row for the first source must be hidden;
    // exactly one "Inherited Models" header (from the second source).
    expect(screen.getAllByText("Inherited Models")).toHaveLength(1);
    expect(screen.getAllByText("Inherited MCP Servers")).toHaveLength(1);
    // The placeholder must NOT show when there are real items.
    expect(screen.queryByText(/Nothing is inherited yet/)).not.toBeInTheDocument();
  });

  it("drops sources that are entirely empty", () => {
    render(
      <InheritedPermissionsView
        sources={[
          { label: "empty src", mcpServers: [], models: [], agents: [] },
          { label: "real src", mcpServers: ["s1"], models: [], agents: [] },
        ]}
      />,
    );
    expect(screen.queryByText("empty src")).not.toBeInTheDocument();
    expect(screen.getByText("real src")).toBeInTheDocument();
  });

  it("shows the raw MCP server id when no accessToken is given (unresolved)", () => {
    render(
      <InheritedPermissionsView
        sources={[
          { label: "src", mcpServers: ["srv-abc-123"], models: [], agents: [] },
        ]}
      />,
    );
    expect(screen.getByText("srv-abc-123")).toBeInTheDocument();
    expect(networking.fetchMCPServers).not.toHaveBeenCalled();
  });

  it("resolves MCP server ids to a friendly name with the id beneath it", async () => {
    vi.mocked(networking.fetchMCPServers).mockResolvedValue([
      { server_id: "srv-abc-123", alias: "Time Server", server_name: "time" },
    ] as any);

    render(
      <InheritedPermissionsView
        accessToken="sk-test"
        sources={[
          { label: "src", mcpServers: ["srv-abc-123"], models: [], agents: [] },
        ]}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Time Server")).toBeInTheDocument(),
    );
    // The id is still shown as a secondary line ("name as well as its ID").
    expect(screen.getByText("srv-abc-123")).toBeInTheDocument();
    expect(networking.fetchMCPServers).toHaveBeenCalledWith("sk-test");
  });
});
