import { useState } from 'react'
import TabBar from '../../components/common/TabBar'
import PasswordGenerator from './components/PasswordGenerator'
import EncodingTool from './components/EncodingTool'
import HashTool from './components/HashTool'
import SymmetricTool from './components/SymmetricTool'
import AsymmetricTool from './components/AsymmetricTool'
import { Shield } from 'lucide-react'

const tabs = [
  { key: 'password', label: 'Password Generator' },
  { key: 'encoding', label: 'Encoding' },
  { key: 'hash', label: 'Hash' },
  { key: 'symmetric', label: 'AES' },
  { key: 'asymmetric', label: 'RSA' }
]

const tabComponents: Record<string, React.ComponentType> = {
  password: PasswordGenerator,
  encoding: EncodingTool,
  hash: HashTool,
  symmetric: SymmetricTool,
  asymmetric: AsymmetricTool
}

export default function CryptoToolsPage() {
  const [activeTab, setActiveTab] = useState('password')
  const ActiveComponent = tabComponents[activeTab]

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-surface-800 bg-surface-900 px-6 pt-4">
        <div className="mb-4 flex items-center gap-2.5">
          <Shield className="h-5 w-5 text-blue-400" />
          <h1 className="text-lg font-bold text-slate-100">Crypto Tools</h1>
        </div>
        <TabBar tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <ActiveComponent />
      </div>
    </div>
  )
}
