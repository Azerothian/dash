import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Plus, Edit2, Trash2, Loader2, Star, StarOff,
  GripVertical, Settings2, Lock, Unlock,
} from 'lucide-react'
import { GridStack } from 'gridstack'
import 'gridstack/dist/gridstack.min.css'
import { useUiStore } from '../stores/ui-store'
import {
  useDashboards, useDashboard, useCreateDashboard, useDeleteDashboard,
  useSetPrimaryDashboard, useCreatePanel, useUpdatePanel, useDeletePanel,
  useBatchUpdatePanels,
} from '../hooks/useDashboards'
import { GraphPanel } from '../components/dashboard/GraphPanel'
import { CustomPanel } from '../components/dashboard/CustomPanel'
import { PanelOptionsSheet } from '../components/dashboard/PanelOptionsSheet'
import type { Panel, CreatePanel, UpdatePanel, Dashboard } from '@shared/entities'

export function DashboardPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: dashboards, isLoading: dashListLoading } = useDashboards()
  const editMode = useUiStore((s) => s.editMode)
  const setEditMode = useUiStore((s) => s.setEditMode)
  const activeDashboardId = useUiStore((s) => s.activeDashboardId)
  const setActiveDashboardId = useUiStore((s) => s.setActiveDashboardId)

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newDashName, setNewDashName] = useState('')
  const [editingPanel, setEditingPanel] = useState<Panel | null>(null)
  const [showAddPanel, setShowAddPanel] = useState(false)

  const createDashMutation = useCreateDashboard()
  const deleteDashMutation = useDeleteDashboard()
  const setPrimaryMutation = useSetPrimaryDashboard()
  const createPanelMutation = useCreatePanel()
  const updatePanelMutation = useUpdatePanel()
  const deletePanelMutation = useDeletePanel()
  const batchUpdateMutation = useBatchUpdatePanels()

  // Determine which dashboard to show
  const currentDashId = id || activeDashboardId || dashboards?.find((d) => d.is_primary)?.id || dashboards?.[0]?.id
  const { data: currentDash, isLoading: dashLoading } = useDashboard(currentDashId)

  useEffect(() => {
    if (currentDashId && currentDashId !== activeDashboardId) {
      setActiveDashboardId(currentDashId)
    }
  }, [currentDashId, activeDashboardId, setActiveDashboardId])

  const handleCreateDashboard = async () => {
    if (!newDashName.trim()) return
    const dash = await createDashMutation.mutateAsync({ name: newDashName, is_primary: !dashboards?.length })
    setShowCreateDialog(false)
    setNewDashName('')
    navigate(`/dashboard/${dash.id}`)
  }

  const handleDeleteDashboard = async (dashId: string) => {
    if (!confirm('Delete this dashboard and all its panels?')) return
    await deleteDashMutation.mutateAsync(dashId)
    navigate('/dashboard')
  }

  const handleSavePanel = async (data: CreatePanel | UpdatePanel) => {
    if ('dashboard_id' in data) {
      await createPanelMutation.mutateAsync(data as CreatePanel)
    } else {
      await updatePanelMutation.mutateAsync(data as UpdatePanel)
    }
    setShowAddPanel(false)
    setEditingPanel(null)
  }

  if (dashListLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!dashboards?.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <LayoutDashboard className="mb-4 h-16 w-16 opacity-20" />
        <h2 className="text-2xl font-semibold text-foreground">No Dashboards</h2>
        <p className="mt-2 mb-4">Create your first dashboard to get started.</p>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Dashboard
        </button>
        {showCreateDialog && (
          <CreateDashboardDialog
            name={newDashName}
            onNameChange={setNewDashName}
            onSubmit={handleCreateDashboard}
            onClose={() => setShowCreateDialog(false)}
            isPending={createDashMutation.isPending}
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Dashboard tabs + controls */}
      <div className="flex items-center justify-between border-b border-border px-1 py-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {dashboards.map((d) => (
            <button
              key={d.id}
              onClick={() => navigate(`/dashboard/${d.id}`)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm whitespace-nowrap ${
                d.id === currentDashId
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {d.is_primary && <Star className="h-3 w-3" />}
              {d.name}
            </button>
          ))}
          <button
            onClick={() => setShowCreateDialog(true)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
            title="New Dashboard"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          {currentDash && !currentDash.is_primary && (
            <button
              onClick={() => setPrimaryMutation.mutate(currentDash.id)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
              title="Set as primary"
            >
              <StarOff className="h-4 w-4" />
            </button>
          )}
          {currentDash && (
            <button
              onClick={() => handleDeleteDashboard(currentDash.id)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="Delete dashboard"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setEditMode(!editMode)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
              editMode ? 'bg-amber-500/10 text-amber-600' : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            {editMode ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {editMode ? 'Editing' : 'Edit'}
          </button>
        </div>
      </div>

      {/* Grid area */}
      {dashLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4">
          {currentDash && (
            <DashboardGrid
              dashboard={currentDash}
              editMode={editMode}
              onEditPanel={setEditingPanel}
              onDeletePanel={(panelId) => deletePanelMutation.mutate(panelId)}
              onBatchUpdate={(updates) => batchUpdateMutation.mutate(updates)}
            />
          )}
          {editMode && currentDash && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setShowAddPanel(true)}
                className="flex items-center gap-2 rounded-md border-2 border-dashed border-border px-6 py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary"
              >
                <Plus className="h-4 w-4" />
                Add Panel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      {showCreateDialog && (
        <CreateDashboardDialog
          name={newDashName}
          onNameChange={setNewDashName}
          onSubmit={handleCreateDashboard}
          onClose={() => setShowCreateDialog(false)}
          isPending={createDashMutation.isPending}
        />
      )}

      {(showAddPanel || editingPanel) && currentDash && (
        <PanelOptionsSheet
          panel={editingPanel || undefined}
          dashboardId={currentDash.id}
          onSave={handleSavePanel}
          onClose={() => { setShowAddPanel(false); setEditingPanel(null) }}
          isPending={createPanelMutation.isPending || updatePanelMutation.isPending}
        />
      )}
    </div>
  )
}

// --- Dashboard Grid with GridStack ---

interface DashboardGridProps {
  dashboard: Dashboard
  editMode: boolean
  onEditPanel: (panel: Panel) => void
  onDeletePanel: (id: string) => void
  onBatchUpdate: (updates: { id: string; gridstack_config: { x: number; y: number; w: number; h: number } }[]) => void
}

function DashboardGrid({ dashboard, editMode, onEditPanel, onDeletePanel, onBatchUpdate }: DashboardGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const gsRef = useRef<GridStack | null>(null)
  const panels = dashboard.panels || []

  useEffect(() => {
    if (!gridRef.current) return

    const grid = GridStack.init({
      column: 12,
      cellHeight: 80,
      margin: 8,
      animate: true,
      float: false,
      disableResize: !editMode,
      disableDrag: !editMode,
      staticGrid: !editMode,
    }, gridRef.current)

    gsRef.current = grid

    grid.on('change', (_event, items) => {
      if (!items || !Array.isArray(items)) return
      const updates = items.map((item) => ({
        id: item.id as string,
        gridstack_config: { x: item.x ?? 0, y: item.y ?? 0, w: item.w ?? 4, h: item.h ?? 3 },
      }))
      onBatchUpdate(updates)
    })

    return () => {
      grid.destroy(false)
      gsRef.current = null
    }
  }, [dashboard.id, editMode])

  useEffect(() => {
    const grid = gsRef.current
    if (!grid) return
    if (editMode) {
      grid.enable()
    } else {
      grid.disable()
    }
  }, [editMode])

  if (!panels.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <LayoutDashboard className="mb-4 h-12 w-12 opacity-20" />
        <p>No panels yet.{editMode ? ' Click "Add Panel" to get started.' : ' Enable edit mode to add panels.'}</p>
      </div>
    )
  }

  return (
    <div ref={gridRef} className="grid-stack">
      {panels.map((panel) => (
        <div
          key={panel.id}
          className="grid-stack-item"
          gs-id={panel.id}
          gs-x={panel.gridstack_config.x}
          gs-y={panel.gridstack_config.y}
          gs-w={panel.gridstack_config.w}
          gs-h={panel.gridstack_config.h}
          gs-min-w={panel.gridstack_config.minW || 2}
          gs-min-h={panel.gridstack_config.minH || 2}
        >
          <div className="grid-stack-item-content rounded-lg border border-border bg-card overflow-hidden">
            <div className="relative h-full">
              {editMode && (
                <div className="absolute top-1 right-1 z-10 flex gap-0.5">
                  <button
                    onClick={() => onEditPanel(panel)}
                    className="rounded p-1 bg-card/80 text-muted-foreground hover:bg-accent"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onDeletePanel(panel.id)}
                    className="rounded p-1 bg-card/80 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {panel.type === 'graph' ? (
                <GraphPanel panel={panel} />
              ) : (
                <CustomPanel panel={panel} />
              )}
              {/* Alert state border */}
              {panel.alert_ids?.length ? <AlertBorderOverlay alertIds={panel.alert_ids} /> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function AlertBorderOverlay({ alertIds }: { alertIds: string[] }) {
  // This would check alert states and apply border colors
  // For now, just a placeholder that could be enhanced with useAlerts
  return null
}

// --- Create Dashboard Dialog ---

function CreateDashboardDialog({
  name, onNameChange, onSubmit, onClose, isPending,
}: {
  name: string
  onNameChange: (v: string) => void
  onSubmit: () => void
  onClose: () => void
  isPending: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-96 rounded-lg border border-border bg-card p-6 shadow-lg">
        <h3 className="text-lg font-semibold mb-4">New Dashboard</h3>
        <input
          type="text"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mb-4"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Dashboard name..."
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm hover:bg-accent">
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={isPending || !name.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
