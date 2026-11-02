import { lazy, type LazyExoticComponent, type ComponentType } from 'react'

export interface PluginRendererManifest {
  id: string
  name: string
  icon: string
  component: LazyExoticComponent<ComponentType<any>>
  keepAlive?: boolean
  group?: 'settings'
}

// Lazy load all plugin components
const SshTunnelPage = lazy(() => import('./ssh-tunnel/SshTunnelPage'))
const SshConnectionsPage = lazy(() => import('./ssh-connections/SshConnectionsPage'))
const NotebookPage = lazy(() => import('./notebook/NotebookPage'))
const CryptoToolsPage = lazy(() => import('./crypto-tools/CryptoToolsPage'))
const TimeToolsPage = lazy(() => import('./time-tools/TimeToolsPage'))
const TranslationPage = lazy(() => import('./translation/TranslationPage'))
const SubscriptionsPage = lazy(() => import('./subscriptions/SubscriptionsPage'))
const DesktopSettingsPage = lazy(() => import('./desktop/SettingsPages').then(module => ({ default: module.DesktopSettingsPage })))
const WindowSwitcherSettings = lazy(() => import('./desktop/SettingsPages').then(module => ({ default: module.WindowSwitcherSettings })))
const FloatingSettings = lazy(() => import('./desktop/SettingsPages').then(module => ({ default: module.FloatingSettings })))
const LauncherSettings = lazy(() => import('./desktop/LauncherSettings'))

export const plugins: PluginRendererManifest[] = [
  { id: 'ssh-tunnel', name: 'SSH Tunnel', icon: 'Network', component: SshTunnelPage },
  { id: 'ssh-connections', name: 'SSH Connections', icon: 'Terminal', component: SshConnectionsPage, keepAlive: true },
  { id: 'subscriptions', name: 'AI 订阅', icon: 'Gauge', component: SubscriptionsPage },
  { id: 'notebook', name: 'Notebook', icon: 'FileText', component: NotebookPage },
  { id: 'crypto-tools', name: 'Crypto Tools', icon: 'Shield', component: CryptoToolsPage },
  { id: 'time-tools', name: 'Time Tools', icon: 'Clock', component: TimeToolsPage },
  { id: 'translation', name: 'Translation', icon: 'Languages', component: TranslationPage },
  { id: 'desktop-settings', name: '桌面设置', icon: 'MousePointer2', component: DesktopSettingsPage, group: 'settings' },
  { id: 'window-switcher', name: '窗口速切', icon: 'AppWindow', component: WindowSwitcherSettings, group: 'settings' },
  { id: 'quick-launcher', name: '快捷启动', icon: 'Search', component: LauncherSettings, group: 'settings' },
  { id: 'floating-settings', name: '悬浮组件', icon: 'PanelsTopLeft', component: FloatingSettings, group: 'settings' }
]
