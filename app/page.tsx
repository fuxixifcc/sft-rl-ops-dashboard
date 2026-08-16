"use client";

import { useMemo, useRef, useState } from "react";
import {
  alerts,
  batches,
  incompleteReasons,
  lineMetrics,
  people,
  qualityPools,
  ruleVersions,
  workdayTrend,
  type DataLine,
  type LineFilter,
  type ViewKey,
} from "./dashboard-data";

const navItems: { key: ViewKey; label: string; kicker: string }[] = [
  { key: "overview", label: "运营总览", kicker: "总览" },
  { key: "returns", label: "回收分析", kicker: "流转" },
  { key: "quality", label: "质检分析", kicker: "质量" },
  { key: "people", label: "人员负载", kicker: "人效" },
  { key: "inventory", label: "库存预测", kicker: "供给" },
  { key: "versions", label: "规则版本", kicker: "版本" },
];

type DrawerContent = { title: string; eyebrow: string; body: string; metric?: string } | null;
type ImportSnapshot = { files: number; rows: number; tables: string[]; inventory: Partial<Record<DataLine, number>>; qcPending: Partial<Record<DataLine, number>>; returnIncomplete: Partial<Record<DataLine, number>> };

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value);
}

function combineMetric(key: keyof typeof lineMetrics.SFT) {
  const left = lineMetrics.SFT[key];
  const right = lineMetrics.RL[key];
  if (key === "supportDays") return Math.min(left, right);
  if (["doubleRate", "consistencyRate", "qcPassRate"].includes(key)) return (left + right) / 2;
  return left + right;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); }
  return rows;
}

