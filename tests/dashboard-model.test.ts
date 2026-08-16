import assert from "node:assert/strict";
import test from "node:test";
import {
  buildImportedDashboardModel,
  combineLineMetric,
  mergeImportedMetrics,
  parseCsv,
} from "../app/dashboard-model.ts";
import type { LineMetric } from "../app/dashboard-data.ts";

function csv(rows: Array<Array<string | number>>) {
  return rows.map((row) => row.map((cell) => String(cell)).join(",")).join("\r\n");
}

test("CSV parser handles quoted commas and escaped quotes", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x,y","say ""hi"""'), [["a", "b"], ["x,y", 'say "hi"']]);
});

test("finds the third-row Excel header and sums multiple inventory batches", () => {
  const model = buildImportedDashboardModel([{
    name: "数据批次.csv",
    text: csv([
      ["原始数据批次"],
      ["说明"],
      ["原始批次ID", "数据线", "到达日期", "收到唯一数据量", "累计库存扣减", "当前剩余量", "状态", "当前适用规则"],
      ["SFT-1", "SFT", "2026-08-01", 100, 40, 60, "使用中", "V1"],
      ["SFT-2", "SFT", "2026-08-14", 90, 0, 90, "待使用", "V2"],
      ["RL-1", "RL", "2026-08-05", 80, 20, 60, "使用中", "V1"],
    ]),
  }]);

  assert.equal(model.metrics.SFT.inventory, 150);
  assert.equal(model.metrics.RL.inventory, 60);
  assert.equal(model.batches?.length, 3);
  assert.deepEqual(model.report.tables, ["数据批次"]);
});

test("uses daily inventory as report date and excludes future QC completion", () => {
  const model = buildImportedDashboardModel([
    {
      name: "每日库存.csv",
      text: csv([
        ["标题"],
        ["说明"],
        ["日期", "数据线", "期初库存", "今日新到", "首次发放消耗", "库存调整", "期末库存", "最近工作日日均", "预计周消耗", "预计支撑天数", "库存风险"],
        ["2026-08-14", "SFT", 1000, 0, 100, 0, 900, 100, 500, 9, "中"],
        ["2026-08-14", "RL", 600, 0, 50, 0, 550, 50, 250, 11, "低"],
      ]),
    },
    {
      name: "质检方案.csv",
      text: csv([
        ["标题"], ["说明"],
        ["质检方案ID", "制定日期", "数据线", "发放单ID", "作业批次ID", "质检规则版本", "抽检池", "池内可抽数量", "计划比例", "计划抽取量", "实际抽取量", "实际比例", "质检人数", "已质检数量", "待质检数量", "状态"],
        ["QC-1", "2026-08-14", "SFT", "D-1", "W-1", "QC-V1", "未双标", 100, 0.1, 10, 10, 0.1, 2, 10, 0, "进行中"],
      ]),
    },
    {
      name: "质检分配.csv",
      text: csv([
        ["标题"], ["说明"],
        ["质检分配ID", "质检方案ID", "数据线", "质检人员", "抽检池", "分配量", "完成量", "通过", "不通过", "存疑", "未完成", "完成日期", "状态"],
        ["QCA-1", "QC-1", "SFT", "质检员A", "未双标", 8, 8, 7, 1, 0, 0, "2026-08-14", "已完成"],
        ["QCA-2", "QC-1", "SFT", "质检员B", "未双标", 2, 2, 2, 0, 0, 0, "2026-08-15", "已完成"],
      ]),
    },
  ]);

  assert.equal(model.report.reportDate, "2026-08-14");
  assert.equal(model.report.futureRows, 1);
  assert.equal(model.metrics.SFT.qcSelected, 10);
  assert.equal(model.metrics.SFT.qcCompleted, 8);
  assert.equal(model.metrics.SFT.qcPending, 2);
  assert.equal(model.metrics.SFT.qcPassRate, 87.5);
});

test("counts only first issue inventory deductions", () => {
  const model = buildImportedDashboardModel([
    {
      name: "每日库存.csv",
      text: csv([
        ["日期", "数据线", "期末库存", "预计支撑天数"],
        ["2026-08-14", "SFT", 900, 9],
      ]),
    },
    {
      name: "发放记录.csv",
      text: csv([
        ["标题"], ["说明"],
        ["发放单ID", "日期", "轮次", "数据线", "原始批次ID", "作业批次ID", "发放性质", "基础任务量", "库存扣减量", "双标增加量"],
        ["D-1", "2026-08-14", "第1轮", "SFT", "SRC-1", "W-1", "首次发放", 100, 100, 10],
        ["D-2", "2026-08-14", "第2轮", "SFT", "SRC-1", "W-1", "未完成重发", 40, 40, 0],
      ]),
    },
  ]);

  assert.equal(model.metrics.SFT.weekIssued, 100);
  assert.equal(model.metrics.SFT.todayIssued, 100);
  assert.ok(model.report.warnings.some((warning) => warning.includes("库存扣减不为 0")));
});

test("unknown files are reported without blocking recognized tables", () => {
  const model = buildImportedDashboardModel([
    { name: "notes.csv", text: "foo,bar\n1,2" },
    {
      name: "回收记录.csv",
      text: csv([
        ["回收记录ID", "回收日期", "分配ID", "发放单ID", "数据线", "人员", "回收类型", "本次回收量", "其中完成量", "其中未完成量"],
        ["R-1", "2026-08-14", "A-1", "D-1", "RL", "标注员A", "首次回收", 50, 45, 5],
      ]),
    },
  ]);

  assert.deepEqual(model.report.unknownFiles, ["notes.csv"]);
  assert.equal(model.metrics.RL.returned, 50);
  assert.equal(model.metrics.RL.completed, 45);
  assert.equal(model.metrics.RL.returnIncomplete, 5);
});

test("ALL rates use their actual business denominators", () => {
  const base: LineMetric = {
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
  const metrics = {
    SFT: { ...base, weekIssued: 100, doubleRate: 10, consistencyRate: 50, qcCompleted: 10, qcPassRate: 50 },
    RL: { ...base, weekIssued: 300, doubleRate: 20, consistencyRate: 100, qcCompleted: 90, qcPassRate: 100 },
  };

  const weights = {
    SFT: { doubleEligible: 100, consistencyResolved: 10 },
    RL: { doubleEligible: 900, consistencyResolved: 90 },
  };

  assert.equal(combineLineMetric("doubleRate", metrics, weights), 19);
  assert.equal(combineLineMetric("consistencyRate", metrics, weights), 95);
  assert.equal(combineLineMetric("qcPassRate", metrics), 95);
});

test("weekly flow excludes returns from earlier weeks", () => {
  const model = buildImportedDashboardModel([
    {
      name: "每日库存.csv",
      text: csv([
        ["日期", "数据线", "期末库存", "预计支撑天数"],
        ["2026-08-14", "SFT", 900, 9],
      ]),
    },
    {
      name: "发放记录.csv",
      text: csv([
        ["发放单ID", "日期", "数据线", "发放性质", "库存扣减量"],
        ["D-1", "2026-08-14", "SFT", "首次发放", 100],
      ]),
    },
    {
      name: "回收记录.csv",
      text: csv([
        ["回收记录ID", "回收日期", "分配ID", "发放单ID", "数据线", "人员", "回收类型", "本次回收量", "其中完成量", "其中未完成量"],
        ["R-old", "2026-08-07", "A-old", "D-old", "SFT", "标注员A", "首次回收", 1000, 1000, 0],
        ["R-now", "2026-08-14", "A-1", "D-1", "SFT", "标注员A", "首次回收", 90, 80, 10],
      ]),
    },
  ]);

  assert.equal(model.metrics.SFT.weekIssued, 100);
  assert.equal(model.metrics.SFT.returned, 90);
  assert.equal(model.metrics.SFT.completed, 80);
  assert.equal(model.metrics.SFT.returnIncomplete, 10);
  assert.equal(model.workdayTrend?.at(-1)?.byLine?.SFT.returned, 90);
});

test("people completion is recomputed through report date instead of trusting future-facing formulas", () => {
  const model = buildImportedDashboardModel([
    {
      name: "每日库存.csv",
      text: csv([
        ["日期", "数据线", "期末库存", "预计支撑天数"],
        ["2026-08-14", "SFT", 900, 9],
      ]),
    },
    {
      name: "标注分配.csv",
      text: csv([
        ["分配ID", "发放单ID", "数据线", "人员", "分配任务量", "开始日期", "累计完成"],
        ["A-1", "D-1", "SFT", "标注员A", 100, "2026-08-14", 100],
      ]),
    },
    {
      name: "回收记录.csv",
      text: csv([
        ["回收记录ID", "回收日期", "分配ID", "发放单ID", "数据线", "人员", "回收类型", "本次回收量", "其中完成量", "其中未完成量"],
        ["R-future", "2026-08-15", "A-1", "D-1", "SFT", "标注员A", "首次回收", 100, 100, 0],
      ]),
    },
  ]);

  const person = model.people?.find((item) => item.name === "标注员A");
  assert.equal(person?.assigned, 100);
  assert.equal(person?.completed, 0);
  assert.equal(person?.pending, 100);
});

test("an imported snapshot never fills missing lines with demo values", () => {
  const metrics = mergeImportedMetrics({ SFT: { inventory: 120 }, RL: {} });
  assert.equal(metrics.SFT.inventory, 120);
  assert.equal(metrics.SFT.weekIssued, 0);
  assert.equal(metrics.RL.inventory, 0);
  assert.equal(metrics.RL.qcCompleted, 0);
});

test("cross-line QC assignments are rejected instead of contaminating the plan", () => {
  const model = buildImportedDashboardModel([
    {
      name: "每日库存.csv",
      text: csv([
        ["日期", "数据线", "期末库存", "预计支撑天数"],
        ["2026-08-14", "SFT", 900, 9],
      ]),
    },
    {
      name: "质检方案.csv",
      text: csv([
        ["质检方案ID", "制定日期", "数据线", "抽检池", "池内可抽数量", "计划抽取量", "实际抽取量"],
        ["QC-1", "2026-08-14", "SFT", "未双标", 100, 10, 10],
      ]),
    },
    {
      name: "质检分配.csv",
      text: csv([
        ["质检分配ID", "质检方案ID", "数据线", "质检人员", "分配量", "完成量", "通过", "不通过", "存疑", "完成日期"],
        ["QCA-1", "QC-1", "RL", "质检员A", 10, 10, 10, 0, 0, "2026-08-14"],
      ]),
    },
  ]);

  assert.equal(model.metrics.SFT.qcCompleted, 0);
  assert.ok(model.report.warnings.some((warning) => warning.includes("数据线不一致")));
});

test("overlapping exports are deduplicated by business key", () => {
  const header = ["原始批次ID", "数据线", "当前剩余量"];
  const inputs = ["数据批次-1.csv", "数据批次-2.csv"].map((name) => ({
    name,
    text: csv([header, ["SRC-1", "SFT", 100]]),
  }));
  const model = buildImportedDashboardModel(inputs);

  assert.equal(model.metrics.SFT.inventory, 100);
  assert.equal(model.report.rows, 1);
  assert.ok(model.report.warnings.some((warning) => warning.includes("重复主键")));
});

test("invalid calendar dates do not crash an import", () => {
  const model = buildImportedDashboardModel([{
    name: "每日库存.csv",
    text: csv([
      ["日期", "数据线", "期末库存", "预计支撑天数"],
      ["2026-19-10", "SFT", 900, 9],
    ]),
  }]);

  assert.equal(model.report.reportDate, undefined);
  assert.equal(model.metrics.SFT.inventory, undefined);
  assert.ok(model.report.warnings.some((warning) => warning.includes("无效日期")));
});

test("first-return metrics exclude rework returns", () => {
  const model = buildImportedDashboardModel([
    {
      name: "每日库存.csv",
      text: csv([
        ["日期", "数据线", "期末库存", "预计支撑天数"],
        ["2026-08-14", "SFT", 900, 9],
      ]),
    },
    {
      name: "发放记录.csv",
      text: csv([
        ["发放单ID", "日期", "数据线", "发放性质", "库存扣减量"],
        ["D-1", "2026-08-14", "SFT", "首次发放", 100],
      ]),
    },
    {
      name: "回收记录.csv",
      text: csv([
        ["回收记录ID", "回收日期", "分配ID", "发放单ID", "数据线", "人员", "回收类型", "本次回收量", "其中完成量", "其中未完成量"],
        ["R-1", "2026-08-14", "A-1", "D-1", "SFT", "标注员A", "首次回收", 80, 80, 0],
        ["R-2", "2026-08-14", "A-2", "D-R1", "SFT", "标注员B", "返工回收", 30, 30, 0],
      ]),
    },
  ]);

  assert.equal(model.metrics.SFT.returned, 80);
  assert.equal(model.metrics.SFT.completed, 80);
});

test("weekly QC flow stays separate from older open backlog", () => {
  const model = buildImportedDashboardModel([
    {
      name: "每日库存.csv",
      text: csv([
        ["日期", "数据线", "期末库存", "预计支撑天数"],
        ["2026-08-14", "SFT", 900, 9],
      ]),
    },
    {
      name: "质检方案.csv",
      text: csv([
        ["质检方案ID", "制定日期", "数据线", "抽检池", "池内可抽数量", "计划抽取量", "实际抽取量"],
        ["QC-old", "2026-08-07", "SFT", "未双标", 200, 200, 200],
        ["QC-now", "2026-08-14", "SFT", "未双标", 100, 10, 10],
      ]),
    },
    {
      name: "质检分配.csv",
      text: csv([
        ["质检分配ID", "质检方案ID", "数据线", "质检人员", "分配量", "完成量", "通过", "不通过", "存疑", "完成日期"],
        ["QCA-old", "QC-old", "SFT", "质检员A", 200, 0, 0, 0, 0, "2026-08-14"],
        ["QCA-now", "QC-now", "SFT", "质检员A", 10, 10, 9, 1, 0, "2026-08-14"],
      ]),
    },
  ]);

  assert.equal(model.metrics.SFT.qcSelected, 210);
  assert.equal(model.metrics.SFT.qcCompleted, 10);
  assert.equal(model.metrics.SFT.qcPending, 200);
  assert.equal(model.metrics.SFT.qcPassRate, 90);
  assert.deepEqual(model.weeklyQuality.SFT, { selected: 10, completed: 10 });
});

test("invalid numeric values are skipped with a warning", () => {
  const model = buildImportedDashboardModel([{
    name: "发放记录.csv",
    text: csv([
      ["发放单ID", "日期", "数据线", "发放性质", "库存扣减量"],
      ["D-1", "2026-08-14", "SFT", "首次发放", "abc"],
    ]),
  }]);

  assert.equal(model.report.rows, 0);
  assert.ok(model.report.warnings.some((warning) => warning.includes("不是有效数字")));
});

test("mismatched return relationships cannot close a follow-up", () => {
  const model = buildImportedDashboardModel([
    {
      name: "每日库存.csv",
      text: csv([
        ["日期", "数据线", "期末库存", "预计支撑天数"],
        ["2026-08-14", "SFT", 900, 9],
      ]),
    },
    {
      name: "标注分配.csv",
      text: csv([
        ["分配ID", "发放单ID", "数据线", "人员", "分配任务量", "开始日期"],
        ["A-1", "D-1", "SFT", "标注员A", 100, "2026-08-14"],
      ]),
    },
    {
      name: "回收记录.csv",
      text: csv([
        ["回收记录ID", "回收日期", "分配ID", "发放单ID", "数据线", "人员", "回收类型", "本次回收量", "其中完成量", "其中未完成量"],
        ["R-1", "2026-08-14", "A-1", "D-1", "RL", "标注员A", "首次回收", 100, 100, 0],
      ]),
    },
  ]);

  assert.equal(model.followups?.[0]?.id, "A-1");
  assert.equal(model.followups?.[0]?.returned, 0);
  assert.ok(model.report.warnings.some((warning) => warning.includes("数据线、发放单或人员不一致")));
});

test("invalid QC completion dates are excluded with a warning", () => {
  const model = buildImportedDashboardModel([
    {
      name: "每日库存.csv",
      text: csv([
        ["日期", "数据线", "期末库存", "预计支撑天数"],
        ["2026-08-14", "SFT", 900, 9],
      ]),
    },
    {
      name: "质检方案.csv",
      text: csv([
        ["质检方案ID", "制定日期", "数据线", "抽检池", "池内可抽数量", "计划抽取量", "实际抽取量"],
        ["QC-1", "2026-08-14", "SFT", "未双标", 100, 10, 10],
      ]),
    },
    {
      name: "质检分配.csv",
      text: csv([
        ["质检分配ID", "质检方案ID", "数据线", "质检人员", "分配量", "完成量", "通过", "不通过", "存疑", "完成日期"],
        ["QCA-1", "QC-1", "SFT", "质检员A", 10, 10, 10, 0, 0, "2026-19-10"],
      ]),
    },
  ]);

  assert.equal(model.metrics.SFT.qcCompleted, 0);
  assert.equal(model.people?.find((person) => person.name === "质检员A")?.completed, 0);
  assert.ok(model.report.warnings.some((warning) => warning.includes("无效完成日期")));
});

test("returns above the assigned amount cannot close a follow-up", () => {
  const model = buildImportedDashboardModel([
    {
      name: "每日库存.csv",
      text: csv([
        ["日期", "数据线", "期末库存", "预计支撑天数"],
        ["2026-08-14", "SFT", 900, 9],
      ]),
    },
    {
      name: "标注分配.csv",
      text: csv([
        ["分配ID", "发放单ID", "数据线", "人员", "分配任务量", "开始日期"],
        ["A-1", "D-1", "SFT", "标注员A", 100, "2026-08-14"],
      ]),
    },
    {
      name: "回收记录.csv",
      text: csv([
        ["回收记录ID", "回收日期", "分配ID", "发放单ID", "数据线", "人员", "回收类型", "本次回收量", "其中完成量", "其中未完成量"],
        ["R-1", "2026-08-14", "A-1", "D-1", "SFT", "标注员A", "首次回收", 200, 200, 0],
      ]),
    },
  ]);

  assert.equal(model.metrics.SFT.returned, undefined);
  assert.equal(model.followups?.[0]?.returned, 0);
  assert.ok(model.report.warnings.some((warning) => warning.includes("累计回收量超过分配任务量")));
});
