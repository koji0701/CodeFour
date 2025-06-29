import type { BoundingBox } from './types'

export interface UndoRedoAction {
  id: string
  type: 'add' | 'edit' | 'delete' | 'multi-add'
  frame: number
  timestamp: number
  // For single-frame operations
  beforeState?: BoundingBox[]
  afterState?: BoundingBox[]
  // For multi-frame operations
  affectedFrames?: number[]
  beforeStates?: Record<number, BoundingBox[]>
  afterStates?: Record<number, BoundingBox[]>
}

export interface UndoRedoState {
  history: UndoRedoAction[]
  currentIndex: number // -1 means no actions, 0 means at first action
}

export class UndoRedoManager {
  private state: UndoRedoState = {
    history: [],
    currentIndex: -1
  }

  private maxHistorySize = 50 // Limit history to prevent memory issues

  /**
   * Record a single-frame bounding box operation
   */
  recordSingleFrameAction(
    type: 'add' | 'edit' | 'delete',
    frame: number,
    beforeState: BoundingBox[],
    afterState: BoundingBox[]
  ): void {
    const action: UndoRedoAction = {
      id: `${type}-${Date.now()}-${Math.random()}`,
      type,
      frame,
      timestamp: Date.now(),
      beforeState: [...beforeState],
      afterState: [...afterState]
    }

    this.addAction(action)
  }

  /**
   * Record a multi-frame bounding box operation
   */
  recordMultiFrameAction(
    frame: number,
    affectedFrames: number[],
    beforeStates: Record<number, BoundingBox[]>,
    afterStates: Record<number, BoundingBox[]>
  ): void {
    const action: UndoRedoAction = {
      id: `multi-add-${Date.now()}-${Math.random()}`,
      type: 'multi-add',
      frame,
      timestamp: Date.now(),
      affectedFrames: [...affectedFrames],
      beforeStates: Object.fromEntries(
        Object.entries(beforeStates).map(([k, v]) => [k, [...v]])
      ),
      afterStates: Object.fromEntries(
        Object.entries(afterStates).map(([k, v]) => [k, [...v]])
      )
    }

    this.addAction(action)
  }

  private addAction(action: UndoRedoAction): void {
    // Remove any actions after current index (when we're not at the latest)
    this.state.history = this.state.history.slice(0, this.state.currentIndex + 1)
    
    // Add the new action
    this.state.history.push(action)
    this.state.currentIndex = this.state.history.length - 1

    // Limit history size
    if (this.state.history.length > this.maxHistorySize) {
      this.state.history.shift()
      this.state.currentIndex--
    }
  }

  /**
   * Undo the last action and return the action and target frame
   */
  undo(): { action: UndoRedoAction; targetFrame: number } | null {
    if (!this.canUndo()) {
      return null
    }

    const action = this.state.history[this.state.currentIndex]
    this.state.currentIndex--

    return {
      action,
      targetFrame: action.frame
    }
  }

  /**
   * Redo the next action and return the action and target frame
   */
  redo(): { action: UndoRedoAction; targetFrame: number } | null {
    if (!this.canRedo()) {
      return null
    }

    this.state.currentIndex++
    const action = this.state.history[this.state.currentIndex]

    return {
      action,
      targetFrame: action.frame
    }
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.state.currentIndex >= 0
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.state.currentIndex < this.state.history.length - 1
  }

  /**
   * Get current state for debugging
   */
  getState(): UndoRedoState {
    return {
      history: [...this.state.history],
      currentIndex: this.state.currentIndex
    }
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.state.history = []
    this.state.currentIndex = -1
  }

  /**
   * Get a description of the last action for UI purposes
   */
  getLastActionDescription(): string | null {
    if (this.state.currentIndex < 0) {
      return null
    }

    const action = this.state.history[this.state.currentIndex]
    switch (action.type) {
      case 'add':
        return `Add box at frame ${action.frame}`
      case 'edit':
        return `Edit box at frame ${action.frame}`
      case 'delete':
        return `Delete box at frame ${action.frame}`
      case 'multi-add':
        return `Add multi-frame box (${action.affectedFrames?.length || 0} frames)`
      default:
        return 'Unknown action'
    }
  }

  /**
   * Get a description of the next action for UI purposes
   */
  getNextActionDescription(): string | null {
    if (!this.canRedo()) {
      return null
    }

    const action = this.state.history[this.state.currentIndex + 1]
    switch (action.type) {
      case 'add':
        return `Add box at frame ${action.frame}`
      case 'edit':
        return `Edit box at frame ${action.frame}`
      case 'delete':
        return `Delete box at frame ${action.frame}`
      case 'multi-add':
        return `Add multi-frame box (${action.affectedFrames?.length || 0} frames)`
      default:
        return 'Unknown action'
    }
  }
} 