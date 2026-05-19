import React, { useEffect, useState } from "react";
import { Text } from "@tremor/react";
import { fetchMCPServers } from "../networking";
import { MCPServer } from "../mcp_tools/types";

/**
 * Read-only view of permissions a key/team INHERITS (vs. its own
 * object_permission), with provenance. Source resolution is done by the
 * caller; this component renders, and additionally resolves inherited MCP
 * server IDs to a friendly name + ID when an accessToken is provided.
 *
 * The card is ALWAYS rendered (even with nothing inherited) so users can
 * see the feature exists and learn why it is empty — see reloaded/litellm
 * issue 8. Per-section rows with no items are still hidden.
 */
export interface InheritedSource {
  /** e.g. "via team H&A General" or "via Access Groups" */
  label: string;
  /** MCP server IDs — rendered as "name (id)" when resolvable */
  mcpServers: string[];
  models: string[];
  agents: string[];
}

interface InheritedPermissionsViewProps {
  sources: InheritedSource[];
  className?: string;
  /** When set, inherited MCP server IDs are resolved to friendly names. */
  accessToken?: string | null;
  /**
   * Brief, context-specific hint appended to the empty-state message
   * (e.g. how this particular entity would gain inherited permissions).
   */
  emptyStateHint?: string;
}

interface DisplayItem {
  /** Primary label (friendly name, or the raw id when unresolved). */
  primary: string;
  /** Optional secondary line (the underlying id). */
  secondary?: string;
}

const Row = ({ title, items }: { title: string; items: DisplayItem[] }) => {
  if (!items.length) return null;
  return (
    <div className="mb-3">
      <Text className="font-medium">{title}</Text>
      <div className="flex flex-wrap gap-2 mt-1">
        {items.map((it) => (
          <span
            key={`${it.primary}|${it.secondary ?? ""}`}
            className="inline-flex flex-col bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded"
          >
            <span>{it.primary}</span>
            {it.secondary ? (
              <span className="text-[10px] text-gray-400 font-mono break-all">
                {it.secondary}
              </span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
};

export function InheritedPermissionsView({
  sources,
  className = "",
  accessToken,
  emptyStateHint,
}: InheritedPermissionsViewProps) {
  const [mcpServerDetails, setMCPServerDetails] = useState<MCPServer[]>([]);

  const anyMcp = sources.some((s) => s.mcpServers.length > 0);

  useEffect(() => {
    const load = async () => {
      if (!accessToken || !anyMcp) return;
      try {
        const response = await fetchMCPServers(accessToken);
        const list = Array.isArray(response)
          ? response
          : Array.isArray(response?.data)
            ? response.data
            : [];
        setMCPServerDetails(list);
      } catch (error) {
        console.error("Error fetching MCP servers:", error);
      }
    };
    load();
  }, [accessToken, anyMcp]);

  // Resolve an MCP server id to "friendly name" + the id beneath it. Falls
  // back to just the id when the server list is unavailable/unresolved.
  const mcpItem = (serverId: string): DisplayItem => {
    const detail = mcpServerDetails.find((s) => s.server_id === serverId);
    const name = detail?.alias || detail?.server_name;
    return name ? { primary: name, secondary: serverId } : { primary: serverId };
  };

  const nonEmpty = sources.filter(
    (s) => s.mcpServers.length || s.models.length || s.agents.length,
  );

  return (
    <div
      className={`bg-white border border-gray-200 rounded-lg p-6 mt-6 ${className}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Text className="text-base font-semibold">Inherited Permissions</Text>
      </div>
      <Text className="text-gray-500 text-sm mb-4">
        Granted indirectly (via team and/or access groups), in addition to
        this entity&apos;s own permissions above.
      </Text>
      {nonEmpty.length === 0 ? (
        <div className="border border-dashed border-gray-200 rounded-md p-4 bg-gray-50">
          <Text className="text-sm text-gray-600">
            Nothing is inherited yet.
            {emptyStateHint ? ` ${emptyStateHint}` : ""}
          </Text>
        </div>
      ) : (
        nonEmpty.map((s) => (
          <div
            key={s.label}
            className="border-t border-gray-100 pt-4 mt-4 first:border-t-0 first:pt-0 first:mt-0"
          >
            <Text className="text-sm font-semibold text-gray-600 mb-2">
              {s.label}
            </Text>
            <Row
              title="Inherited MCP Servers"
              items={s.mcpServers.map(mcpItem)}
            />
            <Row
              title="Inherited Models"
              items={s.models.map((m) => ({ primary: m }))}
            />
            <Row
              title="Inherited Agents"
              items={s.agents.map((a) => ({ primary: a }))}
            />
          </div>
        ))
      )}
    </div>
  );
}

export default InheritedPermissionsView;
