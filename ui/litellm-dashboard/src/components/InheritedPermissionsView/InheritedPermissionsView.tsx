import React from "react";
import { Text } from "@tremor/react";

/**
 * Read-only view of permissions a key/team INHERITS (vs. its own
 * object_permission), with provenance. Resolution is done by the caller;
 * this component only renders. Sections with no items are hidden, and the
 * whole block is hidden when nothing is inherited.
 */
export interface InheritedSource {
  /** e.g. "via team H&A General" or "via Access Groups" */
  label: string;
  mcpServers: string[];
  models: string[];
  agents: string[];
}

interface InheritedPermissionsViewProps {
  sources: InheritedSource[];
  className?: string;
}

const Row = ({ title, items }: { title: string; items: string[] }) => {
  if (!items.length) return null;
  return (
    <div className="mb-3">
      <Text className="font-medium">{title}</Text>
      <div className="flex flex-wrap gap-2 mt-1">
        {items.map((it) => (
          <span
            key={it}
            className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded"
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
};

export function InheritedPermissionsView({
  sources,
  className = "",
}: InheritedPermissionsViewProps) {
  const nonEmpty = sources.filter(
    (s) => s.mcpServers.length || s.models.length || s.agents.length,
  );
  if (!nonEmpty.length) return null;

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
      {nonEmpty.map((s) => (
        <div
          key={s.label}
          className="border-t border-gray-100 pt-4 mt-4 first:border-t-0 first:pt-0 first:mt-0"
        >
          <Text className="text-sm font-semibold text-gray-600 mb-2">
            {s.label}
          </Text>
          <Row title="Inherited MCP Servers" items={s.mcpServers} />
          <Row title="Inherited Models" items={s.models} />
          <Row title="Inherited Agents" items={s.agents} />
        </div>
      ))}
    </div>
  );
}

export default InheritedPermissionsView;
