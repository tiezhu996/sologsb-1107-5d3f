import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Grid, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { GrainStripePreview } from '../components/common/GrainStripePreview'
import { RulerInput } from '../components/common/RulerInput'
import { useMouldFilter } from '../hooks/useMouldFilter'
import { useUnitConvert } from '../hooks/useUnitConvert'
import { useMouldStore } from '../stores/mouldStore'
import { useRunStore } from '../stores/runStore'
import { MOULD_STATES, WIRE_MATERIALS, type MouldInput, type MouldStateValue, type WireMaterial } from '../types/mould'
import { calculateMeshDensity } from '../utils/stripe'

const emptyMouldForm: MouldInput = {
  mouldNo: '',
  frameW: 60,
  frameH: 90,
  wireMaterial: '竹丝',
  wireDiameter: 0.3,
  stripeGap: 1.1,
  meshDensity: calculateMeshDensity(0.3, 1.1),
  weaver: '周守良',
  state: '在用',
}

export default function MouldLedger() {
  const moulds = useMouldStore((state) => state.moulds)
  const error = useMouldStore((state) => state.error)
  const loadMoulds = useMouldStore((state) => state.loadMoulds)
  const addMould = useMouldStore((state) => state.addMould)
  const setMouldState = useMouldStore((state) => state.setMouldState)
  const runs = useRunStore((state) => state.sheetRuns)
  const loadRuns = useRunStore((state) => state.loadRuns)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<MouldInput>(emptyMouldForm)
  const [submitting, setSubmitting] = useState(false)
  const { mmPitchToThreadsPerCm } = useUnitConvert()
  const {
    mouldNo,
    state: stateFilter,
    wireMaterial,
    filteredMoulds,
    setMouldNo,
    setState,
    setWireMaterial,
    resetFilters,
  } = useMouldFilter(moulds)

  useEffect(() => {
    void loadMoulds()
    void loadRuns()
  }, [loadMoulds, loadRuns])

  const calculatedDensity = useMemo(
    () => calculateMeshDensity(form.wireDiameter, form.stripeGap),
    [form.stripeGap, form.wireDiameter],
  )

  const updateForm = <K extends keyof MouldInput,>(key: K, value: MouldInput[K]) => {
    setForm((current) => {
      const next = { ...current, [key]: value }
      next.meshDensity = calculateMeshDensity(next.wireDiameter, next.stripeGap)
      return next
    })
  }

  const handleSubmit = async () => {
    if (!form.mouldNo.trim() || !form.weaver.trim() || form.frameW <= 0 || form.frameH <= 0 || form.wireDiameter <= 0 || form.stripeGap <= 0) return
    setSubmitting(true)
    const created = await addMould({ ...form, mouldNo: form.mouldNo.trim(), weaver: form.weaver.trim(), meshDensity: calculatedDensity })
    setSubmitting(false)
    if (created) {
      setForm(emptyMouldForm)
      setShowForm(false)
    }
  }

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box>
          <Typography component="h1" variant="h3" color="#344a34">纸帘台帐</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>维护帘框尺寸、丝材与帘纹密度，并登记修补状态。</Typography>
        </Box>
        <Button variant="contained" size="large" onClick={() => setShowForm((current) => !current)} data-testid="new-mould">
          {showForm ? '收起登记' : '新建纸帘'}
        </Button>
      </Box>

      {error && <Alert severity="warning">{error}</Alert>}

      {showForm && (
        <Card data-testid="form-mould" sx={{ borderColor: '#9eb096' }}>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="h5">登记新纸帘</Typography>
                <Typography variant="body2" color="text.secondary">丝径或间距变化时，密度会即时重算。</Typography>
              </Box>
              <Chip color="success" label={`${calculatedDensity.toFixed(1)} 根/厘米`} />
            </Box>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <TextField fullWidth label="纸帘编号" value={form.mouldNo} onChange={(event) => updateForm('mouldNo', event.target.value)} inputProps={{ 'data-testid': 'field-mouldNo' }} />
              </Grid>
              <Grid item xs={6} md={2}>
                <TextField fullWidth type="number" label="帘框宽" value={form.frameW} onChange={(event) => updateForm('frameW', Number(event.target.value))} inputProps={{ min: 1, step: 1, 'data-testid': 'field-frameW' }} InputProps={{ endAdornment: 'cm' }} />
              </Grid>
              <Grid item xs={6} md={2}>
                <TextField fullWidth type="number" label="帘框高" value={form.frameH} onChange={(event) => updateForm('frameH', Number(event.target.value))} inputProps={{ min: 1, step: 1, 'data-testid': 'field-frameH' }} InputProps={{ endAdornment: 'cm' }} />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  select
                  fullWidth
                  label="帘丝材质"
                  value={form.wireMaterial}
                  onChange={(event) => updateForm('wireMaterial', event.target.value as WireMaterial)}
                  SelectProps={{ native: true, inputProps: { 'data-testid': 'field-wireMaterial' } }}
                >
                  {WIRE_MATERIALS.map((option) => <option key={option} value={option}>{option}</option>)}
                </TextField>
              </Grid>
              <Grid item xs={12} md={4}>
                <RulerInput label="丝径" value={form.wireDiameter} onChange={(value) => updateForm('wireDiameter', value)} min={0.05} max={2} step={0.01} testId="field-wireDiameter" />
              </Grid>
              <Grid item xs={12} md={4}>
                <RulerInput label="帘纹间距" value={form.stripeGap} onChange={(value) => updateForm('stripeGap', value)} min={0.1} max={5} step={0.01} testId="field-stripeGap" />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField fullWidth label="编帘匠人" value={form.weaver} onChange={(event) => updateForm('weaver', event.target.value)} inputProps={{ 'data-testid': 'field-weaver' }} />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  select
                  fullWidth
                  label="状态"
                  value={form.state}
                  onChange={(event) => updateForm('state', event.target.value as MouldStateValue)}
                  SelectProps={{ native: true, inputProps: { 'data-testid': 'field-state' } }}
                >
                  {MOULD_STATES.map((option) => <option key={option} value={option}>{option}</option>)}
                </TextField>
              </Grid>
              <Grid item xs={12} md={8} sx={{ display: 'flex', alignItems: 'stretch' }}>
                <Box sx={{ width: '100%' }}>
                  <GrainStripePreview gap={form.stripeGap} wireDiameter={form.wireDiameter} density={calculatedDensity} direction={form.wireMaterial === '马尾丝' ? 'horizontal' : 'vertical'} />
                </Box>
              </Grid>
            </Grid>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 2.5 }}>
              <Button onClick={() => setShowForm(false)}>取消</Button>
              <Button variant="contained" onClick={handleSubmit} disabled={submitting} data-testid="submit-mould">
                保存纸帘
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <Grid container spacing={1.5} alignItems="center">
            <Grid item xs={12} sm={6} md={3}>
              <TextField fullWidth size="small" label="筛选帘号" value={mouldNo} onChange={(event) => setMouldNo(event.target.value)} />
            </Grid>
            <Grid item xs={6} md={2.5}>
              <TextField select fullWidth size="small" label="状态" value={stateFilter} onChange={(event) => setState(event.target.value as MouldStateValue | '全部')} SelectProps={{ native: true }}>
                <option value="全部">全部</option>
                {MOULD_STATES.map((option) => <option key={option} value={option}>{option}</option>)}
              </TextField>
            </Grid>
            <Grid item xs={6} md={2.5}>
              <TextField select fullWidth size="small" label="帘丝材质" value={wireMaterial} onChange={(event) => setWireMaterial(event.target.value as WireMaterial | '全部')} SelectProps={{ native: true }}>
                <option value="全部">全部</option>
                {WIRE_MATERIALS.map((option) => <option key={option} value={option}>{option}</option>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                <Typography variant="body2" color="text.secondary">当前记录</Typography>
                <Typography variant="h5" data-testid="count-mould">{filteredMoulds.length}</Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={2}>
              <Button fullWidth variant="outlined" onClick={resetFilters}>重置筛选</Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <TableContainer component={Card}>
        <Table sx={{ minWidth: 920 }}>
          <TableHead>
            <TableRow>
              <TableCell>帘号 / 尺寸</TableCell>
              <TableCell>材质与丝径</TableCell>
              <TableCell>间距 / 密度</TableCell>
              <TableCell>编帘匠人</TableCell>
              <TableCell>工序引用</TableCell>
              <TableCell>状态</TableCell>
              <TableCell align="right">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredMoulds.map((mould) => {
              const relatedRuns = runs.filter((run) => run.mouldId === mould.id)
              const latestRun = relatedRuns[0]
              return (
                <TableRow key={mould.id ?? mould.mouldNo} data-testid="row-mould" hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 750 }}>{mould.mouldNo}</Typography>
                    <Typography variant="caption" color="text.secondary">{mould.frameW} × {mould.frameH} cm · {(mould.frameW * mould.frameH / 10000).toFixed(3)} 平方米</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={mould.wireMaterial} variant="outlined" />
                    <Typography variant="body2" sx={{ mt: 0.6 }}>{mould.wireDiameter.toFixed(2)} mm</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography>{mould.stripeGap.toFixed(2)} mm</Typography>
                    <Typography variant="caption" color="text.secondary">{mould.meshDensity.toFixed(1)} 根/cm · 推算 {mmPitchToThreadsPerCm(mould.wireDiameter + mould.stripeGap).toFixed(1)}</Typography>
                  </TableCell>
                  <TableCell>{mould.weaver}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{relatedRuns.length} 槽工序</Typography>
                    <Typography variant="caption" color="text.secondary">{latestRun ? `最近 ${latestRun.runDate}` : '尚无关联'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" color={mould.state === '在用' ? 'success' : mould.state === '待修补' ? 'warning' : 'default'} label={mould.state} />
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant={mould.state === '待修补' ? 'contained' : 'outlined'}
                      disabled={mould.state === '退役' || mould.id === undefined}
                      onClick={() => {
                        if (mould.id !== undefined) void setMouldState(mould.id, mould.state === '待修补' ? '在用' : '待修补')
                      }}
                    >
                      {mould.state === '待修补' ? '完成修补' : '登记修补'}
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
            {filteredMoulds.length === 0 && (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5 }}>没有符合筛选条件的纸帘</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  )
}
