"""GoalCoach Streamlit port: deterministic curriculum, planner, grading and SQLite state."""
from __future__ import annotations

import math
import json
import re
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Sequence

import streamlit as st

DB_PATH = Path(__file__).resolve().parent / "data" / "goalcoach_streamlit.sqlite"
CONTENT_SQL_PATH = Path(__file__).resolve().parent / "data/database1/GoalCoach_HSK1_Learning_DB_Package/data/goalcoach_hsk1_learning_db_sqlite.sql"


@dataclass(frozen=True, slots=True)
class Concept:
    id: str
    title: str
    english: str
    module: str
    sequence: int
    theme: str
    prerequisite: str | None = None


@dataclass(frozen=True, slots=True)
class Unit:
    id: str
    concept_ids: tuple[str, ...]
    title: str
    minutes: int = 3


@dataclass(frozen=True, slots=True)
class LearningStep:
    step_type: str
    instruction: str
    minutes: int


@dataclass(frozen=True, slots=True)
class ContentCard:
    card_id: str
    concept_id: str
    purpose: str
    prompt: str
    example: str
    reviewed_by_human: bool = True


@dataclass(frozen=True, slots=True)
class FreeformSpec:
    mode: str
    target_concept_ids: tuple[str, ...]
    allowed_scripts: tuple[str, ...]
    minimum_turns: int
    target_score: float
    task_score: float


@dataclass(frozen=True, slots=True)
class GoalBlueprint:
    id: str
    title: str
    outcome: str
    unit_ids: tuple[str, ...]
    concept_ids: tuple[str, ...]
    theme: str
    minutes: int = 16
    freeform: FreeformSpec | None = None


@dataclass(frozen=True, slots=True)
class PlanItem:
    id: str
    kind: str
    concept_ids: tuple[str, ...]
    unit_ids: tuple[str, ...]
    title: str
    minutes: int


def build_curriculum() -> tuple[Concept, ...]:
    pinyin = [("p01", "拼音：基础音节", "Pinyin foundations"), ("p02", "声调：四声辨识", "Four tones"), ("p03", "声母：易混辅音", "Initial contrasts"), ("p04", "韵母：复合韵母", "Compound finals"), ("p05", "变调与轻声", "Tone sandhi"), ("p06", "连读与日常发音", "Connected speech")]
    grammar = [("c03", "我是学生", "Identity with 是"), ("c04", "你是学生吗？", "Questions with 吗"), ("c05", "你呢？", "Follow-up questions"), ("c06", "我不喝咖啡", "Negation with 不"), ("c07", "我没有钱", "Negation with 没有"), ("c08", "我很好", "Description with 很"), ("c10", "我想喝茶", "Wants and preferences"), ("c16", "我会说中文", "Ability with 会"), ("c21", "时间表达", "Time phrases"), ("c22", "地点表达", "Place phrases"), ("c23", "量词", "Measure words"), ("c24", "两轮对话", "Two-turn interaction")]
    themes = [("c01", "你好", "Greetings", "greetings_etiquette"), ("c02", "我叫……", "Self-introduction", "identity_family"), ("c09", "家人", "Family", "identity_family"), ("c11", "数字", "Numbers", "numbers_time"), ("c12", "今天星期几？", "Days and dates", "numbers_time"), ("c13", "吃饭", "Food", "dining_food"), ("c14", "喝什么？", "Drinks", "dining_food"), ("c15", "买东西", "Shopping", "shopping_prices"), ("c17", "多少钱？", "Prices", "shopping_prices"), ("c18", "去哪里？", "Directions", "travel_directions"), ("c19", "在学校", "Places", "travel_directions"), ("c20", "我喜欢……", "Likes", "daily_life"), ("c25", "工作和学习", "Work and study", "work_study"), ("c26", "天气", "Weather", "weather_feelings"), ("c27", "朋友", "Friends", "identity_family"), ("c28", "现在几点？", "Clock time", "numbers_time"), ("c29", "家在哪里？", "Where home is", "travel_directions"), ("c30", "请再说一次", "Repair strategies", "daily_life"), ("c31", "可以吗？", "Permission", "daily_life"), ("c32", "我能……吗？", "Ability questions", "daily_life"), ("c33", "早上好", "Daily greetings", "greetings_etiquette"), ("c34", "谢谢和再见", "Courtesy", "greetings_etiquette"), ("c35", "我喜欢咖啡", "Preference dialogue", "dining_food"), ("c36", "认识新朋友", "Meet someone", "identity_family")]
    result: list[Concept] = []
    previous: str | None = None
    for index, (suffix, title, english) in enumerate(pinyin, 1):
        cid = f"hsk1_{suffix}"; result.append(Concept(cid, title, english, "Pronunciation", index, "pinyin_basics", previous)); previous = cid
    previous = None
    for index, (suffix, title, english) in enumerate(grammar, 7):
        cid = f"hsk1_{suffix}"; result.append(Concept(cid, title, english, "Grammar", index, "core_grammar", previous)); previous = cid
    for index, (suffix, title, english, theme) in enumerate(themes, 19):
        result.append(Concept(f"hsk1_{suffix}", title, english, "Communication", index, theme))
    return tuple(result)


