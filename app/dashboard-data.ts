export type DataLine = "SFT" | "RL";
export type LineFilter = "ALL" | DataLine;
export type ViewKey = "overview" | "returns" | "quality" | "people" | "inventory" | "versions";

export type LineMetric = {
  inventory: number;
  supportDays: number;
  todayIssued: number;
  weekIssued: number;
  returned: number;
  completed: number;
  returnIncomplete: number;
  doubleRate: number;
  consistencyRate: number;
  qcSelected: number;
  qcCompleted: number;
  qcPending: number;
  qcPassRate: number;
  rework: number;
};

export const lineMetrics: Record<DataLine, LineMetric> = {
  SFT: { inventory: 10500, supportDays: 9.5, todayIssued: 1300, weekIssued: 5500, returned: 4935, completed: 4635, returnIncomplete: 100, doubleRate: 11.7, consistencyRate: 82.1, qcSelected: 552, qcCompleted: 533, qcPending: 19, qcPassRate: 91.0, rework: 28 },
  RL: { inventory: 5300, supportDays: 8.3, todayIssued: 750, weekIssued: 3200, returned: 2720, completed: 2508, returnIncomplete: 105, doubleRate: 8.4, consistencyRate: 81.6, qcSelected: 328, qcCompleted: 317, qcPending: 11, qcPassRate: 90.9, rework: 20 },
};

export const workdayTrend = [
  { date: "08-10", sftInventory: 9000, rlInventory: 4500, issued: 1500, returned: 1290, completed: 1183 },
  { date: "08-11", sftInventory: 7950, rlInventory: 3850, issued: 1700, returned: 1515, completed: 1400 },
  { date: "08-12", sftInventory: 13000, rlInventory: 3150, issued: 1650, returned: 1478, completed: 1350 },
  { date: "08-13", sftInventory: 11800, rlInventory: 2550, issued: 1800, returned: 1574, completed: 1470 },
  { date: "08-14", sftInventory: 10500, rlInventory: 5300, issued: 2050, returned: 1798, completed: 1740 },
];

export const qualityPools = [
  { line: "SFT" as DataLine, pool: "双标一致", eligible: 468, plannedRate: 7.0, actualRate: 7.5, selected: 35, completed: 32, passed: 31, failed: 1, disputed: 0 },
  { line: "SFT" as DataLine, pool: "双标不一致", eligible: 97, plannedRate: 72.0, actualRate: 70.1, selected: 68, completed: 64, passed: 51, failed: 11, disputed: 2 },
  { line: "SFT" as DataLine, pool: "未双标", eligible: 4450, plannedRate: 10.0, actualRate: 10.1, selected: 449, completed: 437, passed: 403, failed: 25, disputed: 9 },
  { line: "RL" as DataLine, pool: "双标一致", eligible: 196, plannedRate: 7.0, actualRate: 7.1, selected: 14, completed: 13, passed: 13, failed: 0, disputed: 0 },
  { line: "RL" as DataLine, pool: "双标不一致", eligible: 46, plannedRate: 80.0, actualRate: 80.4, selected: 37, completed: 35, passed: 28, failed: 6, disputed: 1 },
  { line: "RL" as DataLine, pool: "未双标", eligible: 2655, plannedRate: 10.5, actualRate: 10.4, selected: 277, completed: 269, passed: 247, failed: 16, disputed: 6 },
];

export const people = [
  { name: "标注员A", line: "SFT" as DataLine, role: "标注", assigned: 2400, completed: 2267, pending: 133, quality: 94.2, days: [88, 72, 94, 80, 100] },
  { name: "标注员B", line: "SFT" as DataLine, role: "标注", assigned: 2400, completed: 2184, pending: 216, quality: 92.8, days: [80, 90, 76, 95, 88] },
  { name: "标注员C", line: "RL" as DataLine, role: "标注", assigned: 1607, completed: 1530, pending: 77, quality: 95.1, days: [70, 82, 89, 78, 93] },
  { name: "标注员D", line: "RL" as DataLine, role: "标注", assigned: 1602, completed: 1543, pending: 59, quality: 94.6, days: [84, 75, 91, 86, 90] },
  { name: "质检员A", line: "SFT" as DataLine, role: "质检", assigned: 132, completed: 128, pending: 4, quality: 91.4, days: [62, 76, 88, 90, 96] },
  { name: "质检员B", line: "RL" as DataLine, role: "质检", assigned: 104, completed: 98, pending: 6, quality: 90.8, days: [54, 68, 80, 92, 86] },
];

export const alerts = [
  { id: "return-incomplete", level: "high", title: "SFT 回收未完成 100 题", detail: "其中 60 题尚未进入重发或转派队列。", action: "查看回收明细", view: "returns" as ViewKey },
  { id: "inventory-risk", level: "medium", title: "RL 库存支撑仅 8.3 天", detail: "近 5 个工作日日均消耗 640 题，本周预测使用 3,200 题。", action: "查看库存预测", view: "inventory" as ViewKey },
  { id: "qc-pending", level: "medium", title: "双标不一致池待质检 6 题", detail: "SFT 4 题、RL 2 题；优先级高于普通未双标池。", action: "查看质检池", view: "quality" as ViewKey },
  { id: "rule-version", level: "info", title: "SFT 已切换到 V2 规则", detail: "V2 增加理由字段并调整输出格式，与 V1 人效不可直接比较。", action: "查看版本分界", view: "versions" as ViewKey },
];

export const incompleteReasons = [
  { label: "任务未及时完成", value: 86 },
  { label: "题目存在歧义", value: 52 },
  { label: "规则理解偏差", value: 39 },
  { label: "人员临时调整", value: 28 },
];

export const batches = [
  { id: "SFT-SRC-260801-01", line: "SFT" as DataLine, received: 10000, used: 5500, remaining: 4500, version: "V2", status: "使用中" },
  { id: "SFT-SRC-260812-01", line: "SFT" as DataLine, received: 6000, used: 0, remaining: 6000, version: "V2", status: "待使用" },
  { id: "RL-SRC-260805-01", line: "RL" as DataLine, received: 5000, used: 3200, remaining: 1800, version: "V1", status: "使用中" },
  { id: "RL-SRC-260814-01", line: "RL" as DataLine, received: 3500, used: 0, remaining: 3500, version: "V1", status: "待使用" },
];

export const ruleVersions = [
  { line: "SFT" as DataLine, version: "V1", start: "08-01", end: "08-11", status: "已停用", comparable: false, change: "基础格式" },
  { line: "SFT" as DataLine, version: "V2", start: "08-12", end: "至今", status: "生效中", comparable: false, change: "增加理由字段，调整输出格式" },
  { line: "RL" as DataLine, version: "V1", start: "08-01", end: "至今", status: "生效中", comparable: true, change: "基础格式" },
];
