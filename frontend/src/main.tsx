import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import App from './App'
import './index.css'

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#466247', dark: '#314a35', contrastText: '#fffaf0' },
    secondary: { main: '#9b6737' },
    background: { default: '#f2ede1', paper: '#fffdf7' },
    text: { primary: '#3f3429', secondary: '#736858' },
    warning: { main: '#b77a16' },
  },
  typography: {
    fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
    h1: { fontWeight: 800, letterSpacing: '.05em' },
    h2: { fontWeight: 750, letterSpacing: '.04em' },
    h3: { fontWeight: 720 },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { border: '1px solid #ddd2bd', boxShadow: '0 10px 26px rgba(79,62,39,.06)' },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 650 },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: { backgroundColor: '#eee6d5' },
      },
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
