"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  alerts,
  batches,
  lineMetrics,
  people,
  qualityPools,
  ruleVersions,
  type DataLine,
  type LineFilter,
  type ViewKey,
} from "./dashboard-data";
import {
  buildImportedDashboardModel,
  combineLineMetric,
  mergeImportedMetrics,
  type ImportedDashboardModel,
  type ImportedForecast,
  type ImportedFollowup,
  type ImportedPerson,
  type ImportedReturnCohort,
  type ImportedTrendPoint,
} from "./dashboard-model";

const navItems: { key: ViewKey; label: string; kicker: string }[] = [
  { key: "overview", label: "经营总览", kicker: "CONTROL" },
  { key: "returns", label: "执行回收", kicker: "EXECUTE" },
  { key: "quality", label: "今日质检", kicker: "QUALITY" },
  { key: "people", label: "人力资源", kicker: "RESOURCE" },
  { key: "inventory", label: "任务供给", kicker: "SUPPLY" },
  { key: "versions", label: "周期与批次", kicker: "CYCLE" },
];

type DrawerContent = { title: string; eyebrow: string; body: string; metric?: string } | null;
type ManualTask = { id: string; batch: string; batchStart: string; batchEnd: string; taskType: string; ruleVersion: string; headcount: string; subjectCount: string; doubleLabelIncrement: string; startTime: string; returnTime: string; issueStatus: string; returnStatus: string; customFields?: Record<string, string> };
type LedgerColumn = { id: string; label: string; kind: "batch" | "taskType" | "ruleVersion" | "headcount" | "subjectCount" | "doubleLabelIncrement" | "startTime" | "returnTime" | "issueStatus" | "returnStatus" | "custom" };
const manualTaskStorageKey = "sft-rl-manual-tasks-v2";
const ledgerColumnStorageKey = "sft-rl-ledger-columns-v1";
const taskTypeOptions = ["RL标注", "RL质检", "RL返修", "SFT标注", "SFT质检", "SFT返修"];
const ruleVersionOptions = ["RL旧版", "RLv1.0", "SFT旧版", "SFTv3.0"];
const defaultLedgerColumns: LedgerColumn[] = [
  { id: "batch", label: "批次", kind: "batch" },
  { id: "taskType", label: "任务类型", kind: "taskType" },
  { id: "ruleVersion", label: "规则版本", kind: "ruleVersion" },
  { id: "headcount", label: "人力", kind: "headcount" },
  { id: "subjectCount", label: "题目数", kind: "subjectCount" },
  { id: "doubleLabelIncrement", label: "双标增量", kind: "doubleLabelIncrement" },
  { id: "startTime", label: "开始时间", kind: "startTime" },
  { id: "returnTime", label: "回收时间", kind: "returnTime" },
  { id: "issueStatus", label: "下发状态", kind: "issueStatus" },
  { id: "returnStatus", label: "回收状态", kind: "returnStatus" },
];
const issueStatusOptions = ["已下发", "待下发"];
const returnStatusOptions = [
  { value: "未回收", label: "未回收 ✕" },
  { value: "不完全回收", label: "不完全回收 ⏳" },
  { value: "完全回收", label: "完全回收 ✓" },
];
const blankMetrics = {
  SFT: Object.fromEntries(Object.keys(lineMetrics.SFT).map((key) => [key, 0])) as typeof lineMetrics.SFT,
  RL: Object.fromEntries(Object.keys(lineMetrics.RL).map((key) => [key, 0])) as typeof lineMetrics.RL,
};

const demoFollowups: ImportedFollowup[] = [
  { id: "ASN-005", person: "标注员A", line: "SFT", assigned: 400, returned: 360, completed: 360, status: "未回收" },
  { id: "ASN-006", person: "标注员B", line: "SFT", assigned: 400, returned: 400, completed: 370, status: "回收未完成" },
  { id: "ASN-021", person: "标注员E", line: "SFT", assigned: 476, returned: 476, completed: 456, status: "回收未完成" },
  { id: "ASN-024", person: "标注员F", line: "RL", assigned: 287, returned: 287, completed: 264, status: "回收未完成" },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value);
}

function percent(numerator: number, denominator: number) {
  return denominator ? (numerator / denominator) * 100 : 0;
}

