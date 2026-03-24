import { memo, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { HierarchyNode } from "../../shared/hierarchy/types";

// ============================================
// HELPERS
// ============================================

function HierarchyRow({
  node,
  depth,
  expandedIds,
  selectedId,
  editingNodeId,
  renameDraft,
  onStartRename,
  onRenameDraftChange,
  onCommitRename,
  onCancelRename,
  onToggleExpanded,
  onSelectNode,
}: {
  node: HierarchyNode;
  depth: number;
  expandedIds: Set<string>;
  selectedId: string | null;
  editingNodeId: string | null;
  renameDraft: string;
  onStartRename: (node: HierarchyNode) => void;
  onRenameDraftChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onToggleExpanded: (id: string) => void;
  onSelectNode: (node: HierarchyNode) => void;
}) {
  const hasChildren = node.children.length > 0;
  const expanded = expandedIds.has(node.id);
  const isEditing = editingNodeId === node.id;

  return (
    <>
      <button
        className={`hierarchy-panel__row${
          selectedId === node.id ? " hierarchy-panel__row--selected" : ""
        }`}
        onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
          if (event.detail > 1) {
            return;
          }

          if (node.selectable) {
            onSelectNode(node);
            return;
          }

          if (hasChildren) {
            onToggleExpanded(node.id);
          }
        }}
        onDoubleClick={() => {
          if (node.selectable) {
            onStartRename(node);
          }
        }}
        style={{ paddingLeft: 12 + depth * 16 }}
        type="button"
      >
        <span className="hierarchy-panel__chevron">
          {hasChildren ? (expanded ? "▾" : "▸") : ""}
        </span>

        {isEditing ? (
          <input
            autoFocus
            className="hierarchy-panel__rename-input"
            onBlur={onCommitRename}
            onChange={(event) => onRenameDraftChange(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                onCommitRename();
              }
              if (event.key === "Escape") {
                onCancelRename();
              }
            }}
            value={renameDraft}
          />
        ) : (
          <span className="hierarchy-panel__label">{node.name}</span>
        )}
      </button>

      {hasChildren && expanded
        ? node.children.map((child) => (
            <HierarchyRow
              key={child.id}
              depth={depth + 1}
              editingNodeId={editingNodeId}
              expandedIds={expandedIds}
              node={child}
              onCancelRename={onCancelRename}
              onCommitRename={onCommitRename}
              onRenameDraftChange={onRenameDraftChange}
              onSelectNode={onSelectNode}
              onStartRename={onStartRename}
              onToggleExpanded={onToggleExpanded}
              renameDraft={renameDraft}
              selectedId={selectedId}
            />
          ))
        : null}
    </>
  );
}

// ============================================
// HIERARCHY PANEL
// ============================================

export const HierarchyPanel = memo(function HierarchyPanel({
  collapsed,
  expandedIds,
  root,
  selectedId,
  onToggleCollapsed,
  onToggleExpanded,
  onSelectNode,
  onRenameNode,
}: {
  collapsed: boolean;
  expandedIds: Set<string>;
  root: HierarchyNode;
  selectedId: string | null;
  onToggleCollapsed: () => void;
  onToggleExpanded: (id: string) => void;
  onSelectNode: (node: HierarchyNode) => void;
  onRenameNode: (node: HierarchyNode, nextName: string) => void;
}) {
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const activeEditingNodeId =
    editingNodeId && selectedId === editingNodeId ? editingNodeId : null;

  return (
    <>
      <button
        className={`hierarchy-tab${collapsed ? " hierarchy-tab--visible" : ""}`}
        onClick={onToggleCollapsed}
        type="button"
        aria-label="Expand hierarchy"
      >
        Hierarchy
      </button>

      <div className={`hierarchy-panel${collapsed ? " hierarchy-panel--hidden" : ""}`}>
        <div className="hierarchy-panel__header">
          <div>
            <div className="hierarchy-panel__eyebrow">Hierarchy</div>
            <div className="hierarchy-panel__title">Object Tree</div>
          </div>
          <button
            className="hierarchy-panel__toggle"
            onClick={onToggleCollapsed}
            type="button"
            aria-label="Collapse hierarchy"
          >
            {">"}
          </button>
        </div>

        <div className="hierarchy-panel__body">
          <HierarchyRow
            depth={0}
            editingNodeId={activeEditingNodeId}
            expandedIds={expandedIds}
            node={root}
            onCancelRename={() => {
              setEditingNodeId(null);
              setRenameDraft("");
            }}
            onCommitRename={() => {
              if (!activeEditingNodeId) {
                return;
              }

              const nextName = renameDraft.trim();
              if (nextName) {
                const findNode = (candidate: HierarchyNode): HierarchyNode | null => {
                  if (candidate.id === activeEditingNodeId) {
                    return candidate;
                  }

                  for (const child of candidate.children) {
                    const match = findNode(child);
                    if (match) {
                      return match;
                    }
                  }

                  return null;
                };

                const targetNode = findNode(root);
                if (targetNode) {
                  onRenameNode(targetNode, nextName);
                }
              }

              setEditingNodeId(null);
              setRenameDraft("");
            }}
            onRenameDraftChange={setRenameDraft}
            onSelectNode={onSelectNode}
            onStartRename={(node) => {
              setEditingNodeId(node.id);
              setRenameDraft(node.name);
            }}
            onToggleExpanded={onToggleExpanded}
            renameDraft={renameDraft}
            selectedId={selectedId}
          />
        </div>
      </div>
    </>
  );
});