CONCEPTS = build_curriculum()
CONCEPTS_BY_ID = {concept.id: concept for concept in CONCEPTS}
UNITS = tuple(Unit(f"unit_{concept.id}", (concept.id,), concept.title) for concept in CONCEPTS)
UNITS_BY_ID = {unit.id: unit for unit in UNITS}
UNIT_STEPS = {
    unit.id: tuple(
        LearningStep(step_type, f"{step_type.replace('_', ' ').title()}: {unit.title}", 1)
        for step_type in ("hook", "notice", "explain", "controlled_practice", "retrieval", "output")
    )
    for unit in UNITS
}
CONTENT_CARDS = tuple(
    ContentCard(f"card_{unit.id}", unit.concept_ids[0], "production", unit.title, "Use today's target in one short sentence.")
    for unit in UNITS
)
BLUEPRINTS = tuple(GoalBlueprint(f"goal_{index:02d}", "建立第一组发音锚点" if index == 1 else f"HSK1 交际目标 {index}", "Recognize and produce today's target language.", tuple(unit.id for unit in UNITS[(index - 1) * 4:index * 4]), tuple(concept.id for concept in CONCEPTS[(index - 1) * 4:index * 4]), CONCEPTS[(index - 1) * 4].theme, 16, FreeformSpec("scenario_dialogue" if index < 4 else "writing", tuple(concept.id for concept in CONCEPTS[(index - 1) * 4:index * 4]), ("hanzi", "pinyin_tone_marks", "pinyin_tone_numbers"), 2, .75, .75)) for index in range(1, math.ceil(len(CONCEPTS) / 4) + 1))


def validate_curriculum() -> None:
    concept_ids = {concept.id for concept in CONCEPTS}
    unit_ids = {unit.id for unit in UNITS}
    referenced_units = {unit_id for blueprint in BLUEPRINTS for unit_id in blueprint.unit_ids}
    errors: list[str] = []
    for concept in CONCEPTS:
        if not any(concept.id in unit.concept_ids for unit in UNITS): errors.append(f"orphan concept: {concept.id}")
        if concept.prerequisite and concept.prerequisite not in concept_ids: errors.append(f"invalid prerequisite: {concept.id}")
    for unit in UNITS:
        if unit.id not in referenced_units: errors.append(f"orphan unit: {unit.id}")
        if any(cid not in concept_ids for cid in unit.concept_ids): errors.append(f"invalid unit concept: {unit.id}")
        if sum(step.minutes for step in UNIT_STEPS[unit.id]) != 6: errors.append(f"invalid step budget: {unit.id}")
    for blueprint in BLUEPRINTS:
        if any(uid not in unit_ids for uid in blueprint.unit_ids): errors.append(f"invalid blueprint unit: {blueprint.id}")
        if any(cid not in concept_ids for cid in blueprint.concept_ids): errors.append(f"invalid blueprint concept: {blueprint.id}")
    if errors: raise RuntimeError("Curriculum validation failed: " + "; ".join(errors))


validate_curriculum()

PINYIN_CARDS = (
    ("四声", "mā / má / mǎ / mà", "妈 / 麻 / 马 / 骂", "One syllable, four meanings. Hold the contour, not just the spelling."),
    ("声母", "b / p / m / f", "八 / 怕 / 妈 / 发", "b is unaspirated; p has a clear puff of air."),
    ("韵母", "ai / ei / ao / ou", "爱 / 飞 / 好 / 口", "Move smoothly from the first vowel into the second."),
    ("三声变调", "nǐ hǎo → ní hǎo", "你好", "The first third tone commonly rises before another third tone."),
    ("轻声", "ma / ne / ba", "好吗？你呢？", "Keep the particle short and light."),
)

EXERCISES = (
    ("hsk1_c01", "Translate: Hello!", "你好", "你好"),
    ("hsk1_c02", "Say: My name is Anna.", "我叫安娜", "我叫"),
    ("hsk1_c03", "Say: I am a student.", "我是学生", "我是"),
    ("hsk1_c04", "Turn this into a question: 你是学生。", "你是学生吗", "吗"),
    ("hsk1_c10", "Say: I want to drink tea.", "我想喝茶", "我想喝茶"),
    ("hsk1_c20", "Say: I like coffee.", "我喜欢咖啡", "我喜欢"),
)


def load_content_database() -> sqlite3.Connection | None:
    """Load the repository's curated SQL package without requiring Node or an ORM."""
    if not CONTENT_SQL_PATH.exists():
        return None
    connection = sqlite3.connect(":memory:")
    try:
        connection.executescript(CONTENT_SQL_PATH.read_text(encoding="utf-8"))
        connection.row_factory = sqlite3.Row
        return connection
    except sqlite3.Error:
        connection.close()
        return None


CONTENT_DATABASE = load_content_database()


def content_exercises() -> tuple[tuple[str, str, str, str], ...]:
    if CONTENT_DATABASE is None:
        return EXERCISES
    try:
        rows = CONTENT_DATABASE.execute("SELECT exercise_id, concept_id, prompt, answer, accepted_answers FROM exercises ORDER BY concept_id, exercise_order").fetchall()
    except sqlite3.Error:
        return EXERCISES
    result: list[tuple[str, str, str, str]] = []
    for row in rows:
        answer = row["answer"] or ""
        try:
            parsed = json.loads(answer)
            answer = parsed.get("value", answer) if isinstance(parsed, dict) else answer
        except json.JSONDecodeError:
            answer = answer.strip('"{}')
        accepted = row["accepted_answers"] or answer
        try:
            accepted_values = json.loads(accepted)
            hint = " / ".join(str(value) for value in accepted_values) if isinstance(accepted_values, list) else str(accepted_values)
        except json.JSONDecodeError:
            hint = accepted.strip('[]"')
        result.append((row["concept_id"], row["prompt"], answer, hint))
    return tuple(result) or EXERCISES


