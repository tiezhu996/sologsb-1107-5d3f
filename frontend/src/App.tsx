import { useState } from 'react'
import { AppBar, Box, Button, Container, Snackbar, Toolbar, Typography } from '@mui/material'
import { Link, useLocation } from 'react-router-dom'
import { AppRoutes } from './router'
import { exportDatabaseJson } from './utils/export'

const navItems = [
  { label: '工作台', path: '/' },
  { label: '纸帘台帐', path: '/moulds' },
  { label: '纤维料批', path: '/fibers' },
  { label: '抄纸工序', path: '/runs' },
  { label: '成纸样本', path: '/samples' },
]

function PapertrailMark() {
  return (
    <Box component="svg" viewBox="0 0 48 48" aria-hidden="true" sx={{ width: 34, height: 34, mr: 1.25 }}>
      <rect x="3" y="3" width="42" height="42" rx="10" fill="#426044" />
      <path d="M11 34c8-2 11-8 12-19M18 35c7-4 10-10 11-20M26 34c5-4 8-8 10-15" fill="none" stroke="#f2e6c9" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 34h30M9 28h30M9 22h30M9 16h30" stroke="#d8c69e" strokeWidth="0.8" opacity=".65" />
    </Box>
  )
}

export default function App() {
  const location = useLocation()
  const [exportMessage, setExportMessage] = useState('')

  const handleExport = async () => {
    try {
      const filename = await exportDatabaseJson()
      setExportMessage(`已导出 ${filename}`)
    } catch {
      setExportMessage('导出失败，请稍后重试')
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f2ede1', backgroundImage: 'radial-gradient(rgba(107,91,65,.08) .7px, transparent .7px)', backgroundSize: '13px 13px' }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: 'rgba(249,246,237,.94)', color: '#3f3429', borderBottom: '1px solid #d7ccb6', backdropFilter: 'blur(10px)' }}>
        <Container maxWidth="xl">
          <Toolbar disableGutters sx={{ minHeight: { xs: 66, md: 72 }, gap: 1, flexWrap: { xs: 'wrap', md: 'nowrap' }, py: { xs: 1, md: 0 } }}>
            <Box component={Link} to="/" sx={{ display: 'flex', alignItems: 'center', color: 'inherit', textDecoration: 'none', mr: { md: 2 } }}>
              <PapertrailMark />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.05, letterSpacing: '.05em' }}>
                  帘纹纸坊
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  手工造纸工序档案
                </Typography>
              </Box>
            </Box>
            <Box component="nav" aria-label="主导航" sx={{ display: 'flex', gap: 0.5, flex: 1, overflowX: 'auto' }}>
              {navItems.map((item) => {
                const selected = location.pathname === item.path
                return (
                  <Button
                    key={item.path}
                    component={Link}
                    to={item.path}
                    size="small"
                    color={selected ? 'primary' : 'inherit'}
                    variant={selected ? 'contained' : 'text'}
                    sx={{ whiteSpace: 'nowrap', px: { xs: 1.25, md: 1.8 } }}
                  >
                    {item.label}
                  </Button>
                )
              })}
            </Box>
            <Button variant="outlined" size="small" onClick={handleExport} sx={{ whiteSpace: 'nowrap' }} data-testid="export-json">
              导出 JSON
            </Button>
          </Toolbar>
        </Container>
      </AppBar>
      <Container component="main" maxWidth="xl" sx={{ py: { xs: 2.5, md: 4 }, px: { xs: 1.5, sm: 2.5 } }}>
        <AppRoutes />
      </Container>
      <Snackbar open={Boolean(exportMessage)} autoHideDuration={2600} onClose={() => setExportMessage('')} message={exportMessage} />
    </Box>
  )
}
