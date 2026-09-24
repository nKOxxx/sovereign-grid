import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { useCallback, useState } from 'react'
import { MarketProvider } from './store/MarketContext.jsx'
import MarketplaceHome from './screens/MarketplaceHome.jsx'
import PostDemand from './screens/PostDemand.jsx'
import ListCapacity from './screens/ListCapacity.jsx'
import MatchResults from './screens/MatchResults.jsx'
import Calculator from './screens/Calculator.jsx'
import FeeEngine from './screens/FeeEngine.jsx'
import Eligibility from './screens/Eligibility.jsx'
import CapacityPassport from './screens/CapacityPassport.jsx'
import DealRoom from './screens/DealRoom.jsx'
import CrmAutomation from './screens/CrmAutomation.jsx'
import MarketIntel from './screens/MarketIntel.jsx'
import Login from './screens/Login.jsx'
import { getCurrentUser, logout } from './lib/auth.js'
import { DemoBadge } from './screens/ui.jsx'

export default function App() {
  const [user, setUser] = useState(getCurrentUser())
  const handleLogout = useCallback(async () => {
    await logout()
    setUser(null)
  }, [])

  return (
    <MarketProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <div className='min-h-screen bg-slate-50'>
          <nav className='flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 bg-white px-6 py-3'>
            <span className='mr-1 font-bold text-slate-900'>Sovereign Grid</span>
            <DemoBadge label='DEMO — illustrative data only' />
            <NavLink to='/' className={navCls} end>
              Marketplace
            </NavLink>
            <NavLink to='/post-demand' className={navCls}>
              Post Demand
            </NavLink>
            <NavLink to='/list-capacity' className={navCls}>
              List Capacity
            </NavLink>
            <NavLink to='/matches' className={navCls}>
              Match Results
            </NavLink>
            <NavLink to='/calculator' className={navCls}>
              Calculator
            </NavLink>
            <NavLink to='/fees' className={navCls}>
              Fee Engine
            </NavLink>
            <NavLink to='/eligibility' className={navCls}>
              Eligibility
            </NavLink>
            <NavLink to='/passport' className={navCls}>
              Passport
            </NavLink>
            <NavLink to='/dealroom' className={navCls}>
              Deal Room
            </NavLink>
            <NavLink to='/crm' className={navCls}>
              CRM Automation
            </NavLink>
            <NavLink to='/intel' className={navCls}>
              Market Intel
            </NavLink>
            <span className='ml-auto flex items-center gap-2'>
              {user ? (
                <span className='flex items-center gap-2 text-sm'>
                  <span className='text-xs text-slate-500'>{user.email || user.role}</span>
                  <button
                    type='button'
                    onClick={handleLogout}
                    className='rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50'
                  >
                    Log out
                  </button>
                </span>
              ) : (
                <NavLink to='/login' className={navCls}>
                  Sign in
                </NavLink>
              )}
            </span>
          </nav>
          <Routes>
            <Route path='/' element={<MarketplaceHome />} />
            <Route path='/post-demand' element={<PostDemand />} />
            <Route path='/list-capacity' element={<ListCapacity />} />
            <Route path='/matches' element={<MatchResults />} />
            <Route path='/calculator' element={<Calculator />} />
            <Route path='/fees' element={<FeeEngine />} />
            <Route path='/eligibility' element={<Eligibility />} />
            <Route path='/passport' element={<CapacityPassport />} />
            <Route path='/dealroom' element={<DealRoom />} />
            <Route path='/crm' element={<CrmAutomation />} />
            <Route path='/intel' element={<MarketIntel />} />
            <Route path='/login' element={<Login />} />
          </Routes>
        </div>
      </BrowserRouter>
    </MarketProvider>
  )
}

function navCls({ isActive }) {
  return 'text-sm ' + (isActive ? 'font-semibold text-sky-700' : 'text-slate-600 hover:text-slate-900')
}
