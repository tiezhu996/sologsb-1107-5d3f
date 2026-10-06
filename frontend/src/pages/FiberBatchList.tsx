import { useEffect, useMemo, useState } from 'react'
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, CardContent, Chip, Divider, Grid, LinearProgress, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { RulerInput } from '../components/common/RulerInput'
import { useFiberStore } from '../stores/fiberStore'
import { useRunStore } from '../stores/runStore'
import { BLEACH_METHODS, COOK_AGENTS, FIBER_MATERIALS, type FiberBatchInput, type FiberMaterial, type CookAgent, type BleachMethod } from '../types/fiber-batch'

const emptyFiberForm: FiberBatchInput = {
  batchNo: '',
  material: '构皮',
  origin: '陕西洋县华阳镇',
  cookAgent: '石灰',
  cookHours: 8,
  bleachMethod: '日晒',
  beatingDegree: 32,
  operator: '罗青禾',
}

export default function FiberBatchList() {
  const fiberBatches = useFiberStore((state) => state.fiberBatches)
  const error = useFiberStore((state) => state.error)
  const loadFiberBatches = useFiberStore((state) => state.loadFiberBatches)
  const addFiberBatch = useFiberStore((state) => state.addFiberBatch)
  const runs = useRunStore((state) => state.sheetRuns)
  const loadRuns = useRunStore((state) => state.loadRuns)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FiberBatchInput>(emptyFiberForm)
  const [materialFilter, setMaterialFilter] = useState<FiberMaterial | '全部'>('全部')
  const [degreeLimit, setDegreeLimit] = useState(45)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void loadFiberBatches()
    void loadRuns()
  }, [loadFiberBatches, loadRuns])

  const filteredBatches = useMemo(
    () => fiberBatches.filter((batch) => (materialFilter === '全部' || batch.material === materialFilter) && batch.beatingDegree <= degreeLimit),
    [degreeLimit, fiberBatches, materialFilter],
  )
  const averageDegree = filteredBatches.length
    ? filteredBatches.reduce((sum, batch) => sum + batch.beatingDegree, 0) / filteredBatches.length
    : 0

  const updateForm = <K extends keyof FiberBatchInput,>(key: K, value: FiberBatchInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleSubmit = async () => {
    if (!form.batchNo.trim() || !form.origin.trim() || !form.operator.trim() || form.cookHours <= 0 || form.beatingDegree <= 0) return
    setSubmitting(true)
    const created = await addFiberBatch({ ...form, batchNo: form.batchNo.trim(), origin: form.origin.trim(), operator: form.operator.trim() })
    setSubmitting(false)
    if (created) {
      setForm(emptyFiberForm)
      setShowForm(false)
    }
  }

  return (
    <Stack spacing={3}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box>
          <Typography component="h1" variant="h3" color="#344a34">纤维料批台账</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>按原料与打浆度横向比较，并回看料批进入各槽抄纸工序的引用关系。</Typography>
        </Box>
        <Button variant="contained" size="large" onClick={() => setShowForm((current) => !current)} data-testid="new-fiber">
          {showForm ? '收起登记' : '新建料批'}
        </Button>
      </Box>

      {error && <Alert severity="warning">{error}</Alert>}

      {showForm && (
        <Card data-testid="form-fiber" sx={{ borderColor: '#9eb096' }}>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h5" sx={{ mb: 2 }}>登记纤维料批</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}><TextField fullWidth label="批次编号" value={form.batchNo} onChange={(event) => updateForm('batchNo', event.target.value)} inputProps={{ 'data-testid': 'field-batchNo' }} /></Grid>
              <Grid item xs={6} md={2}>
                <TextField select fullWidth label="纤维原料" value={form.material} onChange={(event) => updateForm('material', event.target.value as FiberMaterial)} SelectProps={{ native: true, inputProps: { 'data-testid': 'field-material' } }}>
                  {FIBER_MATERIALS.map((option) => <option key={option} value={option}>{option}</option>)}
                </TextField>
              </Grid>
              <Grid item xs={12} md={3}><TextField fullWidth label="采收地" value={form.origin} onChange={(event) => updateForm('origin', event.target.value)} inputProps={{ 'data-testid': 'field-origin' }} /></Grid>
              <Grid item xs={6} md={2}>
                <TextField select fullWidth label="蒸煮剂" value={form.cookAgent} onChange={(event) => updateForm('cookAgent', event.target.value as CookAgent)} SelectProps={{ native: true, inputProps: { 'data-testid': 'field-cookAgent' } }}>
                  {COOK_AGENTS.map((option) => <option key={option} value={option}>{option}</option>)}
                </TextField>
              </Grid>
              <Grid item xs={6} md={2}><TextField fullWidth type="number" label="蒸煮时长" value={form.cookHours} onChange={(event) => updateForm('cookHours', Number(event.target.value))} inputProps={{ min: 1, max: 24, step: 1, 'data-testid': 'field-cookHours' }} InputProps={{ endAdornment: '小时' }} /></Grid>
              <Grid item xs={6} md={3}>
                <TextField select fullWidth label="漂白方式" value={form.bleachMethod} onChange={(event) => updateForm('bleachMethod', event.target.value as BleachMethod)} SelectProps={{ native: true, inputProps: { 'data-testid': 'field-bleachMethod' } }}>
                  {BLEACH_METHODS.map((option) => <option key={option} value={option}>{option}</option>)}
                </TextField>
              </Grid>
              <Grid item xs={12} md={5}>
                <RulerInput label="打浆度" value={form.beatingDegree} onChange={(value) => updateForm('beatingDegree', value)} unit="°SR" min={10} max={60} step={1} testId="field-beatingDegree" />
              </Grid>
              <Grid item xs={12} md={4}><TextField fullWidth label="操作人" value={form.operator} onChange={(event) => updateForm('operator', event.target.value)} inputProps={{ 'data-testid': 'field-operator' }} /></Grid>
            </Grid>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 2.5 }}>
              <Button onClick={() => setShowForm(false)}>取消</Button>
              <Button variant="contained" onClick={handleSubmit} disabled={submitting} data-testid="submit-fiber">保存料批</Button>
            </Box>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'end' }}>
            <TextField select size="small" label="原料筛选" value={materialFilter} onChange={(event) => setMaterialFilter(event.target.value as FiberMaterial | '全部')} SelectProps={{ native: true }} sx={{ minWidth: 150 }}>
              <option value="全部">全部原料</option>
              {FIBER_MATERIALS.map((option) => <option key={option} value={option}>{option}</option>)}
            </TextField>
            <Box sx={{ width: 250 }}>
              <RulerInput label="打浆度上限" value={degreeLimit} onChange={setDegreeLimit} unit="°SR" min={10} max={60} step={1} compact />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: { md: 'auto' } }}>
              <Typography variant="body2" color="text.secondary">当前记录</Typography>
              <Typography variant="h5" data-testid="count-fiber">{filteredBatches.length}</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Stack spacing={1.5}>
        {filteredBatches.map((batch) => {
          const relatedRuns = runs.filter((run) => run.batchId === batch.id)
          return (
            <Accordion key={batch.id ?? batch.batchNo} data-testid="row-fiber" disableGutters sx={{ border: '1px solid #ddd2bd', borderRadius: '10px !important', '&::before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<Box component="span" aria-hidden="true" sx={{ fontSize: 20, lineHeight: 1 }}>⌄</Box>}>
                <Grid container spacing={1.5} alignItems="center" sx={{ width: '100%' }}>
                  <Grid item xs={12} sm={3} md={2}>
                    <Typography sx={{ fontWeight: 800 }}>{batch.batchNo}</Typography>
                    <Typography variant="caption" color="text.secondary">{batch.origin}</Typography>
                  </Grid>
                  <Grid item xs={6} sm={2}><Chip label={batch.material} color={batch.material === '构皮' ? 'success' : 'default'} variant="outlined" /></Grid>
                  <Grid item xs={6} sm={3} md={2}><Typography variant="body2">{batch.cookAgent} · {batch.cookHours} 小时</Typography></Grid>
                  <Grid item xs={12} sm={4} md={3}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ minWidth: 54 }}>{batch.beatingDegree}°SR</Typography>
                      <LinearProgress variant="determinate" value={batch.beatingDegree} color="success" sx={{ flex: 1, height: 8, borderRadius: 4 }} />
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={3}><Typography variant="body2" color="text.secondary">{batch.bleachMethod} · {batch.operator} · 引用 {relatedRuns.length} 次</Typography></Grid>
                </Grid>
              </AccordionSummary>
              <AccordionDetails sx={{ bgcolor: '#faf6ec' }}>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                  <Chip size="small" label={`平均打浆度 ${averageDegree.toFixed(1)}°SR`} />
                  <Chip size="small" label={batch.beatingDegree >= 35 ? '细浆，适合薄页' : batch.beatingDegree >= 29 ? '中细浆，成纸兼顾韧性' : '粗浆，适合厚实纸页'} />
                </Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>引用本料批的抄纸工序</Typography>
                {relatedRuns.length ? (
                  <Table size="small">
                    <TableHead><TableRow><TableCell>工序号</TableCell><TableCell>日期</TableCell><TableCell>操作人</TableCell><TableCell align="right">克重</TableCell><TableCell align="right">实测间距</TableCell></TableRow></TableHead>
                    <TableBody>
                      {relatedRuns.map((run) => (
                        <TableRow key={run.id ?? run.runNo}>
                          <TableCell>{run.runNo}</TableCell><TableCell>{run.runDate}</TableCell><TableCell>{run.operator}</TableCell>
                          <TableCell align="right">{run.grammage} 克/平方米</TableCell><TableCell align="right">{run.measuredGap.toFixed(2)} mm</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Typography color="text.secondary">该料批尚未关联抄纸工序。</Typography>
                )}
                <Divider sx={{ my: 1.5 }} />
                <Typography variant="caption" color="text.secondary">蒸煮后需充分漂洗，再按目标纸性逐步打浆，避免纤维过度切断。</Typography>
              </AccordionDetails>
            </Accordion>
          )
        })}
        {filteredBatches.length === 0 && (
          <Card><CardContent sx={{ textAlign: 'center', py: 6 }}><Typography color="text.secondary">没有符合当前原料与打浆度范围的料批</Typography></CardContent></Card>
        )}
      </Stack>
    </Stack>
  )
}
