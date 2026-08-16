import type { DataLine, LineMetric } from "./dashboard-data";

export type CsvInput = { name: string; text: string };

export type ImportedTrendPoint = {
  date: string;
  sftInventory: number;
  rlInventory: number;
  issued: number;
  returned: number;
  completed: number;
  byLine?: Record<DataLine, { issued: number; returned: number; completed: number; hasData?: boolean }>;
};

export type ImportedRateWeights = {
  doubleEligible: number;
  consistencyResolved: number;
};

export type ImportedQualityPool = {
  line: DataLine;
  pool: string;
  eligible: number;
  plannedRate: number;
  actualRate: number;
  selected: number;
  completed: number;
  passed: number;
  failed: number;
  disputed: number;
};

export type ImportedBatch = {
  id: string;
  line: DataLine;
  received: number;
  used: number;
  remaining: number;
  version: string;
  status: string;
};

export type ImportedForecast = {
  dailyAverage?: number;
  weekForecast?: number;
  risk?: string;
};

export type ImportedPerson = {
  name: string;
  line: DataLine;
  role: string;
  assigned: number;
  completed: number;
  pending: number;
  quality: number;
  days: number[];
  dayDates?: string[];
};

export type ImportedRuleVersion = {
  line: DataLine;
  version: string;
  start: string;
  end: string;
  status: string;
  comparable: boolean;
  change: string;
};

export type ImportedFollowup = {
  id: string;
  person: string;
  line: DataLine;
  assigned: number;
  returned: number;
  completed: number;
  status: string;
};

export type ImportedReturnCohort = {
  line: DataLine;
  date: string;
  values: Array<number | null>;
};

export type ImportedIncompleteReason = {
  line: DataLine;
  label: string;
  value: number;
};

export type ImportedDashboardModel = {
  report: {
    files: number;
    rows: number;
    tables: string[];
    unknownFiles: string[];
    warnings: string[];
    reportDate?: string;
    futureRows: number;
  };
  metrics: Record<DataLine, Partial<LineMetric>>;
  rateWeights: Record<DataLine, ImportedRateWeights>;
  weeklyQuality: Record<DataLine, { selected: number; completed: number }>;
  forecast: Record<DataLine, ImportedForecast>;
  workdayTrend?: ImportedTrendPoint[];
  qualityPools?: ImportedQualityPool[];
  batches?: ImportedBatch[];
  people?: ImportedPerson[];
  ruleVersions?: ImportedRuleVersion[];
  followups?: ImportedFollowup[];
  returnCohort?: ImportedReturnCohort[];
  incompleteReasons?: ImportedIncompleteReason[];
};

type RecordRow = Record<string, string>;
type TableKey =
  | "数据批次"
  | "作业批次"
  | "发放记录"
  | "标注分配"
  | "回收记录"
  | "双标结果"
  | "质检方案"
  | "质检分配"
  | "异动记录"
  | "每日库存"
  | "规则版本";

const LINES: DataLine[] = ["SFT", "RL"];
const SCHEMAS: Array<{ key: TableKey; id: string[]; required: string[] }> = [
  { key: "数据批次", id: ["原始批次ID"], required: ["原始批次ID", "数据线", "当前剩余量"] },
  { key: "作业批次", id: ["作业批次ID"], required: ["作业批次ID", "数据线", "原始批次ID", "计划作业量"] },
  { key: "发放记录", id: ["发放单ID"], required: ["发放单ID", "日期", "数据线", "发放性质", "库存扣减量"] },
  { key: "标注分配", id: ["分配ID"], required: ["分配ID", "发放单ID", "数据线", "人员", "分配任务量", "开始日期"] },
  { key: "回收记录", id: ["回收记录ID"], required: ["回收记录ID", "回收日期", "分配ID", "发放单ID", "数据线", "人员", "回收类型", "本次回收量", "其中完成量", "其中未完成量"] },
  { key: "双标结果", id: ["双标结果ID"], required: ["双标结果ID", "发放单ID", "数据线", "已完成唯一题目", "形成结果的双标量", "双标一致", "双标不一致"] },
  { key: "质检方案", id: ["质检方案ID"], required: ["质检方案ID", "制定日期", "数据线", "抽检池", "池内可抽数量", "计划抽取量", "实际抽取量"] },
  { key: "质检分配", id: ["质检分配ID"], required: ["质检分配ID", "质检方案ID", "数据线", "质检人员", "分配量", "完成量", "通过", "不通过", "存疑", "完成日期"] },
  { key: "异动记录", id: ["异动ID"], required: ["异动ID", "日期", "数据线", "来源分配ID", "异动类型"] },
  { key: "每日库存", id: ["日期", "数据线"], required: ["日期", "数据线", "期末库存", "预计支撑天数"] },
  { key: "规则版本", id: ["规则版本ID"], required: ["规则版本ID", "数据线", "规则类型", "版本号"] },
];

