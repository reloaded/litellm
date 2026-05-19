import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InheritedPermissionsView } from "./InheritedPermissionsView";

describe("InheritedPermissionsView", () => {
  it("renders nothing when there is nothing inherited", () => {
    const { container } = render(
      <InheritedPermissionsView
        sources={[{ label: "via team A", mcpServers: [], models: [], agents: [] }]}
      />,
    );
    expect(container.firstChild).toBeNull();
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
});