function toNumber(value = "") {
  const parsed = Number(value.replace(/[%千,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
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

function MiniBars({ values, color = "teal", labels }: { values: number[]; color?: string; labels?: string[] }) {
  const max = Math.max(...values, 1);
  return <div className="mini-bars">{values.map((value, index) => <div key={`${value}-${index}`} className="mini-bar-wrap" title={`${labels?.[index] ?? index + 1}: ${formatNumber(value)}`}><i className={`bar-${color}`} style={{ height: `${Math.max(8, (value / max) * 100)}%` }} /><small>{labels?.[index]}</small></div>)}</div>;
}

export default function Home() {
  const [view, setView] = useState<ViewKey>("overview");
  const [line, setLine] = useState<LineFilter>("ALL");
  const [period, setPeriod] = useState("本周");
  const [activePool, setActivePool] = useState("全部抽检池");
  const [drawer, setDrawer] = useState<DrawerContent>(null);
  const [imported, setImported] = useState<ImportSnapshot | null>(null);
  const [toast, setToast] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const metric = (key: keyof typeof lineMetrics.SFT) => {
    if (line === "ALL") return combineMetric(key);
    if (key === "inventory" && imported?.inventory[line] !== undefined) return imported.inventory[line]!;
    if (key === "qcPending" && imported?.qcPending[line] !== undefined) return imported.qcPending[line]!;
    if (key === "returnIncomplete" && imported?.returnIncomplete[line] !== undefined) return imported.returnIncomplete[line]!;
    return lineMetrics[line][key];
  };

  const filteredPools = useMemo(() => qualityPools.filter((pool) => (line === "ALL" || pool.line === line) && (activePool === "全部抽检池" || pool.pool === activePool)), [line, activePool]);
  const filteredPeople = useMemo(() => people.filter((person) => line === "ALL" || person.line === line), [line]);
  const filteredBatches = useMemo(() => batches.filter((batch) => line === "ALL" || batch.line === line), [line]);
  const filteredRules = useMemo(() => ruleVersions.filter((rule) => line === "ALL" || rule.line === line), [line]);

  async function handleCsvImport(files: FileList | null) {
    if (!files?.length) return;
    const snapshot: ImportSnapshot = { files: files.length, rows: 0, tables: [], inventory: {}, qcPending: {}, returnIncomplete: {} };
    for (const file of Array.from(files)) {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) continue;
      const headers = rows[0];
      const records = rows.slice(1);
      snapshot.rows += records.length;
      snapshot.tables.push(file.name.replace(/\.csv$/i, ""));
      const lineIndex = headers.findIndex((header) => header.includes("数据线"));
      const inventoryIndex = headers.findIndex((header) => header.includes("当前剩余量") || header.includes("期末库存"));
      const pendingIndex = headers.findIndex((header) => header.includes("待质检数量"));
      const incompleteIndex = headers.findIndex((header) => header.includes("其中未完成量") || header.includes("回收未完成"));
      for (const record of records) {
        const dataLine = record[lineIndex] as DataLine;
        if (dataLine !== "SFT" && dataLine !== "RL") continue;
        if (inventoryIndex >= 0) snapshot.inventory[dataLine] = toNumber(record[inventoryIndex]);
        if (pendingIndex >= 0) snapshot.qcPending[dataLine] = (snapshot.qcPending[dataLine] ?? 0) + toNumber(record[pendingIndex]);
        if (incompleteIndex >= 0) snapshot.returnIncomplete[dataLine] = (snapshot.returnIncomplete[dataLine] ?? 0) + toNumber(record[incompleteIndex]);
      }
    }
    setImported(snapshot);
    setToast(`已在本机浏览器解析 ${snapshot.files} 个 CSV，共 ${snapshot.rows} 条记录`);
    window.setTimeout(() => setToast(""), 4200);
  }

  function openAlert(index: number) {
    const alert = alerts[index];
    setDrawer({ eyebrow: alert.level === "high" ? "高优先级" : "运营提醒", title: alert.title, body: alert.detail, metric: alert.action });
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">OP</span><div><strong>运营分析台</strong><small>SFT / RL</small></div></div>
        <nav aria-label="主导航">
          {navItems.map((item) => <button className={view === item.key ? "active" : ""} key={item.key} onClick={() => setView(item.key)} type="button"><small>{item.kicker}</small><span>{item.label}</span></button>)}
        </nav>
        <div className="sidebar-status"><span /><div><strong>{imported ? "本地数据已载入" : "虚构演示数据"}</strong><small>{imported ? `${imported.rows} 条记录，仅保存在内存` : "不包含任何公司真实数据"}</small></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">OPERATIONS INTELLIGENCE</p><h1>{navItems.find((item) => item.key === view)?.label}</h1><p className="subtitle">把发放、回收、双标、质检和库存放进同一条可追溯的运营链路。</p></div>
          <div className="header-actions">
            <div className="period-switch">{["本周", "近30天"].map((item) => <button className={period === item ? "active" : ""} key={item} type="button" onClick={() => setPeriod(item)}>{item}</button>)}</div>
            <input ref={fileInput} hidden multiple accept=".csv,text/csv" type="file" onChange={(event) => handleCsvImport(event.target.files)} />
            <button className="import-button" type="button" onClick={() => fileInput.current?.click()}>导入 CSV 包</button>
          </div>
        </header>

        <section className="control-deck">
          <div className="line-switch"><button className={line === "ALL" ? "active" : ""} onClick={() => setLine("ALL")} type="button">全部</button><button className={line === "SFT" ? "active sft" : ""} onClick={() => setLine("SFT")} type="button">SFT</button><button className={line === "RL" ? "active rl" : ""} onClick={() => setLine("RL")} type="button">RL</button></div>
          <span>截至 2026-08-14</span><span>规则版本：全部</span><span>作业批次：全部</span>
          {imported && <button className="reset-data" type="button" onClick={() => setImported(null)}>恢复演示数据</button>}
        </section>

        {view === "overview" && <Overview metric={metric} line={line} setView={setView} openAlert={openAlert} />}
        {view === "returns" && <Returns metric={metric} line={line} setDrawer={setDrawer} />}
        {view === "quality" && <Quality pools={filteredPools} activePool={activePool} setActivePool={setActivePool} setDrawer={setDrawer} />}
        {view === "people" && <PeopleBoard data={filteredPeople} setDrawer={setDrawer} />}
        {view === "inventory" && <InventoryBoard data={filteredBatches} line={line} metric={metric} setDrawer={setDrawer} />}
        {view === "versions" && <VersionsBoard data={filteredRules} setDrawer={setDrawer} />}

        <div className="local-data-note"><b>数据安全：</b> CSV 在浏览器内存中解析，不会上传或保存。正式上线前仍需公司信息安全审批。</div>
      </section>

      {drawer && <div className="drawer-backdrop" onClick={() => setDrawer(null)}><aside className="detail-drawer" onClick={(event) => event.stopPropagation()}><button className="drawer-close" type="button" onClick={() => setDrawer(null)}>×</button><span>{drawer.eyebrow}</span><h2>{drawer.title}</h2>{drawer.metric && <strong>{drawer.metric}</strong>}<p>{drawer.body}</p><div className="drawer-steps"><b>建议下一步</b><ol><li>按数据线和作业批次确认来源</li><li>下钻到发放单或质检方案</li><li>记录处理人、截止时间和关闭结果</li></ol></div></aside></div>}
      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}

function Overview({ metric, line, setView, openAlert }: { metric: (key: keyof typeof lineMetrics.SFT) => number; line: LineFilter; setView: (view: ViewKey) => void; openAlert: (index: number) => void }) {
  const flow = [
    { label: "首次发放", value: metric("weekIssued"), pct: 100 },
    { label: "已回收", value: metric("returned"), pct: (metric("returned") / metric("weekIssued")) * 100 },
    { label: "已完成", value: metric("completed"), pct: (metric("completed") / metric("weekIssued")) * 100 },
    { label: "已抽检", value: metric("qcSelected"), pct: (metric("qcSelected") / metric("weekIssued")) * 100 },
    { label: "质检完成", value: metric("qcCompleted"), pct: (metric("qcCompleted") / metric("weekIssued")) * 100 },
  ];
  return <>
    <section className="metric-grid">
      <MetricCard label="当前可用库存" value={formatNumber(metric("inventory"))} note={`预计支撑 ${metric("supportDays").toFixed(1)} 个工作日`} tone="blue" onClick={() => setView("inventory")} />
      <MetricCard label="本周首次发放" value={formatNumber(metric("weekIssued"))} note={`今日发放 ${formatNumber(metric("todayIssued"))}，不含双标`} tone="indigo" onClick={() => setView("returns")} />
      <MetricCard label="回收未完成" value={formatNumber(metric("returnIncomplete"))} note="需要进入重发、转派或关闭" tone="amber" onClick={() => setView("returns")} />
      <MetricCard label="待质检" value={formatNumber(metric("qcPending"))} note={`质检完成率 ${((metric("qcCompleted") / metric("qcSelected")) * 100).toFixed(1)}%`} tone="rose" onClick={() => setView("quality")} />
    </section>
    <section className="dashboard-grid two-one">
      <article className="panel flow-panel"><SectionTitle eyebrow="本周流转" title="从发放到质检完成" note={`${line === "ALL" ? "SFT + RL" : line} · 唯一题目口径`} /><div className="funnel-list">{flow.map((item) => <div className="funnel-row" key={item.label}><span>{item.label}</span><div className="bar-track"><i style={{ width: `${Math.max(5, item.pct)}%` }} /></div><strong>{formatNumber(item.value)}</strong><small>{item.pct.toFixed(1)}%</small></div>)}</div></article>
      <article className="panel"><SectionTitle eyebrow="立即处理" title="异常与积压" extra={<span className="text-badge">4 条</span>} /><ul className="alert-list">{alerts.map((alert, index) => <li key={alert.id} onClick={() => openAlert(index)}><i className={alert.level} /><div><strong>{alert.title}</strong><span>{alert.detail}</span></div><b>→</b></li>)}</ul></article>
    </section>
    <section className="dashboard-grid equal">
      <article className="panel"><SectionTitle eyebrow="日趋势" title="发放、回收与完成" note="悬停柱形查看每日数量" /><div className="triple-chart">{workdayTrend.map((day) => { const max = 2200; return <div className="triple-day" key={day.date}><div className="triple-bars"><i className="issued" style={{ height: `${(day.issued / max) * 100}%` }} title={`发放 ${day.issued}`} /><i className="returned" style={{ height: `${(day.returned / max) * 100}%` }} title={`回收 ${day.returned}`} /><i className="done" style={{ height: `${(day.completed / max) * 100}%` }} title={`完成 ${day.completed}`} /></div><small>{day.date}</small></div>})}</div><div className="chart-legend"><span><i className="issued"/>发放</span><span><i className="returned"/>回收</span><span><i className="done"/>完成</span></div></article>
      <article className="panel"><SectionTitle eyebrow="质量脉搏" title="双标与质检" /><div className="quality-rings"><div className="ring" style={{ "--value": `${metric("consistencyRate") * 3.6}deg` } as React.CSSProperties}><b>{metric("consistencyRate").toFixed(1)}%</b><span>双标一致率</span></div><div className="ring rose" style={{ "--value": `${metric("qcPassRate") * 3.6}deg` } as React.CSSProperties}><b>{metric("qcPassRate").toFixed(1)}%</b><span>质检通过率</span></div></div><button className="panel-action" type="button" onClick={() => setView("quality")}>查看三个抽检池 →</button></article>
    </section>
  </>;
}

function Returns({ metric, line, setDrawer }: { metric: (key: keyof typeof lineMetrics.SFT) => number; line: LineFilter; setDrawer: (drawer: DrawerContent) => void }) {
  const issued = metric("weekIssued");
  const returned = metric("returned");
  const completed = metric("completed");
  return <>
    <section className="metric-grid"><MetricCard label="首次回收率" value={((returned / issued) * 100).toFixed(1)} suffix="%" note="回收量 ÷ 首次发放量" tone="teal" /><MetricCard label="完成率" value={((completed / issued) * 100).toFixed(1)} suffix="%" note="完成量 ÷ 首次发放量" tone="blue" /><MetricCard label="回收未完成" value={formatNumber(metric("returnIncomplete"))} note="已提交但内容尚未完成" tone="amber" /><MetricCard label="待返工" value={formatNumber(metric("rework"))} note="质检不通过后需要重做" tone="rose" /></section>
    <section className="dashboard-grid two-one"><article className="panel"><SectionTitle eyebrow="发放 COHORT" title="按发放日观察回收成熟度" note={`${line === "ALL" ? "全部数据线" : line} · 颜色越深代表完成率越高`} /><div className="cohort"><div className="cohort-head"><span>发放日</span>{["D0","D1","D2","D3","D4"].map((item) => <b key={item}>{item}</b>)}</div>{workdayTrend.map((day, row) => <div className="cohort-row" key={day.date}><span>{day.date}</span>{[42,68,81,91,96].map((value, col) => { const adjusted = Math.min(100, value + row * 2 - col * 2); return <i key={col} title={`${day.date} ${col}天后完成率 ${adjusted}%`} style={{ opacity: adjusted / 100 }}>{adjusted}%</i>})}</div>)}</div></article><article className="panel"><SectionTitle eyebrow="未完成原因" title="需要优先改善什么" /><div className="reason-bars">{incompleteReasons.map((reason, index) => <button key={reason.label} type="button" onClick={() => setDrawer({ eyebrow: "未完成原因", title: reason.label, metric: `${reason.value} 题`, body: "建议按规则版本、人员和发放单继续下钻，确认是规则问题、任务难度还是排期问题。" })}><span>{index + 1}. {reason.label}</span><div><i style={{ width: `${(reason.value / incompleteReasons[0].value) * 100}%` }} /></div><b>{reason.value}</b></button>)}</div></article></section>
    <article className="panel table-panel"><SectionTitle eyebrow="需要跟进" title="未回收与回收未完成任务" extra={<button className="text-button" type="button" onClick={() => setDrawer({ eyebrow: "导出说明", title: "跟进清单", metric: "4 条待跟进", body: "正式接入公司数据后，可按当前筛选条件导出 CSV，用于分配重发、转派和关闭负责人。" })}>导出跟进清单</button>} /><div className="data-table"><div className="table-row header"><span>分配ID</span><span>人员</span><span>数据线</span><span>分配</span><span>回收</span><span>完成</span><span>状态</span></div>{[["ASN-005","标注员A","SFT",400,360,360,"未回收"],["ASN-006","标注员B","SFT",400,400,370,"回收未完成"],["ASN-021","标注员E","SFT",476,476,456,"回收未完成"],["ASN-024","标注员F","RL",287,287,264,"回收未完成"]].map((row) => <button className="table-row" key={row[0]} type="button" onClick={() => setDrawer({ eyebrow: "任务明细", title: String(row[0]), metric: String(row[6]), body: `${row[1]} · ${row[2]} · 分配 ${row[3]} / 回收 ${row[4]} / 完成 ${row[5]}` })}>{row.map((cell, index) => <span className={index === 6 ? "status-pill warn" : ""} key={index}>{cell}</span>)}</button>)}</div></article>
  </>;
}

function Quality({ pools, activePool, setActivePool, setDrawer }: { pools: typeof qualityPools; activePool: string; setActivePool: (pool: string) => void; setDrawer: (drawer: DrawerContent) => void }) {
  const totalSelected = pools.reduce((sum, pool) => sum + pool.selected, 0);
  const totalCompleted = pools.reduce((sum, pool) => sum + pool.completed, 0);
  const totalPass = pools.reduce((sum, pool) => sum + pool.passed, 0);
  return <>
    <section className="metric-grid"><MetricCard label="实际抽取量" value={formatNumber(totalSelected)} note="三个抽检池加权汇总" tone="indigo" /><MetricCard label="质检完成率" value={((totalCompleted / totalSelected) * 100).toFixed(1)} suffix="%" note="完成量 ÷ 实际抽取量" tone="teal" /><MetricCard label="质检通过率" value={((totalPass / totalCompleted) * 100).toFixed(1)} suffix="%" note="通过量 ÷ 已质检量" tone="blue" /><MetricCard label="待质检" value={formatNumber(totalSelected - totalCompleted)} note="已抽中但尚未完成" tone="rose" /></section>
    <div className="pool-tabs">{["全部抽检池","双标一致","双标不一致","未双标"].map((pool) => <button className={activePool === pool ? "active" : ""} key={pool} onClick={() => setActivePool(pool)} type="button">{pool}</button>)}</div>
    <section className="pool-grid">{pools.map((pool) => { const completion = pool.selected ? (pool.completed / pool.selected) * 100 : 0; return <button className={`pool-card pool-${pool.pool}`} key={`${pool.line}-${pool.pool}`} type="button" onClick={() => setDrawer({ eyebrow: `${pool.line} · ${pool.pool}`, title: "质检方案明细", metric: `待质检 ${pool.selected - pool.completed}`, body: `池内 ${pool.eligible} 题，计划 ${pool.plannedRate}% / 实际 ${pool.actualRate}%，通过 ${pool.passed}、不通过 ${pool.failed}、存疑 ${pool.disputed}。` })}><div className="pool-head"><span>{pool.line}</span><strong>{pool.pool}</strong><i>{pool.selected - pool.completed} 待处理</i></div><div className="pool-numbers"><div><small>池内可抽</small><b>{pool.eligible}</b></div><div><small>计划 / 实际</small><b>{pool.plannedRate}% / {pool.actualRate}%</b></div><div><small>已完成</small><b>{pool.completed}</b></div></div><div className="progress"><i style={{ width: `${completion}%` }} /></div><div className="stacked-quality"><i className="pass" style={{ width: `${(pool.passed / Math.max(pool.completed,1))*100}%` }} /><i className="fail" style={{ width: `${(pool.failed / Math.max(pool.completed,1))*100}%` }} /><i className="dispute" style={{ width: `${(pool.disputed / Math.max(pool.completed,1))*100}%` }} /></div></button>})}</section>
    <article className="panel quality-compare"><SectionTitle eyebrow="比例校准" title="计划比例 vs 实际比例" note="不直接平均三个池子的百分比" /><div className="compare-list">{pools.map((pool) => <div key={`${pool.line}-${pool.pool}`}><span>{pool.line} · {pool.pool}</span><div className="dual-bar"><i className="planned" style={{ width: `${Math.min(100,pool.plannedRate)}%` }} /><i className="actual" style={{ width: `${Math.min(100,pool.actualRate)}%` }} /></div><b>{pool.plannedRate}% / {pool.actualRate}%</b></div>)}</div></article>
  </>;
}

function PeopleBoard({ data, setDrawer }: { data: typeof people; setDrawer: (drawer: DrawerContent) => void }) {
  return <><section className="metric-grid"><MetricCard label="今日参与人员" value={String(data.length)} note="标注与质检人员合计" tone="teal" /><MetricCard label="累计分配" value={formatNumber(data.reduce((sum, person) => sum + person.assigned, 0))} note="包含双标和返工工作量" tone="indigo" /><MetricCard label="累计完成" value={formatNumber(data.reduce((sum, person) => sum + person.completed, 0))} note="人员任务口径" tone="blue" /><MetricCard label="人员待完成" value={formatNumber(data.reduce((sum, person) => sum + person.pending, 0))} note="需要结合截止时间处理" tone="amber" /></section><section className="dashboard-grid equal"><article className="panel"><SectionTitle eyebrow="人员负载" title="分配与完成对比" /><div className="people-bars">{data.map((person) => <button key={person.name} type="button" onClick={() => setDrawer({ eyebrow: `${person.line} · ${person.role}`, title: person.name, metric: `完成率 ${((person.completed/person.assigned)*100).toFixed(1)}%`, body: `分配 ${person.assigned}、完成 ${person.completed}、待完成 ${person.pending}，当前质量得分 ${person.quality}%。` })}><div><strong>{person.name}</strong><small>{person.line} · {person.role}</small></div><div className="person-progress"><i style={{ width: `${(person.completed/person.assigned)*100}%` }} /></div><span>{person.completed}/{person.assigned}</span></button>)}</div></article><article className="panel"><SectionTitle eyebrow="工作节奏" title="近5个工作日热力图" note="颜色越深代表当日负载越高" /><div className="heatmap"><div className="heat-head"><span>人员</span>{workdayTrend.map((day) => <b key={day.date}>{day.date}</b>)}</div>{data.map((person) => <div className="heat-row" key={person.name}><span>{person.name}</span>{person.days.map((value,index) => <i key={index} title={`${person.name} ${workdayTrend[index].date} 负载 ${value}%`} style={{ opacity: Math.max(.16,value/100) }}>{value}</i>)}</div>)}</div></article></section></>;
}

function InventoryBoard({ data, line, metric, setDrawer }: { data: typeof batches; line: LineFilter; metric: (key: keyof typeof lineMetrics.SFT) => number; setDrawer: (drawer: DrawerContent) => void }) {
  const maxInventory = Math.max(...workdayTrend.flatMap((day) => [day.sftInventory, day.rlInventory]));
  return <><section className="metric-grid"><MetricCard label="当前库存" value={formatNumber(metric("inventory"))} note={`${line === "ALL" ? "两条数据线合计" : line}`} tone="blue" /><MetricCard label="日均消耗" value={formatNumber(metric("weekIssued")/5)} note="近5个工作日首次发放" tone="indigo" /><MetricCard label="本周预计消耗" value={formatNumber(metric("weekIssued"))} note="不含双标、质检与重发" tone="teal" /><MetricCard label="预计可支撑" value={metric("supportDays").toFixed(1)} suffix=" 天" note="低于5天触发高风险" tone="amber" /></section><section className="dashboard-grid two-one"><article className="panel"><SectionTitle eyebrow="库存趋势" title="SFT / RL 期末库存" note="新数据到达会形成向上跳点" /><div className="inventory-chart">{workdayTrend.map((day) => <div className="inventory-day" key={day.date}><div><i className="sft" title={`SFT ${day.sftInventory}`} style={{ height: `${(day.sftInventory/maxInventory)*100}%` }} /><i className="rl" title={`RL ${day.rlInventory}`} style={{ height: `${(day.rlInventory/maxInventory)*100}%` }} /></div><small>{day.date}</small></div>)}</div><div className="chart-legend"><span><i className="sft"/>SFT</span><span><i className="rl"/>RL</span></div></article><article className="panel"><SectionTitle eyebrow="情景预测" title="本周末库存" /><div className="scenario-list"><div><span>低消耗</span><b>{formatNumber(metric("inventory")-metric("weekIssued")*.8)}</b><i style={{ width: "80%" }}/></div><div className="base"><span>常规</span><b>{formatNumber(metric("inventory")-metric("weekIssued"))}</b><i style={{ width: "62%" }}/></div><div><span>高消耗</span><b>{formatNumber(Math.max(0,metric("inventory")-metric("weekIssued")*1.2))}</b><i style={{ width: "42%" }}/></div></div></article></section><article className="panel"><SectionTitle eyebrow="原始批次" title="批次消耗与结余" /><div className="batch-grid">{data.map((batch) => <button type="button" key={batch.id} onClick={() => setDrawer({ eyebrow: `${batch.line} · ${batch.status}`, title: batch.id, metric: `剩余 ${formatNumber(batch.remaining)}`, body: `收到 ${formatNumber(batch.received)}，累计首次发放 ${formatNumber(batch.used)}，适用规则 ${batch.version}。` })}><div><span>{batch.line}</span><b>{batch.status}</b></div><strong>{batch.id}</strong><div className="batch-progress"><i style={{ width: `${(batch.used/batch.received)*100}%` }} /></div><p><span>已用 {formatNumber(batch.used)}</span><span>剩余 {formatNumber(batch.remaining)}</span></p></button>)}</div></article></>;
}

function VersionsBoard({ data, setDrawer }: { data: typeof ruleVersions; setDrawer: (drawer: DrawerContent) => void }) {
  return <><section className="version-hero"><span>版本边界保护</span><h2>规则变了，比较口径也要一起变</h2><p>网站默认禁止跨不可比版本计算人效升降幅，避免把规则复杂度误判为团队表现变化。</p></section><section className="timeline">{data.map((rule,index) => <button key={`${rule.line}-${rule.version}`} type="button" onClick={() => setDrawer({ eyebrow: `${rule.line} · ${rule.status}`, title: `${rule.line} ${rule.version}`, metric: `${rule.start} — ${rule.end}`, body: `${rule.change}。${rule.comparable ? "可与上一作业批次比较。" : "不可与上一版本直接比较人效和质量。"}` })}><i>{index+1}</i><div><span>{rule.line}</span><strong>{rule.version}</strong><small>{rule.start} — {rule.end}</small></div><p>{rule.change}</p><b className={rule.comparable ? "ok" : "blocked"}>{rule.comparable ? "可比较" : "不可直接比较"}</b></button>)}</section><article className="panel"><SectionTitle eyebrow="版本对比守则" title="系统如何防止误判" /><div className="guardrails"><div><b>01</b><strong>先分数据线</strong><p>SFT 与 RL 的库存、完成和质量指标永不直接合并比较。</p></div><div><b>02</b><strong>再分规则版本</strong><p>规则变化后创建新作业批次，历史数据冻结保留。</p></div><div><b>03</b><strong>只在同口径下排名</strong><p>跨版本只展示绝对量，不默认展示增降幅。</p></div></div></article></>;
}
