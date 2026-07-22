import type { ArtboardFlowAppHostBridge } from './appHostBridge'
import type { CanvasHostBridge } from './canvas/hostBridge'

export type ArtboardFlowHostToolScope = 'app' | 'canvas'

export type ArtboardFlowHostToolInfo = {
  name: string
  scope: ArtboardFlowHostToolScope
}

type HostToolContext = {
  app?: Partial<ArtboardFlowAppHostBridge>
  canvas?: Partial<CanvasHostBridge>
}

type HostToolRuntimeOptions = {
  getApp: () => Partial<ArtboardFlowAppHostBridge> | undefined
  getCanvas: () => Partial<CanvasHostBridge> | undefined
}

export type ArtboardFlowHostToolsRuntime = {
  listTools: () => ArtboardFlowHostToolInfo[]
  runTool: (name: string, input?: unknown) => Promise<unknown>
}

const appToolNames = [
  'canvas_list_projects',
  'canvas_get_active_project',
  'canvas_open_project',
  'canvas_create_project',
] as const

const canvasToolNames = [
  'canvas_get_state',
  'canvas_get_graph',
  'canvas_get_selection',
  'canvas_export_snapshot',
  'canvas_apply_ops',
  'canvas_create_node',
  'canvas_create_text_node',
  'canvas_create_text_nodes',
  'canvas_create_config_node',
  'canvas_create_image_prompt_flow',
  'canvas_create_generation_flow',
  'canvas_generate_text',
  'canvas_generate_image',
  'canvas_generate_video',
  'canvas_update_node',
  'canvas_update_node_text',
  'canvas_move_nodes',
  'canvas_resize_node',
  'canvas_delete_nodes',
  'canvas_delete_connections',
  'canvas_connect_nodes',
  'canvas_select_nodes',
  'canvas_set_viewport',
  'canvas_run_generation',
  'generation_get_status',
  'assets_list',
  'assets_add',
] as const

export const artboardFlowHostToolNames = [...appToolNames, ...canvasToolNames] as const
export type ArtboardFlowHostToolName = (typeof artboardFlowHostToolNames)[number]

export function listArtboardFlowHostTools(): ArtboardFlowHostToolInfo[] {
  return [
    ...appToolNames.map((name) => ({ name, scope: 'app' as const })),
    ...canvasToolNames.map((name) => ({ name, scope: 'canvas' as const })),
  ]
}

export function createArtboardFlowHostTools(options: HostToolRuntimeOptions): ArtboardFlowHostToolsRuntime {
  return {
    listTools: listArtboardFlowHostTools,
    runTool: (name, input) => runArtboardFlowHostTool({ app: options.getApp(), canvas: options.getCanvas() }, name, input),
  }
}

export async function runArtboardFlowHostTool(context: HostToolContext, name: string, input: unknown = {}) {
  if (isAppToolName(name)) return runAppTool(requireApp(context), name, objectInput(input))
  if (isCanvasToolName(name)) return runCanvasTool(requireCanvas(context), name, objectInput(input))
  throw new Error('UNKNOWN_HOST_TOOL')
}

function runAppTool(app: Partial<ArtboardFlowAppHostBridge>, name: (typeof appToolNames)[number], input: Record<string, unknown>) {
  if (name === 'canvas_list_projects') return app.listProjects?.(input)
  if (name === 'canvas_get_active_project') return { id: app.getActiveProjectId?.() ?? null }
  if (name === 'canvas_open_project') return app.openProject?.({ id: typeof input.id === 'string' ? input.id : null, replace: input.replace === true })
  if (name === 'canvas_create_project') return app.createProject?.({ title: stringField(input.title), open: input.open !== false })
}