function exportFollowups(rows: ImportedFollowup[]) {
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const content = [
    ["分配ID", "人员", "数据线", "分配", "回收", "完成", "状态"],
    ...rows.map((row) => [row.id, row.person, row.line, row.assigned, row.returned, row.completed, row.status]),
  ].map((row) => row.map(escape).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "SFT_RL_待跟进清单.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function MetricCard({ label, value, suffix, note, tone = "teal", onClick }: { label: string; value: string; suffix?: string; note: string; tone?: string; onClick?: () => void }) {
  return (
    <button className={`metric-card tone-${tone}`} type="button" onClick={onClick}>
      <span>{label}</span>
      <strong>{value}<small>{suffix}</small></strong>
      <p>{note}</p>
      <i>查看详情 →</i>
    </button>
  );
}

function SectionTitle({ eyebrow, title, note, extra }: { eyebrow: string; title: string; note?: string; extra?: React.ReactNode }) {
  return <div className="section-title"><div><span>{eyebrow}</span><h2>{title}</h2>{note && <p>{note}</p>}</div>{extra}</div>;
}

export default function Home() {
  const [view, setView] = useState<ViewKey>("overview");
  const [line, setLine] = useState<LineFilter>("ALL");
  const [activePool, setActivePool] = useState("全部抽检池");
  const [drawer, setDrawer] = useState<DrawerContent>(null);
  const [imported, setImported] = useState<ImportedDashboardModel | null>(null);
  const [toast, setToast] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [assistantError, setAssistantError] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [manualTasks, setManualTasks] = useState<ManualTask[]>([]);
  const [manualTasksReady, setManualTasksReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!drawer) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const sidebar = sidebarRef.current;
    const workspace = workspaceRef.current;
    if (sidebar) sidebar.inert = true;
    if (workspace) workspace.inert = true;
    const frame = window.requestAnimationFrame(() => drawerRef.current?.querySelector<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])")?.focus());
    const handleDialogKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawer(null);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])")).filter((element) => !element.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleDialogKey);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleDialogKey);
      if (sidebar) sidebar.inert = false;
      if (workspace) workspace.inert = false;
      previousFocus.current?.focus();
    };
  }, [drawer]);

  useEffect(() => {
    let cancelled = false;
    try {
      const saved = window.localStorage.getItem(manualTaskStorageKey);
      const parsed = saved ? JSON.parse(saved) as ManualTask[] : [];
      queueMicrotask(() => {
        if (!cancelled) setManualTasks(parsed);
      });
    } catch {
      // Keep the workspace usable if a previous local draft is malformed.
    } finally {
      queueMicrotask(() => {
        if (!cancelled) setManualTasksReady(true);
      });
    }
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!manualTasksReady) return;
    window.localStorage.setItem(manualTaskStorageKey, JSON.stringify(manualTasks));
  }, [manualTasks, manualTasksReady]);

  const activeMetrics = useMemo(() => imported ? mergeImportedMetrics(imported.metrics) : blankMetrics, [imported]);
  const activeTrend = useMemo<ImportedTrendPoint[]>(() => {
    const source: ImportedTrendPoint[] = imported ? (imported.workdayTrend ?? []) : [];
    if (line === "ALL") return source.slice(-5);
    return source
      .filter((day) => {
        const values = day.byLine?.[line];
        return !values || values.hasData !== false;
      })
      .slice(-5)
      .map((day) => ({ ...day, ...(day.byLine?.[line] ?? {}) }));
  }, [imported, line]);
  const activeQualityPools = useMemo(() => imported?.qualityPools ?? [], [imported]);
  const activeBatches = useMemo(() => imported?.batches ?? [], [imported]);
  const activePeople = useMemo(() => imported?.people ?? [], [imported]);
  const activeRules = useMemo(() => imported?.ruleVersions ?? [], [imported]);
  const reportDate = imported?.report.reportDate ?? "尚未载入";

  const metric = (key: keyof typeof lineMetrics.SFT) => line === "ALL" ? combineLineMetric(key, activeMetrics, imported?.rateWeights) : activeMetrics[line][key];
  const weeklyQualityMetric = (key: "selected" | "completed") => {
    if (!imported) return metric(key === "selected" ? "qcSelected" : "qcCompleted");
    return line === "ALL"
      ? imported.weeklyQuality.SFT[key] + imported.weeklyQuality.RL[key]
      : imported.weeklyQuality[line][key];
  };

  const filteredPools = useMemo(() => activeQualityPools.filter((pool) => (line === "ALL" || pool.line === line) && (activePool === "全部抽检池" || pool.pool === activePool)), [line, activePool, activeQualityPools]);
  const filteredPeople = useMemo(() => activePeople.filter((person) => line === "ALL" || person.line === line), [line, activePeople]);
  const filteredBatches = useMemo(() => activeBatches.filter((batch) => line === "ALL" || batch.line === line), [line, activeBatches]);
  const filteredRules = useMemo(() => activeRules.filter((rule) => line === "ALL" || rule.line === line), [line, activeRules]);
  const filteredCohort = useMemo(() => imported ? (imported.returnCohort ?? []).filter((row) => line === "ALL" || row.line === line) : undefined, [imported, line]);
  const filteredFollowups = useMemo(() => (imported ? (imported.followups ?? []) : demoFollowups).filter((row) => line === "ALL" || row.line === line), [imported, line]);
  const filteredReasons = useMemo(() => {
    if (!imported) return [];
    const totals = new Map<string, number>();
    for (const reason of imported.incompleteReasons ?? []) {
      if (line !== "ALL" && reason.line !== line) continue;
      totals.set(reason.label, (totals.get(reason.label) ?? 0) + reason.value);
    }
    return Array.from(totals, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [imported, line]);

  const activeAlerts = useMemo(() => {
    const scopedLines: DataLine[] = line === "ALL" ? ["SFT", "RL"] : [line];
    const backlogLine = scopedLines.reduce((selected, candidate) => activeMetrics[candidate].returnIncomplete > activeMetrics[selected].returnIncomplete ? candidate : selected);
    const riskLine = scopedLines.reduce((selected, candidate) => activeMetrics[candidate].supportDays < activeMetrics[selected].supportDays ? candidate : selected);
    const pending = scopedLines.reduce((total, item) => total + activeMetrics[item].qcPending, 0);
    const operationalAlerts = [
      { id: "return-incomplete", level: "high", title: `${backlogLine} 本周回收未完成 ${formatNumber(activeMetrics[backlogLine].returnIncomplete)} 题`, detail: "按本周回收记录的其中未完成量汇总，建议继续核销重发与转派。", action: "查看回收明细", view: "returns" as ViewKey },
      { id: "inventory-risk", level: "medium", title: `${riskLine} 库存支撑 ${activeMetrics[riskLine].supportDays.toFixed(1)} 天`, detail: "按每日库存最新快照与最近工作日日均消耗计算。", action: "查看库存预测", view: "inventory" as ViewKey },
      { id: "qc-pending", level: "medium", title: `已抽中待质检 ${formatNumber(pending)} 题`, detail: "仅统计已进入质检方案、但截至报表日尚未完成的记录。", action: "查看质检池", view: "quality" as ViewKey },
    ];
    if (!imported) return [];
    return [...operationalAlerts, { id: "import-audit", level: imported.report.warnings.length ? "medium" : "info", title: imported.report.warnings.length ? `${imported.report.warnings.length} 项数据校验提醒` : "数据包口径校验通过", detail: `已识别 ${imported.report.tables.length} 张表、${imported.report.rows} 条记录。`, action: "查看导入摘要", view: "overview" as ViewKey }];
  }, [activeMetrics, imported, line]);

  async function handleCsvImport(files: FileList | null) {
    if (!files?.length) return;
    const inputs = await Promise.all(Array.from(files).map(async (file) => ({ name: file.name, text: await file.text() })));
    const model = buildImportedDashboardModel(inputs);
    setImported(model);
    const warningText = model.report.warnings.length ? `；发现 ${model.report.warnings.length} 项提醒` : "；口径校验通过";
    setToast(`已识别 ${model.report.tables.length} 张表、${model.report.rows} 条记录${warningText}`);
    setDrawer({
      eyebrow: "本地数据包校验",
      title: model.report.tables.length ? "核心指标已切换到 CSV" : "没有识别到业务表",
      metric: model.report.reportDate ? `报表日 ${model.report.reportDate}` : "未识别报表日",
      body: model.report.tables.length
        ? `已识别：${model.report.tables.join("、")}。${model.report.warnings.length ? `校验提醒：${model.report.warnings.join("；")}` : "未发现跨期、库存扣减或质检守恒异常。"}`
        : `请选择从 Excel 原型业务 sheet 导出的 CSV。${model.report.warnings.join("；")}`,
    });
    window.setTimeout(() => setToast(""), 4200);
  }

  function openAlert(index: number) {
    const alert = activeAlerts[index];
    setView(alert.view);
    if (alert.id === "import-audit" && imported) {
      setDrawer({ eyebrow: "本地数据包校验", title: alert.title, metric: `截至 ${reportDate}`, body: imported.report.warnings.length ? imported.report.warnings.join("；") : "已识别表均通过当前内置的跨期、库存扣减和质检守恒校验。" });
      return;
    }
    setDrawer({ eyebrow: alert.level === "high" ? "高优先级" : "运营提醒", title: alert.title, body: alert.detail, metric: alert.action });
  }

  async function askAssistant() {
    const question = assistantQuestion.trim();
    if (!question || assistantLoading) return;
    setAssistantLoading(true);
    setAssistantError("");
    setAssistantAnswer("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, context: { view, line, reportDate, imported: Boolean(imported) } }),
      });
      const payload = await response.json() as { answer?: string; error?: string };
      if (!response.ok || !payload.answer) throw new Error(payload.error || "问答服务暂时不可用。");
      setAssistantAnswer(payload.answer);
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : "问答服务暂时不可用，请稍后重试。");
    } finally {
      setAssistantLoading(false);
    }
  }

  function addManualTask() {
    setManualTasks((tasks) => [{ id: crypto.randomUUID(), batch: "", batchStart: "", batchEnd: "", taskType: "SFT标注", ruleVersion: "", headcount: "", subjectCount: "", doubleLabelIncrement: "", startTime: "", returnTime: "", issueStatus: "待下发", returnStatus: "未回收" }, ...tasks]);
  }

  function updateManualTask(id: string, field: Exclude<keyof ManualTask, "id" | "customFields">, value: string) {
    setManualTasks((tasks) => tasks.map((task) => task.id === id ? { ...task, [field]: value } : task));
  }

  function updateCustomField(id: string, field: string, value: string) {
    setManualTasks((tasks) => tasks.map((task) => task.id === id ? { ...task, customFields: { ...task.customFields, [field]: value } } : task));
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" ref={sidebarRef}>
        <div className="brand"><span className="brand-mark">01</span><div><strong>任务运营台</strong><small>MULTI-SITE CONTROL</small></div></div>
        <nav aria-label="主导航">
          {navItems.map((item) => <button className={view === item.key ? "active" : ""} key={item.key} onClick={() => setView(item.key)} type="button"><small>{item.kicker}</small><span>{item.label}</span></button>)}
        </nav>
        <div className="sidebar-status"><span /><div><strong>{imported ? "数据链路已接入" : "等待数据接入"}</strong><small>{imported ? `${imported.report.rows} 条记录 · 本地内存` : "导入 CSV 或新增任务开始使用"}</small></div></div>
      </aside>

      <section className="workspace" ref={workspaceRef}>
        <header className="topbar">
          <div><p className="eyebrow">PROJECT P-26-081 · OPERATION CONTROL</p><h1>{navItems.find((item) => item.key === view)?.label}</h1><p className="subtitle">计划、执行、回收、资源与质检，统一回到可追溯的任务闭环。</p></div>
          <div className="header-actions">
            <div className="period-switch"><span>当前周期 · 近 5 个工作日</span></div>
            <input ref={fileInput} hidden multiple accept=".csv,text/csv" type="file" onChange={(event) => { void handleCsvImport(event.target.files); event.target.value = ""; }} />
            <button className="import-button" type="button" onClick={() => fileInput.current?.click()}>接入数据包</button>
          </div>
        </header>

        <section className="control-deck">
          <div className="line-switch"><button className={line === "ALL" ? "active" : ""} onClick={() => setLine("ALL")} type="button">全部</button><button className={line === "SFT" ? "active sft" : ""} onClick={() => setLine("SFT")} type="button">SFT</button><button className={line === "RL" ? "active rl" : ""} onClick={() => setLine("RL")} type="button">RL</button></div>
          <span>快照 {reportDate}</span><span>计划 / 实际按数量校准</span><span>仅首次发放扣减供给</span>
          {imported && <button className={`import-status ${imported.report.warnings.length ? "warn" : "ok"}`} type="button" onClick={() => openAlert(3)}>{imported.report.tables.length} 张表 · {imported.report.warnings.length ? `${imported.report.warnings.length} 项提醒` : "校验通过"}</button>}
          {imported && <button className="reset-data" type="button" onClick={() => { setImported(null); setDrawer(null); }}>清空导入数据</button>}
        </section>

        {view === "overview" && <Overview metric={metric} weeklyQualityMetric={weeklyQualityMetric} line={line} trend={activeTrend} alertsData={activeAlerts} setView={setView} openAlert={openAlert} />}
        {view === "returns" && <Returns metric={metric} line={line} trend={activeTrend} cohort={filteredCohort} reasons={filteredReasons} followups={filteredFollowups} imported={Boolean(imported)} setDrawer={setDrawer} />}
        {view === "quality" && <Quality pools={filteredPools} activePool={activePool} setActivePool={setActivePool} setDrawer={setDrawer} />}
        {view === "people" && <PeopleBoard data={filteredPeople} trend={activeTrend} setDrawer={setDrawer} />}
        {view === "inventory" && <InventoryBoard data={filteredBatches} line={line} metric={metric} trend={activeTrend} forecast={imported?.forecast} setDrawer={setDrawer} />}
        {view === "versions" && <VersionsBoard data={filteredRules} setDrawer={setDrawer} />}

        {view === "overview" && <ManualTaskLedger tasks={manualTasks} onAdd={addManualTask} onChange={updateManualTask} onCustomChange={updateCustomField} onDelete={(id) => setManualTasks((tasks) => tasks.filter((task) => task.id !== id))} />}

        <div className="local-data-note"><b>数据安全：</b> CSV 在浏览器内存中解析，不会上传或保存。正式上线前仍需公司信息安全审批。</div>
      </section>

      {drawer && <div className="drawer-backdrop"><button className="drawer-scrim" type="button" aria-label="关闭详情" onClick={() => setDrawer(null)} /><aside ref={drawerRef} className="detail-drawer" aria-modal="true" aria-labelledby="detail-drawer-title" role="dialog"><button className="drawer-close" type="button" aria-label="关闭详情" onClick={() => setDrawer(null)}>×</button><span>{drawer.eyebrow}</span><h2 id="detail-drawer-title">{drawer.title}</h2>{drawer.metric && <strong>{drawer.metric}</strong>}<p>{drawer.body}</p><div className="drawer-steps"><b>建议下一步</b><ol><li>按数据线和作业批次确认来源</li><li>下钻到发放单或质检方案</li><li>记录处理人、截止时间和关闭结果</li></ol></div></aside></div>}
      <button className="assistant-fab" type="button" aria-expanded={assistantOpen} aria-controls="ops-assistant" onClick={() => setAssistantOpen((open) => !open)}>✦ 运营问答</button>
      {assistantOpen && <section className="assistant-panel" id="ops-assistant" aria-label="运营问答机器人"><header><div><span>DEEPSEEK · OPS COPILOT</span><strong>问问当前运营状态</strong></div><button type="button" aria-label="关闭运营问答" onClick={() => setAssistantOpen(false)}>×</button></header><p>可询问库存风险、回收积压、质检重点与下一步动作。</p>{assistantAnswer && <div className="assistant-answer">{assistantAnswer}</div>}{assistantError && <div className="assistant-error">{assistantError}</div>}<textarea value={assistantQuestion} onChange={(event) => setAssistantQuestion(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void askAssistant(); } }} placeholder="例如：当前最需要优先处理的风险是什么？" rows={4} /><footer><small>⌘ / Ctrl + Enter 发送</small><button type="button" disabled={!assistantQuestion.trim() || assistantLoading} onClick={() => { void askAssistant(); }}>{assistantLoading ? "正在分析…" : "发送问题"}</button></footer></section>}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const openCalendar = () => {
    inputRef.current?.focus();
    inputRef.current?.showPicker?.();
  };
  return <span className="date-field"><input ref={inputRef} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} type="date" /><button type="button" aria-label={`选择${label}`} title="选择日期" onClick={openCalendar}>⌄</button></span>;
}