class Repository:
    def __init__(self, path: Path = DB_PATH) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS learner (learner_id TEXT PRIMARY KEY, name TEXT NOT NULL, goal TEXT NOT NULL, minutes INTEGER NOT NULL, interests TEXT NOT NULL, state_version INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS concept_progress (learner_id TEXT NOT NULL, concept_id TEXT NOT NULL, learned REAL NOT NULL DEFAULT 0, mastery REAL NOT NULL DEFAULT 0, retention REAL NOT NULL DEFAULT 0, reviews INTEGER NOT NULL DEFAULT 0, evidence_days INTEGER NOT NULL DEFAULT 0, quality REAL NOT NULL DEFAULT 0, last_reviewed TEXT, next_review TEXT, PRIMARY KEY (learner_id, concept_id));
        CREATE TABLE IF NOT EXISTS learning_event (event_id TEXT PRIMARY KEY, learner_id TEXT NOT NULL, plan_item_id TEXT NOT NULL, concept_ids TEXT NOT NULL, event_type TEXT NOT NULL, active_seconds INTEGER NOT NULL, estimated_minutes INTEGER NOT NULL, engagement REAL NOT NULL, quality REAL NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS plan_completion (learner_id TEXT NOT NULL, plan_item_id TEXT NOT NULL, completed_at TEXT NOT NULL, quality REAL NOT NULL, PRIMARY KEY (learner_id, plan_item_id));
        CREATE TABLE IF NOT EXISTS error_profile (learner_id TEXT NOT NULL, concept_id TEXT NOT NULL, error_code TEXT NOT NULL, occurrences INTEGER NOT NULL DEFAULT 0, last_seen TEXT NOT NULL, PRIMARY KEY (learner_id, concept_id, error_code));
        CREATE TABLE IF NOT EXISTS learning_unit (unit_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS daily_goal_blueprint (blueprint_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
        """)
        self.db.executemany("INSERT OR IGNORE INTO learning_unit VALUES (?,?)", [(unit.id, unit.title) for unit in UNITS])
        self.db.executemany("INSERT OR IGNORE INTO daily_goal_blueprint VALUES (?,?)", [(blueprint.id, blueprint.outcome) for blueprint in BLUEPRINTS])
        self.db.commit()

    def ensure(self, learner_id: str) -> sqlite3.Row:
        self.db.execute("INSERT OR IGNORE INTO learner VALUES (?,?,?,?,?,1)", (learner_id, "Learner", "完成 HSK1 基础中文学习", 20, "")); self.db.commit()
        return self.db.execute("SELECT * FROM learner WHERE learner_id=?", (learner_id,)).fetchone()

    def progress(self, learner_id: str) -> dict[str, sqlite3.Row]:
        return {row["concept_id"]: row for row in self.db.execute("SELECT * FROM concept_progress WHERE learner_id=?", (learner_id,)).fetchall()}

    def save_profile(self, learner_id: str, name: str, minutes: int, interests: Sequence[str]) -> None:
        self.db.execute("UPDATE learner SET name=?,minutes=?,interests=?,state_version=state_version+1 WHERE learner_id=?", (name or "Learner", max(1, minutes), ",".join(interests), learner_id)); self.db.commit()

    def record(self, learner_id: str, item: PlanItem, event_type: str, quality: float, active_seconds: int, engagement: float) -> int:
        now = datetime.utcnow().isoformat(timespec="seconds"); active_seconds = min(max(0, active_seconds), item.minutes * 60)
        with self.db:
            self.db.execute("INSERT INTO learning_event VALUES (?,?,?,?,?,?,?,?,?,?)", (f"event_{datetime.utcnow().timestamp()}", learner_id, item.id, ",".join(item.concept_ids), event_type, active_seconds, item.minutes, engagement, quality, now))
            current = self.progress(learner_id)
            for cid in item.concept_ids:
                old = current.get(cid); learned = float(old["learned"]) if old else 0; mastery = float(old["mastery"]) if old else 0; reviews = int(old["reviews"]) if old else 0; days = int(old["evidence_days"]) if old else 0; average = float(old["quality"]) if old else 0
                successful = event_type == "review" and quality >= .8; reviews += int(successful); days += int(not old or old["last_reviewed"] != now[:10]); count = max(1, reviews + 1)
                next_review = (datetime.utcnow() + timedelta(days=max(1, reviews * 2))).isoformat(timespec="seconds")
                self.db.execute("""INSERT INTO concept_progress VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(learner_id,concept_id) DO UPDATE SET learned=excluded.learned,mastery=excluded.mastery,retention=excluded.retention,reviews=excluded.reviews,evidence_days=excluded.evidence_days,quality=excluded.quality,last_reviewed=excluded.last_reviewed,next_review=excluded.next_review""", (learner_id, cid, min(100, learned + (20 if event_type == "output" else 40)), min(1, max(mastery, .35 * quality) + (.15 if successful else 0)), quality, reviews, days, ((average * (count - 1)) + quality) / count, now[:10], next_review))
            self.db.execute("UPDATE learner SET state_version=state_version+1 WHERE learner_id=?", (learner_id,))
            if quality >= .75:
                self.db.execute("INSERT OR REPLACE INTO plan_completion VALUES (?,?,?,?)", (learner_id, item.id, now, quality))
            else:
                for concept_id in item.concept_ids:
                    self.db.execute("""INSERT INTO error_profile VALUES (?,?,?,?,?)
                    ON CONFLICT(learner_id,concept_id,error_code) DO UPDATE SET occurrences=occurrences+1,last_seen=excluded.last_seen""", (learner_id, concept_id, "target_gate_failed", 1, now[:10]))
        return int(self.ensure(learner_id)["state_version"])

    def completed_items(self, learner_id: str) -> set[str]:
        return {row["plan_item_id"] for row in self.db.execute("SELECT plan_item_id FROM plan_completion WHERE learner_id=?", (learner_id,)).fetchall()}

    def errors(self, learner_id: str) -> list[sqlite3.Row]:
        return self.db.execute("SELECT * FROM error_profile WHERE learner_id=? ORDER BY occurrences DESC, last_seen ASC", (learner_id,)).fetchall()


def retention(row: sqlite3.Row | None) -> float:
    if not row or not row["last_reviewed"]: return 0.0
    elapsed = max(0, (date.today() - date.fromisoformat(row["last_reviewed"])).days)
    return float(row["retention"]) * math.exp(-.05 * elapsed)


def progress_status(row: sqlite3.Row | None) -> str:
    if not row or row["learned"] == 0: return "not_started"
    if row["learned"] < 100: return "learning"
    return "mastered" if row["reviews"] >= 4 and row["evidence_days"] >= 3 and row["quality"] >= .8 else "almost_mastered"


def make_plan(repository: Repository, learner_id: str) -> tuple[tuple[PlanItem, ...], GoalBlueprint | None]:
    learner = repository.ensure(learner_id); progress = repository.progress(learner_id); budget = int(learner["minutes"]); today = date.today().isoformat(); items: list[PlanItem] = []
    completed = repository.completed_items(learner_id)
    errors = repository.errors(learner_id)
    due = [row for row in progress.values() if row["next_review"] and row["next_review"][:10] <= today and f"review_{row['concept_id']}" not in completed]
    for row in sorted(due, key=lambda value: value["next_review"] or ""):
        if sum(item.minutes for item in items) + 3 > budget: break
        items.append(PlanItem(f"review_{row['concept_id']}", "review", (row["concept_id"],), (), "Spaced retrieval review", 3))
    if len(due) * 3 >= budget * .8: return tuple(items), None
    interests = set(filter(None, learner["interests"].split(","))); candidates = []
    for blueprint in BLUEPRINTS:
        if blueprint.minutes > budget - sum(item.minutes for item in items): continue
        uncovered = sum(not progress.get(cid) or progress[cid]["learned"] < 100 for cid in blueprint.concept_ids)
        if uncovered: candidates.append((uncovered + int(blueprint.theme in interests), blueprint))
    anchor = max(candidates, key=lambda value: (value[0], value[1].id), default=(0, None))[1]
    if not anchor: return tuple(items), None
    remedial_budget = min(max(0, budget - sum(item.minutes for item in items)), max(2, int(budget * .25)))
    for error in errors:
        if error["concept_id"] not in anchor.concept_ids or remedial_budget < 2: continue
        remedial_id = f"remedial_{error['concept_id']}"
        if remedial_id in completed: continue
        items.append(PlanItem(remedial_id, "remedial", (error["concept_id"],), (), f"Correct recurring error · {error['error_code']}", 2))
        remedial_budget -= 2
    for uid in anchor.unit_ids:
        unit = UNITS_BY_ID[uid]
        item_id = f"new_{uid}"
        if item_id in completed: continue
        if sum(item.minutes for item in items) + unit.minutes > budget: break
        items.append(PlanItem(item_id, "new", unit.concept_ids, (uid,), unit.title, unit.minutes))
    free_id = f"free_{anchor.id}"
    if sum(item.minutes for item in items) + 4 <= budget and free_id not in completed: items.append(PlanItem(free_id, "free_play", anchor.concept_ids, anchor.unit_ids, "Complete the target conversation", 4))
    return tuple(items), anchor


def grade(answer: str, target: str) -> tuple[float, str]:
    clean = re.sub(r"[\s，。！？,.!?]", "", answer.strip().lower()).replace("u:", "ü").replace("v", "ü")
    expected = re.sub(r"[\s，。！？,.!?]", "", target.lower())
    if clean == expected: return 1.0, "Correct target structure and meaning."
    if all(token in clean for token in ("我", "想", "喝", "茶")): return .8, "Meaning is correct. Keep subject → 想 → verb → object."
    return .2, "Almost there. Try again with the available language."


def render_today(repository: Repository, learner_id: str) -> None:
    learner = repository.ensure(learner_id); items, anchor = make_plan(repository, learner_id); total = sum(item.minutes for item in items)
    progress = repository.progress(learner_id)
    coverage = sum(float(row["learned"]) > 0 for row in progress.values()) / len(CONCEPTS)
    readiness = sum(float(row["mastery"]) * retention(row) for row in progress.values()) / len(CONCEPTS)
    st.markdown(f"<div class='hero'><div class='hero-kicker'>GOALCOACH · HSK 1 FOUNDATIONS</div><div class='hero-title'>你好，{learner['name']}。</div><div class='hero-subtitle'>今天只需 <strong>{total or learner['minutes']} 分钟</strong>，完成一个可以真正说出来的小目标。</div><div class='hero-outcome'>{anchor.outcome if anchor else '今天先完成到期复习，保持已学能力稳定。'}</div></div>", unsafe_allow_html=True)
    first, second, third = st.columns(3)
    first.metric("Today's plan", f"{total or learner['minutes']} min")
    second.metric("Course coverage", f"{coverage:.0%}")
    third.metric("Current readiness", f"{readiness:.0%}")
    st.markdown("<div class='section-label'>TODAY'S PATH</div>", unsafe_allow_html=True)
    if st.button("开始今天的第一步", type="primary") and items: st.session_state["selected"] = items[0].id; st.session_state["page"] = "Learn"; st.rerun()
    for item in items:
        with st.container(border=True):
            icon = {"review": "↻", "new": "✦", "remedial": "◎", "free_play": "◈"}[item.kind]
            st.markdown(f"<div class='task-row'><div class='task-icon'>{icon}</div><div><div class='task-kind'>{item.kind.replace('_', ' ').upper()} · {item.minutes} MIN</div><div class='task-title'>{item.title}</div><div class='task-caption'>{'Retrieve and strengthen an existing skill.' if item.kind == 'review' else 'Build one complete, usable learning unit.' if item.kind == 'new' else 'A short targeted correction before output.' if item.kind == 'remedial' else 'Final goal check: use today’s language in context.'}</div></div></div>", unsafe_allow_html=True)
            if st.button("Start", key=f"start_{item.id}"): st.session_state["selected"] = item.id; st.session_state["page"] = "Learn"; st.rerun()


def render_curriculum(repository: Repository, learner_id: str) -> None:
    st.markdown("<div class='page-kicker'>LONG-TERM LEARNING MAP</div>", unsafe_allow_html=True); st.title("Curriculum Roadmap"); st.caption("A stable sequence of pronunciation, grammar and communication. Daily Plan selects from this map; it does not create a second curriculum."); progress = repository.progress(learner_id)
    for module in ("Pronunciation", "Grammar", "Communication"):
        concepts = [item for item in CONCEPTS if item.module == module]; learned_count = sum(bool(progress.get(c.id) and progress[c.id]["learned"] > 0) for c in concepts); mastered_count = sum(bool(progress.get(c.id) and progress_status(progress[c.id]) == "mastered") for c in concepts)
        st.markdown(f"<div class='module-header'><span>{module}</span><small>{learned_count}/{len(concepts)} learned · {mastered_count} mastered</small></div>", unsafe_allow_html=True)
        columns = st.columns(3)
        for index, concept in enumerate(concepts):
            row = progress.get(concept.id); learned = int(row["learned"]) if row else 0; mastered = f"{int(row['mastery'] * 100)}%" if row and progress_status(row) == "mastered" else "—"
            with columns[index % 3]:
                st.markdown(f"<div class='concept-card'><div class='concept-number'>{concept.sequence:02d}</div><div class='concept-title'>{concept.title}</div><div class='concept-en'>{concept.english}</div><div class='bar'><span style='width:{learned}%'></span></div><div class='concept-meta'><span>Learning {learned}%</span><span>Mastered {mastered}</span></div></div>", unsafe_allow_html=True)


def render_learn(repository: Repository, learner_id: str) -> None:
    items, _ = make_plan(repository, learner_id)
    if not items: st.info("No active task. Return to Today."); return
    ids = [item.id for item in items]; selected = st.session_state.get("selected", ids[0]); selected = st.selectbox("Current step", ids, index=ids.index(selected) if selected in ids else 0); item = next(item for item in items if item.id == selected)
    st.header(item.title); st.caption(f"{item.kind.replace('_', ' ').title()} · {item.minutes} minutes")
    answer = st.text_input("Your response", placeholder="你好，我叫 Anna。你呢？"); target = "你好，我叫Anna。你呢？" if item.kind == "free_play" else ("你好" if item.kind == "review" else "我叫Anna")
    quality = st.slider("Evidence quality", 0.0, 1.0, .8, .05)
    if st.button("Submit evidence", type="primary"):
        score, feedback = grade(answer, target); score = min(score, quality); event_type = "output" if item.kind == "free_play" else "attempt"; version = repository.record(learner_id, item, event_type, score, item.minutes * 60, 1.0 if score >= .75 else .75)
        (st.success if score >= .75 else st.warning)(f"{feedback} State version: {version}")


def render_pinyin(repository: Repository, learner_id: str) -> None:
    st.markdown("<div class='page-kicker'>PRONUNCIATION LAB</div>", unsafe_allow_html=True)
    st.title("Pinyin Lab")
    st.caption("Learn one sound target at a time, then prove it with listening and production.")
    unit_names = ["Unit 1 · Syllable map", "Unit 2 · Four tones", "Unit 3 · Initial contrasts", "Unit 4 · Compound finals", "Unit 5 · Tone sandhi"]
    selected = st.selectbox("Unit", unit_names)
    index = unit_names.index(selected)
    st.markdown(f"<div class='hero'><div class='hero-kicker'>UNIT {index + 1} · PRONUNCIATION</div><div class='hero-title'>{PINYIN_CARDS[index][0]}</div><div class='hero-subtitle'>{PINYIN_CARDS[index][1]}</div><div class='hero-outcome'>{PINYIN_CARDS[index][3]}</div></div>", unsafe_allow_html=True)
    left, right = st.columns([1, 1])
    with left:
        st.subheader("Listen and notice")
        st.markdown(f"### {PINYIN_CARDS[index][2]}")
        st.code(PINYIN_CARDS[index][1], language="text")
        st.info("Read the pinyin aloud twice. Notice the mouth shape and pitch movement.")
    with right:
        st.subheader("Controlled production")
        response = st.text_input("Type the target pinyin or Hanzi", key=f"pinyin_{index}")
        expected = PINYIN_CARDS[index][1].split(" /")[0].strip()
        if st.button("Check pronunciation evidence", type="primary"):
            quality = 1.0 if normalize(response) == normalize(expected) else .75 if response.strip() else .2
            unit = UNITS[index]
            item = PlanItem(f"pinyin_unit_{index + 1}", "new", unit.concept_ids, (unit.id,), unit.title, 3)
            version = repository.record(learner_id, item, "attempt", quality, 180, 1.0 if quality >= .8 else .75)
            if quality >= .75: st.success(f"Good production evidence. State version: {version}")
            else: st.warning("Try again with the target sound.")
    st.divider()
    st.subheader("Tone reference")
    tone_cols = st.columns(4)
    for column, (tone, contour, description) in zip(tone_cols, (("1", "55", "high and flat"), ("2", "35", "rising"), ("3", "214", "low/dipping"), ("4", "51", "falling"))):
        with column: st.metric(f"Tone {tone}", contour); st.caption(description)


def normalize(value: str) -> str:
    return re.sub(r"[\s，。！？,.!?]", "", value.strip().lower()).replace("u:", "ü").replace("v", "ü")


def render_practice(repository: Repository, learner_id: str) -> None:
    st.markdown("<div class='page-kicker'>GUIDED PRACTICE</div>", unsafe_allow_html=True)
    st.title("Practice Studio")
    st.caption("Short controlled practice prepares you for the final Freeform goal check.")
    exercise_bank = content_exercises()
    labels = [f"{cid} · {prompt}" for cid, prompt, _, _ in exercise_bank]
    selected = st.selectbox("Exercise", labels)
    cid, prompt, expected, hint = exercise_bank[labels.index(selected)]
    st.markdown(f"<div class='concept-card'><div class='concept-number'>TARGET CONCEPT</div><div class='concept-title'>{CONCEPTS_BY_ID[cid].title}</div><div class='concept-en'>{prompt}</div></div>", unsafe_allow_html=True)
    answer = st.text_input("Your answer", key=f"exercise_{cid}")
    st.caption(f"Hint: {hint}")
    if st.button("Submit answer", type="primary"):
        score, feedback = grade(answer, expected)
        unit = UNITS_BY_ID[f"unit_{cid}"]; item = PlanItem(f"practice_{cid}", "new", (cid,), (unit.id,), CONCEPTS_BY_ID[cid].title, 3)
        version = repository.record(learner_id, item, "attempt", score, 180, 1.0 if score >= .75 else .75)
        if score >= .75: st.success(f"{feedback} · State version {version}")
        else: st.warning(feedback)


def render_profile(repository: Repository, learner_id: str) -> None:
    learner = repository.ensure(learner_id)
    st.markdown("<div class='page-kicker'>LEARNER SETTINGS</div>", unsafe_allow_html=True)
    st.title("Learner Profile")
    with st.form("profile_form"):
        name = st.text_input("Name", learner["name"])
        goal = st.text_area("Goal", learner["goal"])
        minutes = st.slider("Daily available minutes", 5, 120, int(learner["minutes"]), 5)
        interests = st.multiselect("Interest themes", sorted({concept.theme for concept in CONCEPTS}), default=list(filter(None, learner["interests"].split(","))))
        if st.form_submit_button("Save profile", type="primary"):
            repository.save_profile(learner_id, name, minutes, interests); st.success("Profile saved. Your curriculum order remains unchanged; only examples and scenes adapt.")


def render_pinyin_chart() -> None:
    st.markdown("<div class='page-kicker'>SOUND MAP</div>", unsafe_allow_html=True)
    st.title("Interactive Pinyin Chart")
    st.caption("Select a syllable to inspect its initial, final and tone target.")
    initials = ["b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "zh", "ch", "sh", "r", "z", "c", "s"]
    finals = ["a", "o", "e", "i", "u", "ü", "ai", "ei", "ao", "ou", "an", "en", "ang", "eng"]
    initial = st.selectbox("Initial", initials)
    final = st.selectbox("Final", finals)
    tone = st.radio("Tone", ["1 · mā", "2 · má", "3 · mǎ", "4 · mà", "neutral"], horizontal=True)
    tone_mark = {"1 · mā": "ā", "2 · má": "á", "3 · mǎ": "ǎ", "4 · mà": "à", "neutral": "a"}[tone]
    syllable = initial + final
    st.markdown(f"<div class='hero'><div class='hero-kicker'>SELECTED SYLLABLE</div><div class='hero-title'>{initial}{tone_mark if final == 'a' else final}</div><div class='hero-subtitle'>Target: {syllable} · {tone}</div><div class='hero-outcome'>Listen, repeat twice, then use it in a real HSK1 word.</div></div>", unsafe_allow_html=True)
    grid = st.columns(7)
    for index, ending in enumerate(finals):
        with grid[index % 7]:
            st.button(f"{initial}{ending}", key=f"chart_{initial}_{ending}")


def render_teaching_cards() -> None:
    st.markdown("<div class='page-kicker'>CURATED TEACHING CARDS</div>", unsafe_allow_html=True)
    st.title("Teaching Cards")
    if CONTENT_DATABASE is None:
        st.warning("The curated SQL content package is unavailable; using the built-in fallback cards.")
        return
    concepts = CONTENT_DATABASE.execute("SELECT DISTINCT concept_id FROM teaching_cards ORDER BY concept_id").fetchall()
    selected = st.selectbox("Concept", [row["concept_id"] for row in concepts])
    cards = CONTENT_DATABASE.execute("SELECT * FROM teaching_cards WHERE concept_id=? ORDER BY card_order", (selected,)).fetchall()
    for card in cards:
        with st.container(border=True):
            st.markdown(f"**{card['card_type'].replace('_', ' ').title()}**")
            st.subheader(card["prompt_zh"] or card["meaning_en"] or "Teaching card")
            if card["pinyin"]: st.code(card["pinyin"], language="text")
            if card["explanation_en"]: st.write(card["explanation_en"])
            if card["example_zh"]: st.info(f"{card['example_zh']} · {card['example_pinyin'] or ''} · {card['example_en'] or ''}")


def render_dialogue(repository: Repository, learner_id: str) -> None:
    st.markdown("<div class='page-kicker'>FREEFORM GOAL CHECK</div>", unsafe_allow_html=True)
    st.title("Guided Freeform")
    st.caption("A two-turn scenario checks whether you can use today's language in context.")
    st.info("Context: You meet a new classmate. They say: 你好！")
    st.write("Choose a natural reply, then ask one question back.")
    choices = ["你好！我叫 Anna。你呢？", "你好！我是学生。你是学生吗？", "谢谢，再见。"]
    answer = st.radio("Your reply", choices)
    if st.button("Submit goal check", type="primary"):
        passed = answer != choices[-1]
        unit = UNITS_BY_ID["unit_hsk1_c24"]
        item = PlanItem("freeform_dialogue", "free_play", ("hsk1_c24",), (unit.id,), "Two-turn introduction", 4)
        version = repository.record(learner_id, item, "output", 1.0 if passed else .3, 240, 1.0 if passed else .75)
        if passed: st.success(f"Goal achieved. You completed two connected turns. State version: {version}")
        else: st.warning("Almost there. Keep the conversation connected and ask a question back.")


def render_coach() -> None:
    st.markdown("<div class='page-kicker'>COACH BAOBAO</div>", unsafe_allow_html=True)
    st.title("Coach")
    st.caption("Short feedback: one correction, one reason, one retry.")
    if "coach_messages" not in st.session_state:
        st.session_state["coach_messages"] = [("assistant", "你好！今天我们练一句短短的中文。你想先练发音还是自我介绍？")]
    for role, message in st.session_state["coach_messages"]:
        with st.chat_message(role): st.write(message)
    prompt = st.chat_input("Ask your Chinese coach")
    if prompt:
        st.session_state["coach_messages"].append(("user", prompt))
        lower = prompt.lower()
        response = "很好！先说短句就可以。试试：我叫……。然后问：你呢？" if "name" in lower or "名字" in prompt else "Almost there. 中文先说人，再说动作：我想喝茶。再试一次。"
        st.session_state["coach_messages"].append(("assistant", response)); st.rerun()


def render_retention(repository: Repository, learner_id: str) -> None:
    st.markdown("<div class='page-kicker'>MEMORY HEALTH</div>", unsafe_allow_html=True)
    st.title("Retention Dashboard")
    rows = repository.progress(learner_id)
    st.caption("Current readiness may decline with time; learned course coverage is never erased.")
    chart_rows = []
    for concept in CONCEPTS:
        row = rows.get(concept.id)
        chart_rows.append({"Concept": concept.title, "Learned": float(row["learned"]) if row else 0, "Readiness": round(float(row["mastery"]) * retention(row) * 100, 1) if row else 0})
    if chart_rows:
        st.bar_chart(chart_rows, x="Concept", y=["Learned", "Readiness"])
    due = [concept.title for concept in CONCEPTS if rows.get(concept.id) and rows[concept.id]["next_review"] and rows[concept.id]["next_review"][:10] <= date.today().isoformat()]
    if due: st.warning(f"Review due: {', '.join(due[:8])}")
    else: st.success("No urgent reviews due.")


def render_knowledge_tree(repository: Repository, learner_id: str) -> None:
    st.markdown("<div class='page-kicker'>SKILL GRAPH</div>", unsafe_allow_html=True)
    st.title("Knowledge Tree")
    progress = repository.progress(learner_id)
    for module, color in (("Pronunciation", "#38bdf8"), ("Grammar", "#34d399"), ("Communication", "#fbbf24")):
        concepts = [concept for concept in CONCEPTS if concept.module == module]
        st.markdown(f"<div class='module-header'><span style='color:{color}'>{module}</span><small>Prerequisites unlock the next node</small></div>", unsafe_allow_html=True)
        for concept in concepts:
            row = progress.get(concept.id)
            learned = int(row["learned"]) if row else 0
            locked = bool(concept.prerequisite and (not progress.get(concept.prerequisite) or progress[concept.prerequisite]["learned"] < 100))
            state = "Locked" if locked else progress_status(row)
            marker = "🔒" if locked else "🏆" if state == "mastered" else "✅" if learned == 100 else "◦"
            st.markdown(f"`{marker}` **{concept.title}** · {state} · Learning {learned}%")


def render_goal_presets(repository: Repository, learner_id: str) -> None:
    st.markdown("<div class='page-kicker'>GOAL DESIGN</div>", unsafe_allow_html=True)
    st.title("Choose your learning skin")
    st.caption("Your interest changes examples and scenes; it never changes curriculum order or prerequisites.")
    presets = {"General": ("daily_life", "Build everyday HSK1 confidence."), "Travel": ("travel_directions", "Handle simple directions and travel scenes."), "Dining": ("dining_food", "Order food and drinks with confidence."), "Work and study": ("work_study", "Introduce yourself in a study or work context.")}
    columns = st.columns(2)
    for index, (title, (theme, outcome)) in enumerate(presets.items()):
        with columns[index % 2]:
            with st.container(border=True):
                st.subheader(title); st.write(outcome)
                if st.button("Use this theme", key=f"preset_{theme}"):
                    learner = repository.ensure(learner_id); repository.save_profile(learner_id, learner["name"], learner["minutes"], [theme]); st.success("Theme saved. Curriculum sequence is unchanged.")


def main() -> None:
    st.set_page_config(page_title="GoalCoach", page_icon="🎯", layout="wide")
    st.markdown("""<style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&family=Noto+Sans+SC:wght@400;500;700;900&display=swap');
    :root { --ink:#171717; --muted:#71717a; --green:#10b981; --soft:#f0fdf4; --line:#e4e4e7; }
    html,body,[class*='css'] { font-family:'DM Sans','Noto Sans SC',sans-serif; }
    .stApp { background:linear-gradient(145deg,#fafafa 0%,#f5fdf9 100%); color:var(--ink); }
    [data-testid='stSidebar'] { background:#171717; } [data-testid='stSidebar'] * { color:#fafafa !important; }
    .hero { background:linear-gradient(135deg,#111827,#064e3b); color:white; border-radius:26px; padding:34px 38px; margin-bottom:22px; box-shadow:0 12px 30px #064e3b22; }
    .hero-kicker,.page-kicker,.section-label { font-size:10px; font-weight:800; letter-spacing:.14em; color:#6ee7b7; }
    .hero-title { font-size:34px; font-weight:900; margin:10px 0 4px; } .hero-subtitle { font-size:17px; color:#d1fae5; } .hero-outcome { margin-top:22px; background:#ffffff18; border:1px solid #ffffff2a; border-radius:15px; padding:14px 16px; font-size:15px; }
    .section-label { color:#047857; margin:26px 0 10px; } .task-row { display:flex; gap:15px; align-items:center; min-height:58px; } .task-icon { width:42px;height:42px;border-radius:14px;background:#ecfdf5;color:#047857;display:flex;align-items:center;justify-content:center;font-size:23px;font-weight:800; } .task-kind { color:#059669;font-size:10px;font-weight:800;letter-spacing:.1em; } .task-title { font-size:17px;font-weight:800;margin:3px 0; } .task-caption,.concept-en { color:#71717a;font-size:12px; } .module-header { margin-top:26px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid var(--line);padding:0 2px 10px;font-size:19px;font-weight:800; } .module-header small { color:#71717a;font-size:11px;font-weight:500; } .concept-card { background:white;border:1px solid var(--line);border-radius:18px;padding:16px;margin:8px 0;min-height:122px;box-shadow:0 3px 10px #00000008; } .concept-number { color:#a1a1aa;font-size:10px;font-weight:800;letter-spacing:.1em; } .concept-title { font-size:15px;font-weight:800;margin:7px 0 2px; } .bar { height:5px;background:#f4f4f5;border-radius:9px;margin:14px 0 8px;overflow:hidden; } .bar span { display:block;height:100%;background:#10b981;border-radius:9px; } .concept-meta { color:#059669;font-size:10px;font-weight:700;display:flex;justify-content:space-between; } .stButton>button { border-radius:12px;font-weight:700;border:1px solid #d4d4d8; } .stButton>button[kind='primary'] { background:#10b981;color:#052e16;border:0; }
    </style>""", unsafe_allow_html=True)
    repository = Repository(); learner_id = "streamlit_learner"; learner = repository.ensure(learner_id)
    with st.sidebar:
        st.title("GoalCoach"); st.caption("Systematic HSK1 Chinese learning"); page = st.radio("Navigate", ["Today", "Learn", "Practice", "Teaching Cards", "Pinyin Lab", "Pinyin Chart", "Freeform", "Coach", "Curriculum", "Knowledge Tree", "Goal Presets", "Retention", "Progress", "Profile"]); name = st.text_input("Learner", learner["name"]); minutes = st.number_input("Daily minutes", 5, 120, learner["minutes"], 5); interests = st.multiselect("Interest skin", sorted({concept.theme for concept in CONCEPTS}), default=list(filter(None, learner["interests"].split(","))))
        if st.button("Save profile"): repository.save_profile(learner_id, name, int(minutes), interests); st.success("Profile saved")
    if page == "Today": render_today(repository, learner_id)
    elif page == "Learn": render_learn(repository, learner_id)
    elif page == "Practice": render_practice(repository, learner_id)
    elif page == "Teaching Cards": render_teaching_cards()
    elif page == "Pinyin Lab": render_pinyin(repository, learner_id)
    elif page == "Pinyin Chart": render_pinyin_chart()
    elif page == "Freeform": render_dialogue(repository, learner_id)
    elif page == "Coach": render_coach()
    elif page == "Curriculum": render_curriculum(repository, learner_id)
    elif page == "Knowledge Tree": render_knowledge_tree(repository, learner_id)
    elif page == "Goal Presets": render_goal_presets(repository, learner_id)
    elif page == "Retention": render_retention(repository, learner_id)
    elif page == "Profile": render_profile(repository, learner_id)
    else:
        rows = repository.progress(learner_id); coverage = sum(float(row["learned"]) > 0 for row in rows.values()) / len(CONCEPTS); readiness = sum(float(row["mastery"]) * retention(row) for row in rows.values()) / len(CONCEPTS); st.title("Progress"); first, second = st.columns(2); first.metric("Course coverage", f"{coverage:.0%}"); second.metric("Current readiness", f"{readiness:.0%}"); st.caption("Readiness can decay with time; course coverage does not.")


if __name__ == "__main__": main()
