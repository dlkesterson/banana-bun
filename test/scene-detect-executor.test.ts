import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';

// Mocks
const mockLogger = {
  info: mock(() => Promise.resolve()),
  error: mock(() => Promise.resolve()),
  warn: mock(() => Promise.resolve()),
  debug: mock(() => Promise.resolve())
};

const mockSceneDetectorService = {
  isInitialized: mock(() => true),
  detectScenes: mock(async () => ({
    success: true,
    scenes: [
      {
        start_ms: 0,
        end_ms: 1000,
        scene_index: 0,
        confidence_score: 0.9,
        thumbnail_path: '/tmp/thumb.jpg'
      }
    ]
  })),
  extractKeyframes: mock(async () => [
    '/tmp/kf1.jpg',
    '/tmp/kf2.jpg',
    '/tmp/kf3.jpg'
  ])
};

const mockObjectRecognizerService = {
  isInitialized: mock(() => true),
  detectObjectsInBatch: mock(async (frames: string[]) =>
    frames.map(() => ({
      success: true,
      objects: [{ label: 'dog', confidence: 0.9 }]
    }))
  )
};

const mockMeili = {
  indexDocuments: mock(() => Promise.resolve())
};

let db: Database;
let sceneDetect: any;
let context: any;

beforeEach(async () => {
  db = new Database(':memory:');
  db.run(`CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, description TEXT, status TEXT, args TEXT)`);
  db.run(`CREATE TABLE media_metadata (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, file_path TEXT, file_hash TEXT, metadata_json TEXT, tool_used TEXT)`);
  db.run(`CREATE TABLE video_scenes (id INTEGER PRIMARY KEY AUTOINCREMENT, media_id INTEGER, start_ms INTEGER, end_ms INTEGER, thumbnail_path TEXT, scene_index INTEGER, confidence_score REAL)`);
  db.run(`CREATE TABLE scene_objects (id INTEGER PRIMARY KEY AUTOINCREMENT, scene_id INTEGER, label TEXT, confidence REAL, bounding_box TEXT)`);

  db.run(`INSERT INTO media_metadata (id, task_id, file_path, file_hash, metadata_json, tool_used) VALUES (1, 1, '/tmp/test.mp4', 'hash', '{}', 'ffprobe')`);

  mock.module('../src/db', () => ({ getDatabase: () => db }));
  mock.module('../src/utils/logger', () => ({ logger: mockLogger }));
  mock.module('../src/services/scene-detector', () => ({ sceneDetectorService: mockSceneDetectorService }));
  mock.module('../src/services/object-recognizer', () => ({ objectRecognizerService: mockObjectRecognizerService }));
  mock.module('../src/services/meilisearch-service', () => ({ meilisearchService: mockMeili }));

  sceneDetect = await import('../src/executors/scene-detect');
  context = {
    createObjectDetectionTasks: mock(async (mediaId: number, sceneIds: number[]) => {
      for (const sceneId of sceneIds) {
        db.run(
          `INSERT INTO tasks (type, description, status, args) VALUES (?, ?, ?, ?)`,
          [
            'video_object_detect',
            `Detect objects in scene ${sceneId} of media ${mediaId}`,
            'pending',
            JSON.stringify({ scene_id: sceneId, confidence_threshold: 0.5, force: false })
          ]
        );
      }
    }),
    indexScenes: mock(async (mediaId: number, scenes: any[]) => {
      await mockMeili.indexDocuments('video_scenes', scenes);
    })
  };
});

afterEach(() => {
  db.close();
  Object.values(mockLogger).forEach(fn => fn.mockClear && fn.mockClear());
  mockSceneDetectorService.detectScenes.mockClear();
  mockSceneDetectorService.extractKeyframes.mockClear();
  mockObjectRecognizerService.detectObjectsInBatch.mockClear();
  mockMeili.indexDocuments.mockClear();
  context.createObjectDetectionTasks.mockClear();
  context.indexScenes.mockClear();
});

describe('scene-detect executors', () => {
  it('creates scene detection task with correct args', async () => {
    const id = await sceneDetect.createVideoSceneDetectTask(1, { threshold: 0.5, force: true });
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    expect(row.type).toBe('video_scene_detect');
    const args = JSON.parse(row.args);
    expect(args.media_id).toBe(1);
    expect(args.threshold).toBe(0.5);
    expect(args.force).toBe(true);
    expect(mockLogger.info).toHaveBeenCalled();
  });

  it('executes scene detection and stores scenes', async () => {
    const task = { id: 10, type: 'video_scene_detect', media_id: 1, threshold: 0.4, force: false, status: 'pending', result: null };
    const res = await sceneDetect.executeVideoSceneDetectTask.call(context, task);
    expect(res.success).toBe(true);
    expect(mockSceneDetectorService.detectScenes).toHaveBeenCalledWith('/tmp/test.mp4', expect.any(Object));
    const scenes = db.prepare('SELECT * FROM video_scenes').all() as any[];
    expect(scenes.length).toBe(1);
    const objTasks = db.prepare("SELECT * FROM tasks WHERE type = 'video_object_detect'").all() as any[];
    expect(objTasks.length).toBe(1);
    expect(mockMeili.indexDocuments).toHaveBeenCalled();
  });

  it('detects objects for a scene and stores results', async () => {
    db.run(`INSERT INTO video_scenes (id, media_id, start_ms, end_ms, scene_index, confidence_score) VALUES (1, 1, 0, 1000, 0, 0.8)`);
    const task = { id: 20, type: 'video_object_detect', scene_id: 1, confidence_threshold: 0.5, force: false, status: 'pending', result: null };
    const res = await sceneDetect.executeVideoObjectDetectTask(task);
    expect(res.success).toBe(true);
    const objects = db.prepare('SELECT * FROM scene_objects').all() as any[];
    expect(objects.length).toBe(1);
    expect(objects[0].label).toBe('dog');
  });
});
