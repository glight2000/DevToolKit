import { useState } from 'react'
import TabBar from '../../components/common/TabBar'
import CurrentTime from './components/CurrentTime'
import TimestampConverter from './components/TimestampConverter'
import TimezoneConverter from './components/TimezoneConverter'
import DateDiffCalculator from './components/DateDiffCalculator'
import { Clock } from 'lucide-react'

const tabs = [
  { key: 'current', label: 'Current Time' },
  { key: 'timestamp', label: 'Timestamp Converter' },
  { key: 'timezone', label: 'Timezone Converter' },
  { key: 'datediff', label: 'Date Diff Calculator' }
]

const tabComponents: Record<string, React.ComponentType> = {
  current: CurrentTime,
  timestamp: TimestampConverter,
  timezone: TimezoneConverter,
  datediff: DateDiffCalculator
}

export default function TimeToolsPage() {
  const [activeTab, setActiveTab] = useState('current')
  const ActiveComponent = tabComponents[activeTab]

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-surface-800 bg-surface-900 px-6 pt-4">
        <div className="mb-4 flex items-center gap-2.5">
          <Clock className="h-5 w-5 text-blue-400" />
          <h1 className="text-lg font-bold text-slate-100">Time Tools</h1>
        </div>
        <TabBar tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <ActiveComponent />
      </div>
    </div>
  )
}