function runCanvasTool(canvas: Partial<CanvasHostBridge>, name: (typeof canvasToolNames)[number], input: Record<string, unknown>) {
  if (name === 'canvas_get_state') return canvas.getSnapshot?.()
  if (name === 'canvas_get_graph') return canvas.getGraph?.()
  if (name === 'canvas_get_selection') return canvas.getSelection?.()
  if (name === 'canvas_export_snapshot') return canvas.exportSnapshot?.()
  if (name === 'canvas_apply_ops') return canvas.applyOps?.(Array.isArray(input.ops) ? input.ops : [])
  if (name === 'canvas_create_node') return canvas.createNode?.(input as Parameters<CanvasHostBridge['createNode']>[0])
  if (name === 'canvas_create_text_node') return canvas.createTextNode?.(input as Parameters<CanvasHostBridge['createTextNode']>[0])
  if (name === 'canvas_create_text_nodes') return canvas.createTextNodes?.(input as Parameters<CanvasHostBridge['createTextNodes']>[0])
  if (name === 'canvas_create_config_node') return canvas.createConfigNode?.(input as Parameters<CanvasHostBridge['createConfigNode']>[0])
  if (name === 'canvas_create_image_prompt_flow') return canvas.createImagePromptFlow?.(input as Parameters<CanvasHostBridge['createImagePromptFlow']>[0])
  if (name === 'canvas_create_generation_flow') return canvas.createGenerationFlow?.(input as Parameters<CanvasHostBridge['createGenerationFlow']>[0])
  if (name === 'canvas_generate_text') return canvas.generateText?.(input as Parameters<CanvasHostBridge['generateText']>[0])
  if (name === 'canvas_generate_image') return canvas.generateImage?.(input as Parameters<CanvasHostBridge['generateImage']>[0])
  if (name === 'canvas_generate_video') return canvas.generateVideo?.(input as Parameters<CanvasHostBridge['generateVideo']>[0])
  if (name === 'canvas_update_node') return canvas.updateNode?.(input as Parameters<CanvasHostBridge['updateNode']>[0])
  if (name === 'canvas_update_node_text') return canvas.updateNodeText?.(input as Parameters<CanvasHostBridge['updateNodeText']>[0])
  if (name === 'canvas_move_nodes') return canvas.moveNodes?.(input as Parameters<CanvasHostBridge['moveNodes']>[0])
  if (name === 'canvas_resize_node') return canvas.resizeNode?.(input as Parameters<CanvasHostBridge['resizeNode']>[0])
  if (name === 'canvas_delete_nodes') return canvas.deleteNodes?.(input as Parameters<CanvasHostBridge['deleteNodes']>[0])
  if (name === 'canvas_delete_connections') return canvas.deleteConnections?.(input as Parameters<CanvasHostBridge['deleteConnections']>[0])
  if (name === 'canvas_connect_nodes') return canvas.connectNodes?.(input as Parameters<CanvasHostBridge['connectNodes']>[0])
  if (name === 'canvas_select_nodes') return canvas.selectNodes?.(input as Parameters<CanvasHostBridge['selectNodes']>[0])
  if (name === 'canvas_set_viewport') return canvas.setViewport?.(input as Parameters<CanvasHostBridge['setViewport']>[0])
  if (name === 'canvas_run_generation') return canvas.runGeneration?.(input as Parameters<CanvasHostBridge['runGeneration']>[0])
  if (name === 'generation_get_status') return canvas.getGenerationStatus?.(input as Parameters<CanvasHostBridge['getGenerationStatus']>[0])
  if (name === 'assets_list') return canvas.searchAssets?.(input as Parameters<CanvasHostBridge['searchAssets']>[0])
  if (name === 'assets_add') return addAsset(canvas, input)
}

function addAsset(canvas: Partial<CanvasHostBridge>, input: Record<string, unknown>) {
  if (input.kind === 'text') return canvas.addTextAsset?.({ text: stringField(input.content) })
  if (input.kind === 'image') return canvas.addImageAsset?.({ imageUrl: stringField(input.imageUrl) })
  throw new Error('UNSUPPORTED_ASSET_KIND')
}

function requireApp(context: HostToolContext) {
  if (!context.app) throw new Error('HOST_APP_UNAVAILABLE')
  return context.app
}

function requireCanvas(context: HostToolContext) {
  if (!context.canvas) throw new Error('HOST_CANVAS_UNAVAILABLE')
  return context.canvas
}

function isAppToolName(name: string): name is (typeof appToolNames)[number] {
  return appToolNames.includes(name as (typeof appToolNames)[number])
}

function isCanvasToolName(name: string): name is (typeof canvasToolNames)[number] {
  return canvasToolNames.includes(name as (typeof canvasToolNames)[number])
}

function objectInput(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? input as Record<string, unknown> : {}
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value : ''
}
