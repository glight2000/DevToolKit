import { lazy, type LazyExoticComponent, type ComponentType } from 'react'

export interface PluginRendererManifest {
  id: string
  name: string
  icon: string
  component: LazyExoticComponent<ComponentType<any>>
}

// Lazy load all plugin components
const SshTunnelPage = lazy(() => import('./ssh-tunnel/SshTunnelPage'))
const NotebookPage = lazy(() => import('./notebook/NotebookPage'))
const CryptoToolsPage = lazy(() => import('./crypto-tools/CryptoToolsPage'))
const TimeToolsPage = lazy(() => import('./time-tools/TimeToolsPage'))
const TranslationPage = lazy(() => import('./translation/TranslationPage'))
const ImageEditorPage = lazy(() => import('./image-editor/ImageEditorPage'))

export const plugins: PluginRendererManifest[] = [
  { id: 'ssh-tunnel', name: 'SSH Tunnel', icon: 'Network', component: SshTunnelPage },
  { id: 'notebook', name: 'Notebook', icon: 'FileText', component: NotebookPage },
  { id: 'image-editor', name: 'Image Editor', icon: 'Image', component: ImageEditorPage },
  { id: 'crypto-tools', name: 'Crypto Tools', icon: 'Shield', component: CryptoToolsPage },
  { id: 'time-tools', name: 'Time Tools', icon: 'Clock', component: TimeToolsPage },
  { id: 'translation', name: 'Translation', icon: 'Languages', component: TranslationPage }
]
