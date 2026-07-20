import type { CanvasClipboard } from './document'
import type { CanvasAssetUpload, CanvasNode, CanvasProject } from './types'

type UploadCanvasAsset = (dataUrl: string) => Promise<CanvasAssetUpload>

export async function materializeProjectMediaAssets(project: CanvasProject, uploadAsset: UploadCanvasAsset): Promise<CanvasProject> {
  return { ...project, nodes: await materializeNodesMediaAssets(project.nodes, uploadAsset) }
}

export async function materializeClipboardMediaAssets(clipboard: CanvasClipboard, uploadAsset: UploadCanvasAsset): Promise<CanvasClipboard> {
  return { ...clipboard, nodes: await materializeNodesMediaAssets(clipboard.nodes, uploadAsset) }
}

async function materializeNodesMediaAssets(nodes: CanvasNode[], uploadAsset: UploadCanvasAsset) {
  return Promise.all(nodes.map((node) => materializeNodeMediaAsset(node, uploadAsset)))
}

async function materializeNodeMediaAsset(node: CanvasNode, uploadAsset: UploadCanvasAsset): Promise<CanvasNode> {
  const content = node.metadata.content
  if (!isMediaNode(node) || typeof content !== 'string' || !content.startsWith('data:') || node.metadata.storageKey) return node
  const asset = await uploadAsset(content)
  return {
    ...node,
    metadata: {
      ...node.metadata,
      content: asset.url,
      storageKey: asset.storageKey,
      mimeType: asset.mimeType || node.metadata.mimeType,
      bytes: asset.bytes || node.metadata.bytes,
    },
  }
}

function isMediaNode(node: CanvasNode) {
  return node.type === 'image' || node.type === 'video' || node.type === 'audio'
}
