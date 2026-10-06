import { Box, Paper, Typography } from '@mui/material'

interface GrainStripePreviewProps {
  gap: number
  wireDiameter: number
  density?: number
  stripeCount?: number
  direction?: 'vertical' | 'horizontal'
  testId?: string
}

export function GrainStripePreview({
  gap,
  wireDiameter,
  density,
  stripeCount,
  direction = 'vertical',
  testId,
}: GrainStripePreviewProps) {
  const pitch = Math.max(5, (wireDiameter + gap) * 13)
  const lineCount = Math.min(34, Math.max(16, stripeCount ? Math.round(stripeCount / 2) : 24))
  return (
    <Paper
      variant="outlined"
      data-testid={testId}
      sx={{
        p: 1.5,
        borderRadius: 2,
        overflow: 'hidden',
        bgcolor: '#faf6eb',
        borderColor: '#d2c4a7',
      }}
    >
      <Box
        component="svg"
        viewBox="0 0 320 112"
        role="img"
        aria-label={`帘纹预览，间距 ${gap} 毫米`}
        sx={{ display: 'block', width: '100%', height: 104 }}
      >
        <defs>
          <linearGradient id="paperGlow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fffdf5" />
            <stop offset="1" stopColor="#eadfc7" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="320" height="112" rx="8" fill="url(#paperGlow)" />
        {Array.from({ length: lineCount }, (_, index) => {
          const position = 4 + index * pitch
          const opacity = index % 5 === 0 ? 0.72 : 0.36
          return direction === 'vertical' ? (
            <line key={`v-${index}`} x1={position} y1="5" x2={position} y2="107" stroke="#907c61" strokeWidth={index % 5 === 0 ? 1.2 : 0.7} opacity={opacity} />
          ) : (
            <line key={`h-${index}`} x1="5" y1={position} x2="315" y2={position} stroke="#907c61" strokeWidth={index % 5 === 0 ? 1.2 : 0.7} opacity={opacity} />
          )
        })}
        <path d="M0 75 C56 61 97 89 151 72 S250 57 320 68" fill="none" stroke="#a78655" strokeWidth="0.8" opacity="0.35" />
        <path d="M0 43 C62 31 105 56 166 39 S254 28 320 37" fill="none" stroke="#a78655" strokeWidth="0.8" opacity="0.25" />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          帘丝 {wireDiameter.toFixed(2)} mm · 间距 {gap.toFixed(2)} mm
        </Typography>
        <Typography variant="caption" sx={{ color: '#6a553c', fontWeight: 700 }}>
          {density ? `${density.toFixed(1)} 根/厘米` : '透光观察'}
        </Typography>
      </Box>
    </Paper>
  )
}
