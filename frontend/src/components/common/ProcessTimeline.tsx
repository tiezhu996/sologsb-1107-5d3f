import { Box, Chip, Stack, Typography } from '@mui/material'

export type ProcessStepStatus = 'done' | 'active' | 'pending'

export interface ProcessStep {
  label: string
  detail: string
  status?: ProcessStepStatus
}

interface ProcessTimelineProps {
  steps: ProcessStep[]
  compact?: boolean
}

const statusColor = {
  done: { dot: '#4e7044', line: '#a9bc9f', chip: 'success' as const, text: '已完成' },
  active: { dot: '#b57a22', line: '#d2b475', chip: 'warning' as const, text: '进行中' },
  pending: { dot: '#aaa79f', line: '#d7d4ce', chip: 'default' as const, text: '待处理' },
}

export function ProcessTimeline({ steps, compact = false }: ProcessTimelineProps) {
  return (
    <Stack spacing={0}>
      {steps.map((step, index) => {
        const visual = statusColor[step.status ?? 'pending']
        return (
          <Box key={`${step.label}-${index}`} sx={{ display: 'grid', gridTemplateColumns: '24px 1fr', columnGap: 1.25 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Box sx={{ width: 12, height: 12, mt: compact ? 0.65 : 0.8, borderRadius: '50%', bgcolor: visual.dot, border: '3px solid #fff', boxShadow: '0 0 0 1px rgba(70,58,43,.25)' }} />
              {index < steps.length - 1 && <Box sx={{ width: 2, flex: 1, minHeight: compact ? 30 : 42, bgcolor: visual.line }} />}
            </Box>
            <Box sx={{ pb: compact ? 0.75 : 1.4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {step.label}
                </Typography>
                <Chip size="small" label={visual.text} color={visual.chip} variant="outlined" />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {step.detail}
              </Typography>
            </Box>
          </Box>
        )
      })}
    </Stack>
  )
}
