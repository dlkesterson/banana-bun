import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { ResourceOptimizerService } from '../src/services/resource-optimizer-service';
import { DEFAULT_RULE_SCHEDULER_CONFIG, type SchedulingRule, type ScheduleSnapshot, type LoadPrediction, type ResourceMetrics } from '../src/types/rule-scheduler';

let optimizer: ResourceOptimizerService;
let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`CREATE TABLE optimization_results (
    id INTEGER PRIMARY KEY,
    optimization_type TEXT,
    original_schedule TEXT,
    optimized_schedule TEXT,
    improvement_metrics TEXT,
    applied_at TEXT,
    success INTEGER,
    error_message TEXT
  )`);

  optimizer = new ResourceOptimizerService(
    db,
    {} as any,
    DEFAULT_RULE_SCHEDULER_CONFIG.optimization,
    DEFAULT_RULE_SCHEDULER_CONFIG.llm_integration
  );
});

describe('ResourceOptimizerService helpers', () => {
  it('isResourceIntensive detects keywords', async () => {
    const rule = {
      rule_name: 'Transcode Video',
      cron_expression: '* * * * *',
      priority: 1,
      is_enabled: true,
      is_auto_generated: false,
      confidence_score: 1,
      trigger_count: 0,
      success_rate: 1
    } as SchedulingRule;

    const fn = (optimizer as any).isResourceIntensive.bind(optimizer);
    expect(fn(rule)).toBe(true);
  });

  it('calculateAverageUtilization averages metrics', () => {
    const metrics: ResourceMetrics = {
      cpu_usage_avg: 50,
      memory_usage_avg: 70,
      disk_io_avg: 40,
      network_io_avg: 20,
      concurrent_tasks_avg: 2
    };

    const avg = (optimizer as any).calculateAverageUtilization(metrics);
    expect(avg).toBeCloseTo((50 + 70 + 40) / 3, 5);
  });

  it('calculatePeakLoad finds highest utilization', () => {
    const predictions: LoadPrediction[] = [
      {
        time_slot: 't1',
        predicted_tasks: 1,
        predicted_resource_usage: {
          cpu_usage_avg: 30,
          memory_usage_avg: 30,
          disk_io_avg: 30,
          network_io_avg: 10,
          concurrent_tasks_avg: 1
        },
        confidence: 0.9
      },
      {
        time_slot: 't2',
        predicted_tasks: 1,
        predicted_resource_usage: {
          cpu_usage_avg: 90,
          memory_usage_avg: 90,
          disk_io_avg: 90,
          network_io_avg: 10,
          concurrent_tasks_avg: 1
        },
        confidence_score: 0.8
      }
    ];

    const peak = (optimizer as any).calculatePeakLoad(predictions);
    expect(peak).toBeCloseTo(90);
  });

  it('countScheduleConflicts detects duplicate cron expressions', async () => {
    const ruleA = {
      rule_name: 'a',
      cron_expression: '0 * * * *',
      priority: 1,
      is_enabled: true,
      is_auto_generated: false,
      confidence_score: 1,
      trigger_count: 0,
      success_rate: 1
    } as SchedulingRule;
    const ruleB = { ...ruleA, rule_name: 'b' } as SchedulingRule;
    const conflicts = await (optimizer as any).countScheduleConflicts([ruleA, ruleB]);
    expect(conflicts).toBe(1);
  });

  it('calculatePredictionConfidence blends scheduled and predictive', () => {
    const scheduled = [{}];
    const predictive: LoadPrediction[] = [
      {
        time_slot: 't',
        predicted_tasks: 1,
        predicted_resource_usage: {
          cpu_usage_avg: 10,
          memory_usage_avg: 10,
          disk_io_avg: 10,
          network_io_avg: 5,
          concurrent_tasks_avg: 1
        },
        confidence_score: 0.5
      }
    ];

    const confidence = (optimizer as any).calculatePredictionConfidence(scheduled, predictive);
    // scheduled ratio = 0.5, avg confidence = 0.5 => 0.5 + (1 - 0.5)*0.5 = 0.75
    expect(confidence).toBeCloseTo(0.75, 5);
  });

  it('shouldUseLLM respects config and input', () => {
    const fn = (optimizer as any).shouldUseLLM.bind(optimizer);

    expect(fn('ollama')).toBe(true);
    expect(fn('openai')).toBe(true);

    // disable both models and test auto
    const opt2 = new ResourceOptimizerService(
      db,
      {} as any,
      DEFAULT_RULE_SCHEDULER_CONFIG.optimization,
      {
        ...DEFAULT_RULE_SCHEDULER_CONFIG.llm_integration,
        ollama: { enabled: false, model: '', use_for: [] },
        openai: { enabled: false, model: '', use_for: [] }
      }
    );
    expect((opt2 as any).shouldUseLLM('auto')).toBe(false);
  });
});

describe('ResourceOptimizerService strategies', () => {
  let baseSchedule: ScheduleSnapshot;

  beforeEach(() => {
    const rule: SchedulingRule = {
      rule_name: 'process task',
      cron_expression: '* * * * *',
      priority: 1,
      is_enabled: true,
      is_auto_generated: false,
      confidence_score: 1,
      trigger_count: 0,
      success_rate: 1
    };

    baseSchedule = {
      timestamp: '2020-01-01T00:00:00.000Z',
      active_schedules: [rule],
      resource_utilization: {
        cpu_usage_avg: 50,
        memory_usage_avg: 50,
        disk_io_avg: 50,
        network_io_avg: 20,
        concurrent_tasks_avg: 1
      },
      predicted_load: []
    };
  });

  it('applyLoadBalancing updates timestamp when peaks detected', async () => {
    const predictions: LoadPrediction[] = [
      {
        time_slot: 't',
        predicted_tasks: 1,
        predicted_resource_usage: {
          cpu_usage_avg: 100,
          memory_usage_avg: 80,
          disk_io_avg: 50,
          network_io_avg: 20,
          concurrent_tasks_avg: 1
        },
        confidence: 0.8
      }
    ];

    const res = await (optimizer as any).applyLoadBalancing(baseSchedule, predictions);
    expect(res.timestamp).not.toBe(baseSchedule.timestamp);
    expect(res.active_schedules.length).toBe(1);
  });

  it('applyResourceOptimization optimizes intensive rules', async () => {
    baseSchedule.active_schedules[0].rule_name = 'transcode big file';
    const metrics: ResourceMetrics = {
      cpu_usage_avg: 90,
      memory_usage_avg: 80,
      disk_io_avg: 40,
      network_io_avg: 20,
      concurrent_tasks_avg: 1
    };
    const res = await (optimizer as any).applyResourceOptimization(baseSchedule, metrics);
    expect(res.timestamp).not.toBe(baseSchedule.timestamp);
    expect(res.active_schedules[0].rule_name).toBe('transcode big file');
  });

  it('applyPeakMitigation staggers during peaks', async () => {
    const predictions: LoadPrediction[] = [
      {
        time_slot: 't',
        predicted_tasks: 1,
        predicted_resource_usage: {
          cpu_usage_avg: 95,
          memory_usage_avg: 95,
          disk_io_avg: 50,
          network_io_avg: 20,
          concurrent_tasks_avg: 1
        },
        confidence_score: 0.9
      }
    ];
    const res = await (optimizer as any).applyPeakMitigation(baseSchedule, predictions);
    expect(res.timestamp).not.toBe(baseSchedule.timestamp);
  });
});