function ManualTaskLedger({ tasks, onAdd, onChange, onCustomChange, onDelete }: { tasks: ManualTask[]; onAdd: () => void; onChange: (id: string, field: Exclude<keyof ManualTask, "id" | "customFields">, value: string) => void; onCustomChange: (id: string, field: string, value: string) => void; onDelete: (id: string) => void }) {
  const [columns, setColumns] = useState<LedgerColumn[]>(defaultLedgerColumns);
  const [columnsReady, setColumnsReady] = useState(false);
  const [columnPanelOpen, setColumnPanelOpen] = useState(false);
  const [columnDraft, setColumnDraft] = useState("");
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ledgerColumnStorageKey);
      const parsed = saved ? JSON.parse(saved) as LedgerColumn[] : defaultLedgerColumns;
      const normalized = Array.isArray(parsed) && parsed.length ? parsed.map((column) => defaultLedgerColumns.find((defaultColumn) => defaultColumn.id === column.id) ?? column) : defaultLedgerColumns;
      const valid = [...normalized, ...defaultLedgerColumns.filter((defaultColumn) => !normalized.some((column) => column.id === defaultColumn.id))];
      queueMicrotask(() => setColumns(valid));
    } catch {
      // Keep the default column set if a saved layout is malformed.
    } finally {
      queueMicrotask(() => setColumnsReady(true));
    }
  }, []);

  useEffect(() => {
    if (!columnsReady) return;
    window.localStorage.setItem(ledgerColumnStorageKey, JSON.stringify(columns));
  }, [columns, columnsReady]);

  const addColumn = () => {
    const label = columnDraft.trim();
    if (!label) return;
    const id = `custom-${crypto.randomUUID()}`;
    setColumns((current) => {
      const returnIndex = current.findIndex((column) => column.id === "returnStatus");
      const insertAt = returnIndex === -1 ? current.length : returnIndex + 1;
      return [...current.slice(0, insertAt), { id, label, kind: "custom" }, ...current.slice(insertAt)];
    });
    setColumnDraft("");
    setColumnPanelOpen(false);
  };

  const moveColumn = (targetId: string) => {
    if (!draggedColumn || draggedColumn === targetId) return;
    setColumns((current) => {
      const sourceIndex = current.findIndex((column) => column.id === draggedColumn);
      const targetIndex = current.findIndex((column) => column.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = current.slice();
      const [source] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, source);
      return next;
    });
    setDraggedColumn(null);
  };

  const saveColumnLabel = (id: string) => {
    const label = editingLabel.trim();
    if (label) setColumns((current) => current.map((column) => column.id === id ? { ...column, label } : column));
    setEditingColumn(null);
  };

  const removeColumn = (id: string) => {
    setColumns((current) => current.filter((column) => column.id !== id));
  };

  const columnGrid = { gridTemplateColumns: `${columns.map((column) => column.kind === "batch" ? "310px" : ["headcount", "subjectCount", "doubleLabelIncrement"].includes(column.kind) ? "72px" : "112px").join(" ")} 32px` };

  const renderCell = (task: ManualTask, column: LedgerColumn) => {
    if (column.kind === "batch") return <div className="batch-fields"><div><DateField label="开始日期" value={task.batchStart} onChange={(value) => onChange(task.id, "batchStart", value)} /><i>—</i><DateField label="结束日期" value={task.batchEnd} onChange={(value) => onChange(task.id, "batchEnd", value)} /></div></div>;
    if (column.kind === "taskType") return <select aria-label="任务类型" value={task.taskType} onChange={(event) => onChange(task.id, "taskType", event.target.value)}>{taskTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
    if (column.kind === "ruleVersion") return <select aria-label="规则版本" value={task.ruleVersion ?? ""} onChange={(event) => onChange(task.id, "ruleVersion", event.target.value)}><option value="">选择版本</option>{ruleVersionOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
    if (column.kind === "headcount") return <input aria-label="人力" value={task.headcount} onChange={(event) => onChange(task.id, "headcount", event.target.value)} inputMode="numeric" placeholder="人数" />;
    if (column.kind === "subjectCount") return <input aria-label="题目数" value={task.subjectCount ?? ""} onChange={(event) => onChange(task.id, "subjectCount", event.target.value)} inputMode="numeric" placeholder="题目数" />;
    if (column.kind === "doubleLabelIncrement") return <input aria-label="双标增量" value={task.doubleLabelIncrement ?? ""} onChange={(event) => onChange(task.id, "doubleLabelIncrement", event.target.value)} inputMode="numeric" placeholder="增量" />;
    if (column.kind === "startTime") return <DateField label="开始时间" value={task.startTime} onChange={(value) => onChange(task.id, "startTime", value)} />;
    if (column.kind === "returnTime") return <DateField label="回收时间" value={task.returnTime} onChange={(value) => onChange(task.id, "returnTime", value)} />;
    if (column.kind === "issueStatus") return <select aria-label="下发状态" value={task.issueStatus} onChange={(event) => onChange(task.id, "issueStatus", event.target.value)}>{issueStatusOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
    if (column.kind === "returnStatus") return <select aria-label="回收状态" value={task.returnStatus} onChange={(event) => onChange(task.id, "returnStatus", event.target.value)}>{returnStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
    return <input aria-label={column.label} value={task.customFields?.[column.id] ?? ""} onChange={(event) => onCustomChange(task.id, column.id, event.target.value)} placeholder={column.label} />;
  };

  return <article className="panel task-ledger">
    <SectionTitle eyebrow="本地任务台账" title="手工登记与编辑任务" note="拖动表头可调整整列位置；新增格子默认在回收状态后面。" extra={<div className="ledger-actions"><button className="ledger-category" type="button" onClick={() => setColumnPanelOpen((open) => !open)}>＋ 增加类目</button><button className="ledger-add" type="button" onClick={onAdd}>＋ 新增一条</button></div>} />
    {columnPanelOpen && <div className="category-editor"><label>新格子名称<input value={columnDraft} onChange={(event) => setColumnDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addColumn(); } }} placeholder="例如：验收人" /></label><button type="button" onClick={addColumn} disabled={!columnDraft.trim()}>添加到回收状态后</button><button className="category-cancel" type="button" onClick={() => { setColumnPanelOpen(false); setColumnDraft(""); }}>取消</button></div>}
    <div className="task-table">
      <div className="task-row task-header" style={columnGrid}>{columns.map((column) => <div className="column-header" key={column.id}>{editingColumn === column.id ? <><input className="column-name-editor" aria-label="编辑类目名称" value={editingLabel} onChange={(event) => setEditingLabel(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveColumnLabel(column.id); if (event.key === "Escape") setEditingColumn(null); }} onBlur={() => saveColumnLabel(column.id)} /><button className="column-edit" type="button" aria-label={`保存 ${column.label}`} title="保存类目名称" onMouseDown={(event) => event.preventDefault()} onClick={() => saveColumnLabel(column.id)}>✎</button><button className="column-remove" type="button" aria-label={`删除 ${column.label}`} title="删除类目列" onMouseDown={(event) => event.preventDefault()} onClick={() => removeColumn(column.id)}>🗑</button></> : <button className={`column-handle ${draggedColumn === column.id ? "dragging" : ""}`} type="button" draggable onClick={() => { if (column.kind === "custom") { setEditingColumn(column.id); setEditingLabel(column.label); } }} onDragStart={(event) => { setDraggedColumn(column.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDraggedColumn(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => moveColumn(column.id)} title={column.kind === "custom" ? "点击编辑；拖动调整位置" : "拖动调整位置"}>⋮⋮ {column.label}</button>}</div>)}<span aria-label="操作" /></div>
      {tasks.map((task) => { const isDraft = !task.batchStart && !task.batchEnd && !task.ruleVersion && !task.headcount && !task.startTime && !task.returnTime; return <div className={`task-row ${isDraft ? "is-draft" : "is-filled"}`} key={task.id} style={columnGrid}>{columns.map((column) => <div className="ledger-cell" key={column.id}>{renderCell(task, column)}</div>)}<button className="ledger-delete" type="button" aria-label="删除任务" title="删除此条" onClick={() => onDelete(task.id)}>🗑</button></div>; })}
      {!tasks.length && <div className="ledger-empty">当前没有任何数据。点击“新增一条”开始登记。</div>}
    </div>
  </article>;
}

function Overview({ metric, weeklyQualityMetric, line, trend, alertsData, setView, openAlert }: { metric: (key: keyof typeof lineMetrics.SFT) => number; weeklyQualityMetric: (key: "selected" | "completed") => number; line: LineFilter; trend: ImportedTrendPoint[]; alertsData: typeof alerts; setView: (view: ViewKey) => void; openAlert: (index: number) => void }) {
  const flow = [
    { label: "首次发放", value: metric("weekIssued"), pct: metric("weekIssued") ? 100 : 0 },
    { label: "已回收", value: metric("returned"), pct: percent(metric("returned"), metric("weekIssued")) },
    { label: "已完成", value: metric("completed"), pct: percent(metric("completed"), metric("weekIssued")) },
    { label: "已抽检", value: weeklyQualityMetric("selected"), pct: percent(weeklyQualityMetric("selected"), metric("weekIssued")) },
    { label: "质检完成", value: weeklyQualityMetric("completed"), pct: percent(weeklyQualityMetric("completed"), metric("weekIssued")) },
  ];
  return <>
    <section className="metric-grid">
      <MetricCard label="当前可用库存" value={formatNumber(metric("inventory"))} note={`预计支撑 ${metric("supportDays").toFixed(1)} 个工作日`} tone="blue" onClick={() => setView("inventory")} />
      <MetricCard label="本周首次发放" value={formatNumber(metric("weekIssued"))} note={`今日发放 ${formatNumber(metric("todayIssued"))}，不含双标`} tone="indigo" onClick={() => setView("returns")} />
      <MetricCard label="回收未完成" value={formatNumber(metric("returnIncomplete"))} note="需要进入重发、转派或关闭" tone="amber" onClick={() => setView("returns")} />
      <MetricCard label="待质检" value={formatNumber(metric("qcPending"))} note={`质检完成率 ${percent(metric("qcCompleted"), metric("qcSelected")).toFixed(1)}%`} tone="rose" onClick={() => setView("quality")} />
    </section>
    <section className="dashboard-grid two-one">
      <article className="panel flow-panel"><SectionTitle eyebrow="本周流转" title="从发放到质检完成" note={`${line === "ALL" ? "SFT + RL" : line} · 唯一题目口径`} /><div className="funnel-list">{flow.map((item) => <div className="funnel-row" key={item.label}><span>{item.label}</span><div className="bar-track"><i style={{ width: `${Math.max(5, item.pct)}%` }} /></div><strong>{formatNumber(item.value)}</strong><small>{item.pct.toFixed(1)}%</small></div>)}</div></article>
      <article className="panel"><SectionTitle eyebrow="立即处理" title="异常与积压" extra={<span className="text-badge">{alertsData.length} 条</span>} /><ul className="alert-list">{alertsData.map((alert, index) => <li key={alert.id}><button type="button" onClick={() => openAlert(index)}><i className={alert.level} /><div><strong>{alert.title}</strong><span>{alert.detail}</span></div><b>→</b></button></li>)}</ul></article>
    </section>
    <section className="dashboard-grid equal">
      <article className="panel"><SectionTitle eyebrow="日趋势" title="发放、回收与完成" note="悬停柱形查看每日数量" /><div className="triple-chart">{trend.map((day) => { const max = Math.max(...trend.flatMap((item) => [item.issued, item.returned, item.completed]), 1); return <div className="triple-day" key={day.date}><div className="triple-bars"><i className="issued" style={{ height: `${(day.issued / max) * 100}%` }} title={`发放 ${day.issued}`} /><i className="returned" style={{ height: `${(day.returned / max) * 100}%` }} title={`回收 ${day.returned}`} /><i className="done" style={{ height: `${(day.completed / max) * 100}%` }} title={`完成 ${day.completed}`} /></div><small>{day.date}</small></div>})}</div><div className="chart-legend"><span><i className="issued"/>发放</span><span><i className="returned"/>回收</span><span><i className="done"/>完成</span></div></article>
      <article className="panel"><SectionTitle eyebrow="质量脉搏" title="双标与质检" /><div className="quality-rings"><div className="ring" style={{ "--value": `${metric("consistencyRate") * 3.6}deg` } as React.CSSProperties}><b>{metric("consistencyRate").toFixed(1)}%</b><span>双标一致率</span></div><div className="ring rose" style={{ "--value": `${metric("qcPassRate") * 3.6}deg` } as React.CSSProperties}><b>{metric("qcPassRate").toFixed(1)}%</b><span>质检通过率</span></div></div><button className="panel-action" type="button" onClick={() => setView("quality")}>查看三个抽检池 →</button></article>
    </section>
  </>;
}

function Returns({ metric, line, trend, cohort, reasons, followups, imported, setDrawer }: {
  metric: (key: keyof typeof lineMetrics.SFT) => number;
  line: LineFilter;
  trend: ImportedTrendPoint[];
  cohort?: ImportedReturnCohort[];
  reasons: Array<{ label: string; value: number }>;
  followups: ImportedFollowup[];
  imported: boolean;
  setDrawer: (drawer: DrawerContent) => void;
}) {
  const issued = metric("weekIssued");
  const returned = metric("returned");
  const completed = metric("completed");
  const cohortRows: ImportedReturnCohort[] = cohort ?? trend.map((day, row) => ({
    line: line === "RL" ? "RL" : "SFT",
    date: day.date,
    values: [42, 68, 81, 91, 96].map((value, column) => Math.min(100, value + row * 2 - column * 2)),
  }));
  const reasonMax = reasons[0]?.value ?? 1;
  return <>
    <section className="metric-grid"><MetricCard label="首次回收率" value={percent(returned, issued).toFixed(1)} suffix="%" note="回收量 ÷ 首次发放量" tone="teal" /><MetricCard label="完成率" value={percent(completed, issued).toFixed(1)} suffix="%" note="完成量 ÷ 首次发放量" tone="blue" /><MetricCard label="回收未完成" value={formatNumber(metric("returnIncomplete"))} note="已提交但内容尚未完成" tone="amber" /><MetricCard label="待返工" value={formatNumber(metric("rework"))} note="质检不通过后需要重做" tone="rose" /></section>
    <section className="dashboard-grid two-one"><article className="panel"><SectionTitle eyebrow="发放 COHORT" title="按发放日观察回收成熟度" note={`${line === "ALL" ? "全部数据线" : line} · 颜色越深代表完成率越高`} /><div className="cohort"><div className="cohort-head"><span>发放日</span>{["D0","D1","D2","D3","D4"].map((item) => <b key={item}>{item}</b>)}</div>{cohortRows.map((row) => <div className="cohort-row" key={`${row.line}-${row.date}`}><span>{line === "ALL" && imported ? `${row.date} · ${row.line}` : row.date}</span>{row.values.map((value, index) => <i className={value === null ? "empty" : ""} key={index} title={value === null ? `${row.date} D${index} 尚未到观察日` : `${row.date} ${index}天后完成率 ${value.toFixed(1)}%`} style={value === null ? undefined : { opacity: Math.max(.18, value / 100) }}>{value === null ? "—" : `${value.toFixed(0)}%`}</i>)}</div>)}{!cohortRows.length && <p className="empty-state">当前筛选没有可计算的发放 cohort。</p>}</div></article><article className="panel"><SectionTitle eyebrow="未完成原因" title="需要优先改善什么" /><div className="reason-bars">{reasons.map((reason, index) => <button key={reason.label} type="button" onClick={() => setDrawer({ eyebrow: "未完成原因", title: reason.label, metric: `${reason.value} 题`, body: "建议按规则版本、人员和发放单继续下钻，确认是规则问题、任务难度还是排期问题。" })}><span>{index + 1}. {reason.label}</span><div><i style={{ width: `${(reason.value / reasonMax) * 100}%` }} /></div><b>{reason.value}</b></button>)}{!reasons.length && <p className="empty-state">本周没有回收未完成原因。</p>}</div></article></section>
    <article className="panel table-panel"><SectionTitle eyebrow="需要跟进" title="未回收与回收未完成任务" extra={<button className="text-button" type="button" disabled={!followups.length} onClick={() => exportFollowups(followups)}>导出跟进清单</button>} /><div className="data-table"><div className="table-row header"><span>分配ID</span><span>人员</span><span>数据线</span><span>分配</span><span>回收</span><span>完成</span><span>状态</span></div>{followups.map((row) => <button className="table-row" key={row.id} type="button" onClick={() => setDrawer({ eyebrow: "任务明细", title: row.id, metric: row.status, body: `${row.person} · ${row.line} · 分配 ${row.assigned} / 回收 ${row.returned} / 完成 ${row.completed}` })}><span>{row.id}</span><span>{row.person}</span><span>{row.line}</span><span>{row.assigned}</span><span>{row.returned}</span><span>{row.completed}</span><span className="status-pill warn">{row.status}</span></button>)}{!followups.length && <p className="empty-state">当前筛选没有待跟进任务。</p>}</div></article>
  </>;
}

function Quality({ pools, activePool, setActivePool, setDrawer }: { pools: typeof qualityPools; activePool: string; setActivePool: (pool: string) => void; setDrawer: (drawer: DrawerContent) => void }) {
  const totalSelected = pools.reduce((sum, pool) => sum + pool.selected, 0);
  const totalCompleted = pools.reduce((sum, pool) => sum + pool.completed, 0);
  const totalPass = pools.reduce((sum, pool) => sum + pool.passed, 0);
  return <>
    <section className="metric-grid"><MetricCard label="实际抽取量" value={formatNumber(totalSelected)} note="三个抽检池加权汇总" tone="indigo" /><MetricCard label="质检完成率" value={percent(totalCompleted, totalSelected).toFixed(1)} suffix="%" note="完成量 ÷ 实际抽取量" tone="teal" /><MetricCard label="质检通过率" value={percent(totalPass, totalCompleted).toFixed(1)} suffix="%" note="通过量 ÷ 已质检量" tone="blue" /><MetricCard label="待质检" value={formatNumber(Math.max(0, totalSelected - totalCompleted))} note="已抽中但尚未完成" tone="rose" /></section>
    <div className="pool-tabs">{["全部抽检池","双标一致","双标不一致","未双标"].map((pool) => <button className={activePool === pool ? "active" : ""} key={pool} onClick={() => setActivePool(pool)} type="button">{pool}</button>)}</div>
    <section className="pool-grid">{pools.map((pool) => { const completion = pool.selected ? (pool.completed / pool.selected) * 100 : 0; return <button className={`pool-card pool-${pool.pool}`} key={`${pool.line}-${pool.pool}`} type="button" onClick={() => setDrawer({ eyebrow: `${pool.line} · ${pool.pool}`, title: "质检方案明细", metric: `待质检 ${pool.selected - pool.completed}`, body: `池内 ${pool.eligible} 题，计划 ${pool.plannedRate}% / 实际 ${pool.actualRate}%，通过 ${pool.passed}、不通过 ${pool.failed}、存疑 ${pool.disputed}。` })}><div className="pool-head"><span>{pool.line}</span><strong>{pool.pool}</strong><i>{pool.selected - pool.completed} 待处理</i></div><div className="pool-numbers"><div><small>池内可抽</small><b>{pool.eligible}</b></div><div><small>计划 / 实际</small><b>{pool.plannedRate}% / {pool.actualRate}%</b></div><div><small>已完成</small><b>{pool.completed}</b></div></div><div className="progress"><i style={{ width: `${completion}%` }} /></div><div className="stacked-quality"><i className="pass" style={{ width: `${(pool.passed / Math.max(pool.completed,1))*100}%` }} /><i className="fail" style={{ width: `${(pool.failed / Math.max(pool.completed,1))*100}%` }} /><i className="dispute" style={{ width: `${(pool.disputed / Math.max(pool.completed,1))*100}%` }} /></div></button>})}</section>
    <article className="panel quality-compare"><SectionTitle eyebrow="比例校准" title="计划比例 vs 实际比例" note="不直接平均三个池子的百分比" /><div className="compare-list">{pools.map((pool) => <div key={`${pool.line}-${pool.pool}`}><span>{pool.line} · {pool.pool}</span><div className="dual-bar"><i className="planned" style={{ width: `${Math.min(100,pool.plannedRate)}%` }} /><i className="actual" style={{ width: `${Math.min(100,pool.actualRate)}%` }} /></div><b>{pool.plannedRate}% / {pool.actualRate}%</b></div>)}</div></article>
  </>;
}

function PeopleBoard({ data, trend, setDrawer }: { data: Array<(typeof people)[number] | ImportedPerson>; trend: ImportedTrendPoint[]; setDrawer: (drawer: DrawerContent) => void }) {
  const heatmapDates = trend.slice(-5).map((day) => day.date);
  while (heatmapDates.length < 5) heatmapDates.unshift(`D-${5 - heatmapDates.length}`);
  const heatValues = (person: (typeof data)[number]) => heatmapDates.map((date, index) => {
    const sourceIndex = "dayDates" in person && person.dayDates ? person.dayDates.indexOf(date) : index;
    return sourceIndex >= 0 ? (person.days[sourceIndex] ?? 0) : 0;
  });
  return <><section className="metric-grid"><MetricCard label="快照参与人员" value={String(data.length)} note="截至报表日的标注与质检人员" tone="teal" /><MetricCard label="累计分配" value={formatNumber(data.reduce((sum, person) => sum + person.assigned, 0))} note="包含双标和返工工作量" tone="indigo" /><MetricCard label="累计完成" value={formatNumber(data.reduce((sum, person) => sum + person.completed, 0))} note="人员任务口径" tone="blue" /><MetricCard label="人员待完成" value={formatNumber(data.reduce((sum, person) => sum + person.pending, 0))} note="需要结合截止时间处理" tone="amber" /></section><section className="dashboard-grid equal"><article className="panel"><SectionTitle eyebrow="人员负载" title="分配与完成对比" /><div className="people-bars">{data.map((person) => <button key={`${person.line}-${person.role}-${person.name}`} type="button" onClick={() => setDrawer({ eyebrow: `${person.line} · ${person.role}`, title: person.name, metric: `完成率 ${percent(person.completed, person.assigned).toFixed(1)}%`, body: `分配 ${person.assigned}、完成 ${person.completed}、待完成 ${person.pending}，${person.role === "质检" ? "质检通过率" : "任务完成率"} ${person.quality.toFixed(1)}%。` })}><div><strong>{person.name}</strong><small>{person.line} · {person.role}</small></div><div className="person-progress"><i style={{ width: `${percent(person.completed, person.assigned)}%` }} /></div><span>{person.completed}/{person.assigned}</span></button>)}</div></article><article className="panel"><SectionTitle eyebrow="工作节奏" title="近5个工作日热力图" note="颜色越深代表当日负载越高" /><div className="heatmap"><div className="heat-head"><span>人员</span>{heatmapDates.map((date) => <b key={date}>{date}</b>)}</div>{data.map((person) => <div className="heat-row" key={`${person.line}-${person.role}-${person.name}`}><span>{person.name}</span>{heatValues(person).map((value,index) => <i key={index} title={`${person.name} ${heatmapDates[index]} 负载 ${value}%`} style={{ opacity: Math.max(.16,value/100) }}>{value}</i>)}</div>)}</div></article></section></>;
}

function InventoryBoard({ data, line, metric, trend, forecast, setDrawer }: { data: typeof batches; line: LineFilter; metric: (key: keyof typeof lineMetrics.SFT) => number; trend: ImportedTrendPoint[]; forecast?: Record<DataLine, ImportedForecast>; setDrawer: (drawer: DrawerContent) => void }) {
  const inventoryValues = trend.flatMap((day) => line === "SFT" ? [day.sftInventory] : line === "RL" ? [day.rlInventory] : [day.sftInventory, day.rlInventory]);
  const maxInventory = Math.max(...inventoryValues, 1);
  const forecastValue = (key: "dailyAverage" | "weekForecast") => {
    if (line !== "ALL") return forecast?.[line][key];
    const values = [forecast?.SFT[key], forecast?.RL[key]].filter((value): value is number => value !== undefined);
    return values.length ? values.reduce((total, value) => total + value, 0) : undefined;
  };
  const dailyAverage = forecastValue("dailyAverage") ?? metric("weekIssued") / 5;
  const weekForecast = forecastValue("weekForecast") ?? metric("weekIssued");
  return <><section className="metric-grid"><MetricCard label="当前库存" value={formatNumber(metric("inventory"))} note={`${line === "ALL" ? "两条数据线合计" : line}`} tone="blue" /><MetricCard label="日均消耗" value={formatNumber(dailyAverage)} note="近5个工作日首次发放" tone="indigo" /><MetricCard label="本周预计消耗" value={formatNumber(weekForecast)} note="不含双标、质检与重发" tone="teal" /><MetricCard label="预计可支撑" value={metric("supportDays").toFixed(1)} suffix=" 天" note="全部视图取两条线中的短板" tone="amber" /></section><section className="dashboard-grid two-one"><article className="panel"><SectionTitle eyebrow="库存趋势" title={line === "ALL" ? "SFT / RL 期末库存" : `${line} 期末库存`} note="新数据到达会形成向上跳点" /><div className="inventory-chart">{trend.map((day) => <div className="inventory-day" key={day.date}><div>{line !== "RL" && <i className="sft" title={`SFT ${day.sftInventory}`} style={{ height: `${(day.sftInventory/maxInventory)*100}%` }} />}{line !== "SFT" && <i className="rl" title={`RL ${day.rlInventory}`} style={{ height: `${(day.rlInventory/maxInventory)*100}%` }} />}</div><small>{day.date}</small></div>)}</div><div className="chart-legend">{line !== "RL" && <span><i className="sft"/>SFT</span>}{line !== "SFT" && <span><i className="rl"/>RL</span>}</div></article><article className="panel"><SectionTitle eyebrow="情景预测" title="本周末库存" /><div className="scenario-list"><div><span>低消耗</span><b>{formatNumber(metric("inventory")-weekForecast*.8)}</b><i style={{ width: "80%" }}/></div><div className="base"><span>常规</span><b>{formatNumber(metric("inventory")-weekForecast)}</b><i style={{ width: "62%" }}/></div><div><span>高消耗</span><b>{formatNumber(Math.max(0,metric("inventory")-weekForecast*1.2))}</b><i style={{ width: "42%" }}/></div></div></article></section><article className="panel"><SectionTitle eyebrow="原始批次" title="批次消耗与结余" /><div className="batch-grid">{data.map((batch) => <button type="button" key={batch.id} onClick={() => setDrawer({ eyebrow: `${batch.line} · ${batch.status}`, title: batch.id, metric: `剩余 ${formatNumber(batch.remaining)}`, body: `收到 ${formatNumber(batch.received)}，累计首次发放 ${formatNumber(batch.used)}，适用规则 ${batch.version}。` })}><div><span>{batch.line}</span><b>{batch.status}</b></div><strong>{batch.id}</strong><div className="batch-progress"><i style={{ width: `${percent(batch.used, batch.received)}%` }} /></div><p><span>已用 {formatNumber(batch.used)}</span><span>剩余 {formatNumber(batch.remaining)}</span></p></button>)}</div></article></>;
}

function VersionsBoard({ data, setDrawer }: { data: typeof ruleVersions; setDrawer: (drawer: DrawerContent) => void }) {
  return <><section className="version-hero"><span>版本边界保护</span><h2>规则变了，比较口径也要一起变</h2><p>网站默认禁止跨不可比版本计算人效升降幅，避免把规则复杂度误判为团队表现变化。</p></section><section className="timeline">{data.map((rule,index) => <button key={`${rule.line}-${rule.version}-${index}`} type="button" onClick={() => setDrawer({ eyebrow: `${rule.line} · ${rule.status}`, title: `${rule.line} ${rule.version}`, metric: `${rule.start} — ${rule.end}`, body: `${rule.change}。${rule.comparable ? "可与上一作业批次比较。" : "不可与上一版本直接比较人效和质量。"}` })}><i>{index+1}</i><div><span>{rule.line}</span><strong>{rule.version}</strong><small>{rule.start} — {rule.end}</small></div><p>{rule.change}</p><b className={rule.comparable ? "ok" : "blocked"}>{rule.comparable ? "可比较" : "不可直接比较"}</b></button>)}</section><article className="panel"><SectionTitle eyebrow="版本对比守则" title="系统如何防止误判" /><div className="guardrails"><div><b>01</b><strong>先分数据线</strong><p>SFT 与 RL 的库存、完成和质量指标永不直接合并比较。</p></div><div><b>02</b><strong>再分规则版本</strong><p>规则变化后创建新作业批次，历史数据冻结保留。</p></div><div><b>03</b><strong>只在同口径下排名</strong><p>跨版本只展示绝对量，不默认展示增降幅。</p></div></div></article></>;
}
