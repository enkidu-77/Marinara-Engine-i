// ──────────────────────────────────────────────
// Panel: Agents & Tools
// ──────────────────────────────────────────────
import { useState } from "react";
import {
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Pencil,
  Plus,
  Wrench,
  ChevronDown,
  Trash2,
  Bot,
  Regex,
  PenLine,
  Radar,
  Puzzle,
} from "lucide-react";
import { useUIStore } from "../../stores/ui.store";
import { useAgentConfigs, useToggleAgent, useDeleteAgent, type AgentConfigRow } from "../../hooks/use-agents";
import { useCustomTools, useDeleteCustomTool, type CustomToolRow } from "../../hooks/use-custom-tools";
import { useRegexScripts, useDeleteRegexScript, type RegexScriptRow } from "../../hooks/use-regex-scripts";
import { BUILT_IN_AGENTS, type AgentCategory } from "@marinara-engine/shared";
import { cn } from "../../lib/utils";

export function AgentsPanel() {
  const { data: agentConfigs, isLoading } = useAgentConfigs();
  const { data: customTools } = useCustomTools();
  const { data: regexScripts } = useRegexScripts();
  const toggleAgent = useToggleAgent();
  const deleteAgent = useDeleteAgent();
  const deleteTool = useDeleteCustomTool();
  const deleteRegex = useDeleteRegexScript();
  const openAgentDetail = useUIStore((s) => s.openAgentDetail);
  const openToolDetail = useUIStore((s) => s.openToolDetail);
  const openRegexDetail = useUIStore((s) => s.openRegexDetail);

  // Custom agents = DB entries whose type doesn't match any built-in
  const customAgents = ((agentConfigs ?? []) as AgentConfigRow[]).filter(
    (c) => !BUILT_IN_AGENTS.some((b) => b.id === c.type),
  );

  const handleCreateAgent = () => {
    // Create a new custom agent immediately in DB then open editor
    openAgentDetail("__new__");
  };

  const handleCreateTool = () => {
    openToolDetail("__new__");
  };

  const handleCreateRegex = () => {
    openRegexDetail("__new__");
  };

  return (
    <div className="flex flex-col gap-1 p-3">
      {isLoading && <div className="py-4 text-center text-xs text-[var(--muted-foreground)]">Loading...</div>}

      {/* ── Built-in Agents ── */}
      {[
        {
          category: "writer" as AgentCategory,
          title: "Writer Agents",
          icon: <PenLine size={13} />,
          desc: "Prose quality, continuity, directions, and narrative flow.",
        },
        {
          category: "tracker" as AgentCategory,
          title: "Tracker Agents",
          icon: <Radar size={13} />,
          desc: "Track world state, expressions, quests, backgrounds, and characters.",
        },
        {
          category: "misc" as AgentCategory,
          title: "Misc Agents",
          icon: <Puzzle size={13} />,
          desc: "Utilities, combat, illustrations, and other helpers.",
        },
      ].map(({ category, title, icon, desc }) => {
        const agents = BUILT_IN_AGENTS.filter((a) => a.category === category);
        if (agents.length === 0) return null;
        return (
          <PanelSection key={category} title={title} icon={icon} defaultOpen>
            <div className="text-[10px] text-[var(--muted-foreground)] mb-1.5">{desc}</div>
            {agents.map((agent) => {
              const config = (agentConfigs as Array<{ type: string; enabled: string }> | undefined)?.find(
                (c) => c.type === agent.id,
              );
              const enabled = config ? config.enabled === "true" : agent.enabledByDefault;

              return (
                <div
                  key={agent.id}
                  className="flex items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-[var(--sidebar-accent)]"
                >
                  <Sparkles size={14} className="mt-0.5 shrink-0 text-[var(--primary)]" />
                  <button className="min-w-0 flex-1 text-left" onClick={() => openAgentDetail(agent.id)}>
                    <div className="text-xs font-medium">{agent.name}</div>
                    <div className="text-[10px] text-[var(--muted-foreground)] line-clamp-2">{agent.description}</div>
                  </button>
                  <button
                    className="mt-0.5 shrink-0 text-[var(--muted-foreground)] transition-colors hover:text-[var(--primary)]"
                    title="Edit agent"
                    onClick={() => openAgentDetail(agent.id)}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="mt-0.5 shrink-0 text-[var(--muted-foreground)] transition-colors hover:text-[var(--primary)]"
                    onClick={() => toggleAgent.mutate(agent.id)}
                    disabled={toggleAgent.isPending}
                  >
                    {enabled ? <ToggleRight size={18} className="text-[var(--primary)]" /> : <ToggleLeft size={18} />}
                  </button>
                </div>
              );
            })}
          </PanelSection>
        );
      })}

      {/* ── Custom Agents ── */}
      <PanelSection
        title="Custom Agents"
        icon={<Bot size={13} />}
        action={
          <button
            onClick={handleCreateAgent}
            className="rounded-md p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--primary)]"
            title="Create custom agent"
          >
            <Plus size={13} />
          </button>
        }
      >
        {customAgents.length === 0 ? (
          <p className="text-[10px] text-[var(--muted-foreground)] px-1 py-2">
            No custom agents yet. Create one to define your own AI-powered pipeline agent.
          </p>
        ) : (
          customAgents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-[var(--sidebar-accent)]"
            >
              <Bot size={14} className="mt-0.5 shrink-0 text-[var(--y2k-pink)]" />
              <button className="min-w-0 flex-1 text-left" onClick={() => openAgentDetail(agent.id)}>
                <div className="text-xs font-medium">{agent.name}</div>
                <div className="text-[10px] text-[var(--muted-foreground)] line-clamp-2">
                  {agent.description || "No description"}
                </div>
              </button>
              <button
                className="mt-0.5 shrink-0 text-[var(--muted-foreground)] transition-colors hover:text-[var(--primary)]"
                title="Edit agent"
                onClick={() => openAgentDetail(agent.id)}
              >
                <Pencil size={13} />
              </button>
              <button
                className="mt-0.5 shrink-0 text-[var(--muted-foreground)] transition-colors hover:text-[var(--destructive)]"
                title="Delete agent"
                onClick={() => {
                  if (confirm(`Delete "${agent.name}"?`)) deleteAgent.mutate(agent.id);
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </PanelSection>

      {/* ── Custom Function Tools ── */}
      <PanelSection
        title="Custom Tools"
        icon={<Wrench size={13} />}
        action={
          <button
            onClick={handleCreateTool}
            className="rounded-md p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--primary)]"
            title="Create custom tool"
          >
            <Plus size={13} />
          </button>
        }
      >
        <div className="text-[10px] text-[var(--muted-foreground)] mb-1.5">
          Define custom functions the AI can call during generation (webhook, script, or static).
        </div>
        {!customTools || (customTools as CustomToolRow[]).length === 0 ? (
          <p className="text-[10px] text-[var(--muted-foreground)] px-1 py-2">No custom tools yet.</p>
        ) : (
          (customTools as CustomToolRow[]).map((tool) => (
            <div
              key={tool.id}
              className="flex items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-[var(--sidebar-accent)]"
            >
              <Wrench size={14} className="mt-0.5 shrink-0 text-[var(--y2k-purple)]" />
              <button className="min-w-0 flex-1 text-left" onClick={() => openToolDetail(tool.id)}>
                <div className="text-xs font-medium font-mono">{tool.name}</div>
                <div className="text-[10px] text-[var(--muted-foreground)] line-clamp-2">
                  {tool.description || "No description"}
                </div>
              </button>
              <span className="mt-0.5 rounded bg-[var(--secondary)] px-1.5 py-0.5 text-[9px] text-[var(--muted-foreground)]">
                {tool.executionType}
              </span>
              <button
                className="mt-0.5 shrink-0 text-[var(--muted-foreground)] transition-colors hover:text-[var(--primary)]"
                title="Edit tool"
                onClick={() => openToolDetail(tool.id)}
              >
                <Pencil size={13} />
              </button>
              <button
                className="mt-0.5 shrink-0 text-[var(--muted-foreground)] transition-colors hover:text-[var(--destructive)]"
                title="Delete tool"
                onClick={() => {
                  if (confirm(`Delete "${tool.name}"?`)) deleteTool.mutate(tool.id);
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </PanelSection>

      {/* ── Regex Scripts ── */}
      <PanelSection
        title="Regex Scripts"
        icon={<Regex size={13} />}
        action={
          <button
            onClick={handleCreateRegex}
            className="rounded-md p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--primary)]"
            title="Create regex script"
          >
            <Plus size={13} />
          </button>
        }
      >
        <div className="text-[10px] text-[var(--muted-foreground)] mb-1.5">
          Find/replace patterns applied to AI output or user input — like SillyTavern regex scripts.
        </div>
        {!regexScripts || (regexScripts as RegexScriptRow[]).length === 0 ? (
          <p className="text-[10px] text-[var(--muted-foreground)] px-1 py-2">No regex scripts yet.</p>
        ) : (
          (regexScripts as RegexScriptRow[]).map((script) => {
            const placements = (() => {
              try {
                return JSON.parse(script.placement) as string[];
              } catch {
                return [];
              }
            })();
            const enabled = script.enabled === "true";
            return (
              <div
                key={script.id}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-[var(--sidebar-accent)]",
                  !enabled && "opacity-50",
                )}
              >
                <Regex size={14} className="mt-0.5 shrink-0 text-orange-400" />
                <button className="min-w-0 flex-1 text-left" onClick={() => openRegexDetail(script.id)}>
                  <div className="text-xs font-medium">{script.name}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {placements.map((p: string) => (
                      <span
                        key={p}
                        className="rounded bg-[var(--secondary)] px-1 py-0.5 text-[8px] text-[var(--muted-foreground)]"
                      >
                        {p === "ai_output" ? "AI" : "User"}
                      </span>
                    ))}
                    <span className="text-[9px] text-[var(--muted-foreground)] font-mono truncate max-w-[100px]">
                      /{script.findRegex}/{script.flags}
                    </span>
                  </div>
                </button>
                <button
                  className="mt-0.5 shrink-0 text-[var(--muted-foreground)] transition-colors hover:text-[var(--primary)]"
                  title="Edit script"
                  onClick={() => openRegexDetail(script.id)}
                >
                  <Pencil size={13} />
                </button>
                <button
                  className="mt-0.5 shrink-0 text-[var(--muted-foreground)] transition-colors hover:text-[var(--destructive)]"
                  title="Delete script"
                  onClick={() => {
                    if (confirm(`Delete "${script.name}"?`)) deleteRegex.mutate(script.id);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })
        )}
      </PanelSection>
    </div>
  );
}

// ── Collapsible section ──
function PanelSection({
  title,
  icon,
  action,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[var(--border)] pb-1 mb-1 last:border-b-0">
      <div className="flex items-center gap-1.5 px-1 py-1.5">
        <button onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-1.5 text-left">
          <span className="text-[var(--muted-foreground)]">{icon}</span>
          <span className="text-[11px] font-semibold">{title}</span>
          <ChevronDown
            size={11}
            className={cn("text-[var(--muted-foreground)] transition-transform", open && "rotate-180")}
          />
        </button>
        {action}
      </div>
      {open && <div className="px-0.5">{children}</div>}
    </div>
  );
}
