import type Database from 'better-sqlite3'

export interface PluginContext {
  db: Database.Database
  sendToRenderer: (channel: string, ...args: unknown[]) => void
  encrypt: (text: string) => string
  decrypt: (text: string) => string
}

export interface PluginMainModule {
  id: string
  name: string
  initialize(ctx: PluginContext): void | Promise<void>
  dispose(): Promise<void>
}

export interface PluginRendererManifest {
  id: string
  name: string
  icon: string
  component: React.ComponentType
}
