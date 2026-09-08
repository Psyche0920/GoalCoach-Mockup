import { DatabaseSync } from 'node:sqlite';
import { ConceptProgress, DailyGoalBlueprint, LearnerState, LearningEvent, LearningUnit } from '../types.ts';

export class LearnerRepositoryError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LearnerRepositoryError';
  }
}

export class SqliteLearnerRepository {
  private readonly database: DatabaseSync;

  public constructor(databasePath: string) {
    this.database = new DatabaseSync(databasePath);
    this.database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  public close(): void {
    this.database.close();
  }

  public findState(learnerId: string): LearnerState | null {
    const row = this.database.prepare('SELECT state_json FROM learner_state WHERE learner_id = ?').get(learnerId) as { state_json: string } | undefined;
    return row ? JSON.parse(row.state_json) as LearnerState : null;
  }

  public saveState(state: LearnerState): void {
    try {
      this.database.prepare(`
        INSERT INTO learner_state (learner_id, state_json, state_version, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(learner_id) DO UPDATE SET
          state_json = excluded.state_json,
          state_version = excluded.state_version,
          updated_at = excluded.updated_at
      `).run(state.learnerId, JSON.stringify(state), state.stateVersion ?? 1, state.updatedAt);
    } catch (error) {
      throw new LearnerRepositoryError(`Failed to persist learner ${state.learnerId}`, { cause: error });
    }
  }

  public saveCurriculum(units: readonly LearningUnit[], blueprints: readonly DailyGoalBlueprint[]): void {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const unitStatement = this.database.prepare('INSERT OR REPLACE INTO learning_unit (id, payload_json) VALUES (?, ?)');
      const blueprintStatement = this.database.prepare('INSERT OR REPLACE INTO daily_goal_blueprint (id, payload_json) VALUES (?, ?)');
      for (const unit of units) unitStatement.run(unit.id, JSON.stringify(unit));
      for (const blueprint of blueprints) blueprintStatement.run(blueprint.id, JSON.stringify(blueprint));
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw new LearnerRepositoryError('Failed to persist curriculum', { cause: error });
    }
  }

  public appendEventAndProgress(event: LearningEvent, progressRows: readonly ConceptProgress[], state: LearnerState): void {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare(`INSERT INTO learning_event
        (id, learner_id, plan_item_id, concept_ids_json, event_type, started_at, last_active_at,
         active_seconds, estimated_minutes, engagement_score, grading_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(event.id, event.learnerId, event.planItemId, JSON.stringify(event.conceptIds), event.eventType,
          event.startedAt, event.lastActiveAt, event.activeSeconds, event.estimatedMinutes,
          event.engagementScore, event.gradingResult ? JSON.stringify(event.gradingResult) : null, event.createdAt);
      const statement = this.database.prepare(`INSERT INTO concept_progress
        (learner_id, concept_id, payload_json) VALUES (?, ?, ?)
        ON CONFLICT(learner_id, concept_id) DO UPDATE SET payload_json = excluded.payload_json`);
      for (const progress of progressRows) statement.run(progress.learnerId, progress.conceptId, JSON.stringify(progress));
      this.saveState(state);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw new LearnerRepositoryError('Learning transaction failed', { cause: error });
    }
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS learner_state (
        learner_id TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        state_version INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS concept_progress (
        learner_id TEXT NOT NULL,
        concept_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (learner_id, concept_id)
      );
      CREATE TABLE IF NOT EXISTS learning_event (
        id TEXT PRIMARY KEY,
        learner_id TEXT NOT NULL,
        plan_item_id TEXT NOT NULL,
        concept_ids_json TEXT NOT NULL,
        event_type TEXT NOT NULL,
        started_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL,
        active_seconds INTEGER NOT NULL CHECK (active_seconds >= 0),
        estimated_minutes REAL NOT NULL CHECK (estimated_minutes >= 0),
        engagement_score REAL NOT NULL CHECK (engagement_score BETWEEN 0 AND 1),
        grading_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS learning_unit (id TEXT PRIMARY KEY, payload_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS daily_goal_blueprint (id TEXT PRIMARY KEY, payload_json TEXT NOT NULL);
    `);
  }
}
