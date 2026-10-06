import { Paper, Typography } from '@mui/material'

type BadgeTone = 'paper' | 'bamboo' | 'warning' | 'neutral'

interface StatBadgeProps {
  label: string
  value: string | number
  detail?: string
  tone?: BadgeTone
}

const toneStyles = {
  paper: { background: '#f5efe2', border: '#cbbd9d', color: '#4e3929' },
  bamboo: { background: '#e7efe3', border: '#a8bea0', color: '#34522c' },
  warning: { background: '#fff3cd', border: '#d9a928', color: '#6f4a00' },
  neutral: { background: '#eef0ed', border: '#c5cbc2', color: '#414a42' },
}

export function StatBadge({ label, value, detail, tone = 'paper' }: StatBadgeProps) {
  const colors = toneStyles[tone]
  return (
    <Paper
      variant="outlined"
      sx={{
        minWidth: 148,
        flex: '1 1 160px',
        p: 2,
        borderRadius: 2,
        bgcolor: colors.background,
        borderColor: colors.border,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.65)',
      }}
    >
      <Typography variant="caption" sx={{ color: colors.color, letterSpacing: '.08em' }}>
        {label}
      </Typography>
      <Typography variant="h4" sx={{ color: colors.color, mt: 0.5, fontWeight: 700 }}>
        {value}
      </Typography>
      {detail && (
        <Typography variant="body2" sx={{ color: colors.color, opacity: 0.78, mt: 0.5 }}>
          {detail}
        </Typography>
      )}
    </Paper>
  )
}