const NUMERIC_FIELDS: Partial<Record<TableKey, string[]>> = {
  数据批次: ["当前剩余量"],
  作业批次: ["计划作业量"],
  发放记录: ["库存扣减量"],
  标注分配: ["分配任务量"],
  回收记录: ["本次回收量", "其中完成量", "其中未完成量"],
  双标结果: ["已完成唯一题目", "形成结果的双标量", "双标一致", "双标不一致"],
  质检方案: ["池内可抽数量", "计划抽取量", "实际抽取量"],
  质检分配: ["分配量", "完成量", "通过", "不通过", "存疑"],
  每日库存: ["期末库存", "预计支撑天数"],
};

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}

function toNumber(value = "") {
  const normalized = value.replace(/[,%千，]/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isNumeric(value = "") {
  const normalized = value.replace(/[,%千，]/g, "").trim();
  return normalized !== "" && Number.isFinite(Number(normalized));
}

function dateKey(value?: string) {
  if (!value) return undefined;
  const simple = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (simple) {
    const year = Number(simple[1]);
    const month = Number(simple[2]);
    const day = Number(simple[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return undefined;
    return `${simple[1]}-${simple[2].padStart(2, "0")}-${simple[3].padStart(2, "0")}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shortDate(value: string) {
  return value.slice(5);
}

function weekStart(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function findTable(rows: string[][]) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 12); rowIndex += 1) {
    const headers = rows[rowIndex].map((value) => value.trim());
    const schema = SCHEMAS.find((candidate) => candidate.required.every((field) => headers.includes(field)));
    if (!schema) continue;
    const records = rows.slice(rowIndex + 1).filter((row) => row.some(Boolean)).map((row) =>
      Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ""])),
    );
    return { key: schema.key, id: schema.id, records };
  }
  return null;
}

function latestDate(records: RecordRow[], field: string) {
  return records.map((record) => dateKey(record[field])).filter((value): value is string => Boolean(value)).sort().at(-1);
}

function sum(records: RecordRow[], field: string) {
  return records.reduce((total, record) => total + toNumber(record[field]), 0);
}

function percentValue(numerator: number, denominator: number) {
  return denominator ? (numerator / denominator) * 100 : 0;
}

function lineRows(records: RecordRow[], line: DataLine) {
  return records.filter((record) => record["数据线"] === line);
}

function rowsThrough(records: RecordRow[], field: string, reportDate?: string) {
  return records.filter((record) => {
    const date = dateKey(record[field]);
    if (record[field] && !date) return false;
    return !reportDate || !date || date <= reportDate;
  });
}

const EMPTY_LINE_METRIC: LineMetric = {
  inventory: 0,
  supportDays: 0,
  todayIssued: 0,
  weekIssued: 0,
  returned: 0,
  completed: 0,
  returnIncomplete: 0,
  doubleRate: 0,
  consistencyRate: 0,
  qcSelected: 0,
  qcCompleted: 0,
  qcPending: 0,
  qcPassRate: 0,
  rework: 0,
};

export function combineLineMetric(
  key: keyof LineMetric,
  metricsByLine: Record<DataLine, LineMetric>,
  rateWeights?: Record<DataLine, ImportedRateWeights>,
) {
  const left = metricsByLine.SFT;
  const right = metricsByLine.RL;
  if (key === "supportDays") return Math.min(left.supportDays, right.supportDays);
  if (key === "doubleRate") {
    const leftWeight = rateWeights?.SFT.doubleEligible ?? left.weekIssued;
    const rightWeight = rateWeights?.RL.doubleEligible ?? right.weekIssued;
    const denominator = leftWeight + rightWeight;
    return denominator ? (left.doubleRate * leftWeight + right.doubleRate * rightWeight) / denominator : 0;
  }
  if (key === "consistencyRate") {
    const leftWeight = rateWeights?.SFT.consistencyResolved ?? left.weekIssued * left.doubleRate;
    const rightWeight = rateWeights?.RL.consistencyResolved ?? right.weekIssued * right.doubleRate;
    const denominator = leftWeight + rightWeight;
    return denominator ? (left.consistencyRate * leftWeight + right.consistencyRate * rightWeight) / denominator : 0;
  }
  if (key === "qcPassRate") {
    const denominator = left.qcCompleted + right.qcCompleted;
    return denominator ? (left.qcPassRate * left.qcCompleted + right.qcPassRate * right.qcCompleted) / denominator : 0;
  }
  return left[key] + right[key];
}

export function mergeImportedMetrics(
  imported: Record<DataLine, Partial<LineMetric>>,
) {
  return {
    SFT: { ...EMPTY_LINE_METRIC, ...imported.SFT },
    RL: { ...EMPTY_LINE_METRIC, ...imported.RL },
  };
}

export function buildImportedDashboardModel(inputs: CsvInput[]): ImportedDashboardModel {
  const tables = new Map<TableKey, RecordRow[]>();
  const seenIds = new Map<TableKey, Set<string>>();
  const unknownFiles: string[] = [];
  const warnings: string[] = [];

  for (const input of inputs) {
    const found = findTable(parseCsv(input.text));
    if (!found) {
      unknownFiles.push(input.name);
      continue;
    }
    const seen = seenIds.get(found.key) ?? new Set<string>();
    const accepted = found.records.filter((record) => {
      const id = found.id.map((field) => record[field]).join("|");
      if (found.id.some((field) => !record[field])) {
        warnings.push(`${found.key} 有空主键记录，已跳过。`);
        return false;
      }
      if (seen.has(id)) {
        warnings.push(`${found.key} 存在重复主键 ${id}，仅保留首次出现的记录。`);
        return false;
      }
      const invalidFields = (NUMERIC_FIELDS[found.key] ?? []).filter((field) => !isNumeric(record[field]));
      if (invalidFields.length) {
        warnings.push(`${found.key} ${id} 的 ${invalidFields.join("、")} 不是有效数字，已跳过。`);
        return false;
      }
      seen.add(id);
      return true;
    });
    seenIds.set(found.key, seen);
    tables.set(found.key, [...(tables.get(found.key) ?? []), ...accepted]);
  }

  if (unknownFiles.length) warnings.push(`${unknownFiles.length} 个文件未识别，已跳过：${unknownFiles.join("、")}`);
  const coreTables: TableKey[] = ["数据批次", "发放记录", "回收记录", "双标结果", "质检方案", "质检分配", "每日库存"];
  const missingCoreTables = coreTables.filter((table) => !tables.has(table));
  if (tables.size && missingCoreTables.length) warnings.push(`未导入 ${missingCoreTables.join("、")}；对应指标显示为 0 或空。`);

  const daily = tables.get("每日库存") ?? [];
  const issueRows = tables.get("发放记录") ?? [];
  const planRows = tables.get("质检方案") ?? [];
  const assignmentRows = tables.get("质检分配") ?? [];
  const doubleRows = tables.get("双标结果") ?? [];
  const batchRows = tables.get("数据批次") ?? [];
  const annotationRows = tables.get("标注分配") ?? [];
  const changeRows = tables.get("异动记录") ?? [];
  const annotationById = new Map(annotationRows.map((record) => [record["分配ID"], record]));
  const linkedReturnRows = (tables.get("回收记录") ?? []).filter((record) => {
    const returned = toNumber(record["本次回收量"]);
    const completed = toNumber(record["其中完成量"]);
    const incomplete = toNumber(record["其中未完成量"]);
    if (completed > returned || completed + incomplete !== returned) {
      warnings.push(`回收 ${record["回收记录ID"]} 的回收、完成与未完成数量不守恒，已跳过。`);
      return false;
    }
    if (!tables.has("标注分配")) return true;
    const source = annotationById.get(record["分配ID"]);
    if (!source) {
      warnings.push(`回收 ${record["回收记录ID"]} 未找到来源分配 ${record["分配ID"]}，已跳过。`);
      return false;
    }
    if (source["数据线"] !== record["数据线"] || source["发放单ID"] !== record["发放单ID"] || source["人员"] !== record["人员"]) {
      warnings.push(`回收 ${record["回收记录ID"]} 与来源分配 ${record["分配ID"]} 的数据线、发放单或人员不一致，已跳过。`);
      return false;
    }
    return true;
  });
  const invalidReturnAssignments = new Set<string>();
  if (tables.has("标注分配")) {
    for (const assignment of annotationRows) {
      const related = linkedReturnRows.filter((record) => record["分配ID"] === assignment["分配ID"] && (!record["回收日期"] || dateKey(record["回收日期"])));
      if (sum(related, "本次回收量") > toNumber(assignment["分配任务量"])) {
        invalidReturnAssignments.add(assignment["分配ID"]);
        warnings.push(`分配 ${assignment["分配ID"]} 的累计回收量超过分配任务量，相关回收已跳过。`);
      }
    }
  }
  const returnRows = linkedReturnRows.filter((record) => !invalidReturnAssignments.has(record["分配ID"]));

  const dateFields: Array<[TableKey, RecordRow[], string]> = [
    ["每日库存", daily, "日期"],
    ["发放记录", issueRows, "日期"],
    ["标注分配", annotationRows, "开始日期"],
    ["回收记录", returnRows, "回收日期"],
    ["质检方案", planRows, "制定日期"],
    ["质检分配", assignmentRows, "完成日期"],
    ["异动记录", changeRows, "日期"],
  ];
  for (const [table, records, field] of dateFields) {
    const invalid = records.filter((record) => record[field] && !dateKey(record[field]));
    if (invalid.length) warnings.push(`${table} 有 ${invalid.length} 条无效${field}，已从时间口径中排除。`);
  }

  const fallbackDates = [
    latestDate(issueRows, "日期"),
    latestDate(returnRows, "回收日期"),
    latestDate(planRows, "制定日期"),
    latestDate(assignmentRows, "完成日期"),
    latestDate(changeRows, "日期"),
  ].filter((value): value is string => Boolean(value));
  const reportDate = latestDate(daily, "日期") ?? fallbackDates.sort().at(-1);
  const reportWeekStart = reportDate ? weekStart(reportDate) : undefined;

  const datedTables: Array<[RecordRow[], string]> = [
    [issueRows, "日期"],
    [returnRows, "回收日期"],
    [planRows, "制定日期"],
    [assignmentRows, "完成日期"],
    [changeRows, "日期"],
  ];
  const futureRows = reportDate
    ? datedTables.reduce((count, [records, field]) => count + records.filter((record) => (dateKey(record[field]) ?? "") > reportDate).length, 0)
    : 0;
  if (futureRows) warnings.push(`${futureRows} 条晚于报表日 ${reportDate} 的记录未计入当前快照。`);

  const metrics: Record<DataLine, Partial<LineMetric>> = { SFT: {}, RL: {} };
  const rateWeights: Record<DataLine, ImportedRateWeights> = {
    SFT: { doubleEligible: 0, consistencyResolved: 0 },
    RL: { doubleEligible: 0, consistencyResolved: 0 },
  };
  const weeklyQuality: Record<DataLine, { selected: number; completed: number }> = {
    SFT: { selected: 0, completed: 0 },
    RL: { selected: 0, completed: 0 },
  };
  const forecast: Record<DataLine, ImportedForecast> = { SFT: {}, RL: {} };
  const batches: ImportedBatch[] = [];

  for (const line of LINES) {
    const lineBatches = lineRows(batchRows, line);
    if (lineBatches.length) metrics[line].inventory = sum(lineBatches, "当前剩余量");
    batches.push(...lineBatches.map((record) => ({
      id: record["原始批次ID"],
      line,
      received: toNumber(record["收到唯一数据量"]),
      used: toNumber(record["累计库存扣减"]),
      remaining: toNumber(record["当前剩余量"]),
      version: record["当前适用规则"] || "未指定",
      status: record["状态"] || "未指定",
    })));

    const lineDaily = rowsThrough(lineRows(daily, line), "日期", reportDate).sort((a, b) => (dateKey(a["日期"]) ?? "").localeCompare(dateKey(b["日期"]) ?? ""));
    const latest = lineDaily.at(-1);
    if (latest) {
      const dailyInventory = toNumber(latest["期末库存"]);
      if (metrics[line].inventory !== undefined && metrics[line].inventory !== dailyInventory) {
        warnings.push(`${line} 批次剩余合计与每日库存期末值不一致，当前采用每日库存 ${dailyInventory}。`);
      }
      metrics[line].inventory = dailyInventory;
      metrics[line].supportDays = toNumber(latest["预计支撑天数"]);
      forecast[line] = {
        dailyAverage: toNumber(latest["最近工作日日均"]),
        weekForecast: toNumber(latest["预计周消耗"]),
        risk: latest["库存风险"],
      };
    }

    const currentIssues = rowsThrough(lineRows(issueRows, line), "日期", reportDate);
    const firstIssues = currentIssues.filter((record) => record["发放性质"] === "首次发放");
    const weekIssues = reportWeekStart ? firstIssues.filter((record) => (dateKey(record["日期"]) ?? "") >= reportWeekStart) : firstIssues;
    if (firstIssues.length) {
      metrics[line].weekIssued = sum(weekIssues, "库存扣减量");
      metrics[line].todayIssued = sum(firstIssues.filter((record) => dateKey(record["日期"]) === reportDate), "库存扣减量");
    }
    const badDeductions = currentIssues.filter((record) => record["发放性质"] !== "首次发放" && toNumber(record["库存扣减量"]) !== 0);
    if (badDeductions.length) warnings.push(`${line} 有 ${badDeductions.length} 条补发/重发记录的库存扣减不为 0，已从首次发放口径排除。`);

    const returnsThroughReportDate = rowsThrough(lineRows(returnRows, line), "回收日期", reportDate);
    const firstReturns = returnsThroughReportDate.filter((record) => record["回收类型"] === "首次回收");
    const currentReturns = reportWeekStart ? firstReturns.filter((record) => (dateKey(record["回收日期"]) ?? "") >= reportWeekStart) : firstReturns;
    if (currentReturns.length) {
      metrics[line].returned = sum(currentReturns, "本次回收量");
      metrics[line].completed = sum(currentReturns, "其中完成量");
      metrics[line].returnIncomplete = sum(currentReturns, "其中未完成量");
    }

    const issueIds = new Set(weekIssues.map((record) => record["发放单ID"]));
    const currentDouble = lineRows(doubleRows, line).filter((record) => !issueRows.length || issueIds.has(record["发放单ID"]));
    if (currentDouble.length) {
      const completedUnique = sum(currentDouble, "已完成唯一题目");
      const formed = sum(currentDouble, "形成结果的双标量");
      const consistent = sum(currentDouble, "双标一致");
      const inconsistent = sum(currentDouble, "双标不一致");
      rateWeights[line] = {
        doubleEligible: completedUnique,
        consistencyResolved: consistent + inconsistent,
      };
      metrics[line].doubleRate = completedUnique ? (formed / completedUnique) * 100 : 0;
      metrics[line].consistencyRate = consistent + inconsistent ? (consistent / (consistent + inconsistent)) * 100 : 0;
    }
  }

  const currentPlans = rowsThrough(planRows, "制定日期", reportDate);
  const qualityPlans = reportWeekStart
    ? currentPlans.filter((record) => (dateKey(record["制定日期"]) ?? "") >= reportWeekStart)
    : currentPlans;
  const planById = new Map(currentPlans.map((record) => [record["质检方案ID"], record]));
  const currentAssignments = rowsThrough(assignmentRows, "完成日期", reportDate).filter((record) => {
    const plan = planById.get(record["质检方案ID"]);
    if (!plan) {
      warnings.push(`质检分配 ${record["质检分配ID"]} 未找到对应方案，已跳过。`);
      return false;
    }
    if (record["数据线"] !== plan["数据线"]) {
      warnings.push(`质检分配 ${record["质检分配ID"]} 与方案 ${record["质检方案ID"]} 的数据线不一致，已跳过。`);
      return false;
    }
    return true;
  });
  const assignmentsByPlan = new Map<string, RecordRow[]>();
  for (const record of currentAssignments) {
    const key = record["质检方案ID"];
    assignmentsByPlan.set(key, [...(assignmentsByPlan.get(key) ?? []), record]);
    const outcomes = toNumber(record["通过"]) + toNumber(record["不通过"]) + toNumber(record["存疑"]);
    if (toNumber(record["完成量"]) !== outcomes) warnings.push(`质检分配 ${record["质检分配ID"]} 的完成量与结果分类不守恒。`);
  }

  const qualityPools: ImportedQualityPool[] = [];
  for (const line of LINES) {
    const lineWeeklyPlans = lineRows(qualityPlans, line);
    weeklyQuality[line] = {
      selected: sum(lineWeeklyPlans, "实际抽取量"),
      completed: lineWeeklyPlans.reduce((total, plan) => total + (tables.has("质检分配")
        ? sum(assignmentsByPlan.get(plan["质检方案ID"]) ?? [], "完成量")
        : toNumber(plan["已质检数量"])), 0),
    };
    const pools = new Map<string, ImportedQualityPool>();
    for (const plan of lineRows(currentPlans, line)) {
      const poolName = plan["抽检池"] || "未分类";
      const aggregate = pools.get(poolName) ?? {
        line,
        pool: poolName,
        eligible: 0,
        plannedRate: 0,
        actualRate: 0,
        selected: 0,
        completed: 0,
        passed: 0,
        failed: 0,
        disputed: 0,
      };
      const assignments = assignmentsByPlan.get(plan["质检方案ID"]) ?? [];
      aggregate.eligible += toNumber(plan["池内可抽数量"]);
      aggregate.selected += toNumber(plan["实际抽取量"]);
      aggregate.completed += tables.has("质检分配") ? sum(assignments, "完成量") : toNumber(plan["已质检数量"]);
      aggregate.passed += sum(assignments, "通过");
      aggregate.failed += sum(assignments, "不通过");
      aggregate.disputed += sum(assignments, "存疑");
      pools.set(poolName, aggregate);
    }

    for (const pool of pools.values()) {
      const relatedPlans = lineRows(currentPlans, line).filter((record) => (record["抽检池"] || "未分类") === pool.pool);
      pool.plannedRate = pool.eligible ? (sum(relatedPlans, "计划抽取量") / pool.eligible) * 100 : 0;
      pool.actualRate = pool.eligible ? (pool.selected / pool.eligible) * 100 : 0;
      if (pool.completed > pool.selected) warnings.push(`${line} · ${pool.pool} 的质检完成量超过实际抽取量。`);
      qualityPools.push(pool);
    }

    const linePools = qualityPools.filter((pool) => pool.line === line);
    if (linePools.length) {
      const selected = linePools.reduce((total, pool) => total + pool.selected, 0);
      const completed = linePools.reduce((total, pool) => total + pool.completed, 0);
      const passed = linePools.reduce((total, pool) => total + pool.passed, 0);
      const failed = linePools.reduce((total, pool) => total + pool.failed, 0);
      metrics[line].qcSelected = selected;
      metrics[line].qcCompleted = completed;
      metrics[line].qcPending = Math.max(0, selected - completed);
      if (tables.has("质检分配")) {
        metrics[line].qcPassRate = completed ? (passed / completed) * 100 : 0;
        metrics[line].rework = failed;
      }
    }
  }

  const availableDates = Array.from(new Set([
    ...daily.map((record) => dateKey(record["日期"])),
    ...issueRows.map((record) => dateKey(record["日期"])),
    ...returnRows.map((record) => dateKey(record["回收日期"])),
  ].filter((value): value is string => value !== undefined && (!reportDate || value <= reportDate)))).sort();

  const workdayTrend = availableDates.map((date) => {
    const inventoryRecordFor = (line: DataLine) => daily.find((record) => record["数据线"] === line && dateKey(record["日期"]) === date);
    const inventoryFor = (line: DataLine) => toNumber(inventoryRecordFor(line)?.["期末库存"]);
    const issues = issueRows.filter((record) => dateKey(record["日期"]) === date && record["发放性质"] === "首次发放");
    const returns = returnRows.filter((record) => dateKey(record["回收日期"]) === date && record["回收类型"] === "首次回收");
    const byLine = Object.fromEntries(LINES.map((line) => {
      const lineIssues = lineRows(issues, line);
      const lineReturns = lineRows(returns, line);
      return [line, {
        issued: sum(lineIssues, "库存扣减量"),
        returned: sum(lineReturns, "本次回收量"),
        completed: sum(lineReturns, "其中完成量"),
        hasData: Boolean(inventoryRecordFor(line) || lineIssues.length || lineReturns.length),
      }];
    })) as Record<DataLine, { issued: number; returned: number; completed: number; hasData?: boolean }>;
    return {
      date: shortDate(date),
      sftInventory: inventoryFor("SFT"),
      rlInventory: inventoryFor("RL"),
      issued: sum(issues, "库存扣减量"),
      returned: sum(returns, "本次回收量"),
      completed: sum(returns, "其中完成量"),
      byLine,
    };
  });

  const peopleMap = new Map<string, ImportedPerson>();
  const annotationCurrent = rowsThrough(annotationRows, "开始日期", reportDate);
  for (const record of annotationCurrent) {
    const line = record["数据线"] as DataLine;
    if (!LINES.includes(line) || !record["人员"]) continue;
    const key = `${line}|标注|${record["人员"]}`;
    const person = peopleMap.get(key) ?? { name: record["人员"], line, role: "标注", assigned: 0, completed: 0, pending: 0, quality: 0, days: [] };
    person.assigned += toNumber(record["分配任务量"]);
    peopleMap.set(key, person);
  }

  for (const record of assignmentRows) {
    const plan = planById.get(record["质检方案ID"]);
    const line = record["数据线"] as DataLine;
    if (!plan || plan["数据线"] !== line || !LINES.includes(line) || !record["质检人员"]) continue;
    const key = `${line}|质检|${record["质检人员"]}`;
    const person = peopleMap.get(key) ?? { name: record["质检人员"], line, role: "质检", assigned: 0, completed: 0, pending: 0, quality: 0, days: [] };
    person.assigned += toNumber(record["分配量"]);
    const completedOn = dateKey(record["完成日期"]);
    if (!record["完成日期"] || (completedOn && (!reportDate || completedOn <= reportDate))) person.completed += toNumber(record["完成量"]);
    peopleMap.set(key, person);
  }

  const people = Array.from(peopleMap.values()).map((person) => {
    if (person.role === "质检") {
      const related = currentAssignments.filter((record) => record["数据线"] === person.line && record["质检人员"] === person.name);
      person.quality = person.completed ? (sum(related, "通过") / person.completed) * 100 : 0;
      const daily = availableDates.map((date) => sum(related.filter((record) => dateKey(record["完成日期"]) === date), "完成量"));
      const max = Math.max(...daily, 1);
      person.days = daily.map((value) => Math.round((value / max) * 100));
    } else {
      const related = rowsThrough(lineRows(returnRows, person.line), "回收日期", reportDate).filter((record) => record["人员"] === person.name);
      person.completed = sum(related, "其中完成量");
      person.quality = person.assigned ? (person.completed / person.assigned) * 100 : 0;
      const daily = availableDates.map((date) => sum(related.filter((record) => dateKey(record["回收日期"]) === date), "其中完成量"));
      const max = Math.max(...daily, 1);
      person.days = daily.map((value) => Math.round((value / max) * 100));
    }
    person.pending = Math.max(0, person.assigned - person.completed);
    person.dayDates = availableDates.map(shortDate);
    return person;
  });

  const returnsThroughReport = rowsThrough(returnRows, "回收日期", reportDate);
  const followups: ImportedFollowup[] = annotationCurrent.flatMap((record) => {
    const line = record["数据线"] as DataLine;
    if (!LINES.includes(line)) return [];
    const related = returnsThroughReport.filter((item) => item["分配ID"] === record["分配ID"] && item["数据线"] === line && item["发放单ID"] === record["发放单ID"]);
    const assigned = toNumber(record["分配任务量"]);
    const returned = sum(related, "本次回收量");
    const completed = sum(related, "其中完成量");
    if (returned >= assigned && completed >= assigned) return [];
    return [{
      id: record["分配ID"],
      person: record["人员"] || "未指定",
      line,
      assigned,
      returned,
      completed,
      status: returned < assigned ? "未回收" : "回收未完成",
    }];
  });

  const firstIssuesThroughReport = rowsThrough(issueRows, "日期", reportDate).filter((record) => record["发放性质"] === "首次发放");
  const cohortKeys = Array.from(new Set(firstIssuesThroughReport.map((record) => `${record["数据线"]}|${dateKey(record["日期"]) ?? ""}`))).filter((key) => !key.endsWith("|"));
  const returnCohort: ImportedReturnCohort[] = cohortKeys.map((key) => {
    const [lineValue, date] = key.split("|");
    const line = lineValue as DataLine;
    const issues = firstIssuesThroughReport.filter((record) => record["数据线"] === line && dateKey(record["日期"]) === date);
    const issueIds = new Set(issues.map((record) => record["发放单ID"]));
    const denominator = sum(issues, "总标注工作量") || sum(issues, "基础任务量") || sum(issues, "库存扣减量");
    const related = returnsThroughReport.filter((record) => record["数据线"] === line && issueIds.has(record["发放单ID"]));
    return {
      line,
      date: shortDate(date),
      values: [0, 1, 2, 3, 4].map((offset) => {
        const cutoff = addDays(date, offset);
        if (reportDate && cutoff > reportDate) return null;
        return denominator ? Math.min(100, percentValue(sum(related.filter((record) => (dateKey(record["回收日期"]) ?? "") <= cutoff), "其中完成量"), denominator)) : 0;
      }),
    };
  }).sort((a, b) => a.date.localeCompare(b.date)).slice(-10);

  const reasonStart = reportDate ? weekStart(reportDate) : undefined;
  const reasonMap = new Map<string, number>();
  for (const record of returnsThroughReport) {
    const date = dateKey(record["回收日期"]);
    const reason = record["未完成原因"];
    const line = record["数据线"] as DataLine;
    const value = toNumber(record["其中未完成量"]);
    if (!LINES.includes(line) || !reason || !value || (reasonStart && date && date < reasonStart)) continue;
    const key = `${line}|${reason}`;
    reasonMap.set(key, (reasonMap.get(key) ?? 0) + value);
  }
  const importedIncompleteReasons: ImportedIncompleteReason[] = Array.from(reasonMap, ([key, value]) => {
    const [line, ...label] = key.split("|");
    return { line: line as DataLine, label: label.join("|"), value };
  }).sort((a, b) => b.value - a.value);

  const ruleVersions: ImportedRuleVersion[] = (tables.get("规则版本") ?? []).flatMap((record) => {
    const line = record["数据线"] as DataLine;
    if (!LINES.includes(line)) return [];
    const start = dateKey(record["生效日期"]);
    const end = dateKey(record["停止日期"]);
    return [{
      line,
      version: record["版本号"] || record["规则版本ID"],
      start: start ? shortDate(start) : "未设置",
      end: end ? shortDate(end) : "至今",
      status: record["状态"] || "未指定",
      comparable: record["影响可比性"] !== "是",
      change: `${record["规则类型"] || "规则"} · ${record["变更摘要"] || "无变更摘要"}`,
    }];
  });

  if (tables.has("异动记录") && tables.has("标注分配")) {
    for (const change of changeRows) {
      const source = annotationById.get(change["来源分配ID"]);
      if (source && (source["数据线"] !== change["数据线"] || source["人员"] !== change["原负责人"])) {
        warnings.push(`异动 ${change["异动ID"]} 与来源分配 ${change["来源分配ID"]} 的数据线或原负责人不一致。`);
      }
    }
  }

  return {
    report: {
      files: inputs.length,
      rows: Array.from(tables.values()).reduce((total, records) => total + records.length, 0),
      tables: Array.from(tables.keys()),
      unknownFiles,
      warnings: Array.from(new Set(warnings)),
      reportDate,
      futureRows,
    },
    metrics,
    rateWeights,
    weeklyQuality,
    forecast,
    workdayTrend: workdayTrend.length ? workdayTrend : undefined,
    qualityPools: qualityPools.length ? qualityPools : undefined,
    batches: batches.length ? batches : undefined,
    people: people.length ? people : undefined,
    ruleVersions: ruleVersions.length ? ruleVersions : undefined,
    followups,
    returnCohort,
    incompleteReasons: importedIncompleteReasons,
  };
}
