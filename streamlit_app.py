"""GoalCoach Streamlit port: deterministic curriculum, planner, grading and SQLite state."""
from __future__ import annotations

import math
import re
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Sequence

import streamlit as st

DB_PATH = Path(__file__).resolve().parent / "data" / "goalcoach_streamlit.sqlite"


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
class GoalBlueprint:
    id: str
    title: str
    outcome: str
    unit_ids: tuple[str, ...]
    concept_ids: tuple[str, ...]
    theme: str
    minutes: int = 16


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
BLUEPRINTS = tuple(GoalBlueprint(f"goal_{index:02d}", "建立第一组发音锚点" if index == 1 else f"HSK1 交际目标 {index}", "Recognize and produce today's target language.", tuple(unit.id for unit in UNITS[(index - 1) * 4:index * 4]), tuple(concept.id for concept in CONCEPTS[(index - 1) * 4:index * 4]), CONCEPTS[(index - 1) * 4].theme) for index in range(1, math.ceil(len(CONCEPTS) / 4) + 1))

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
        """)
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
        return int(self.ensure(learner_id)["state_version"])


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
    due = [row for row in progress.values() if row["next_review"] and row["next_review"][:10] <= today]
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
    for uid in anchor.unit_ids:
        unit = UNITS_BY_ID[uid]
        if sum(item.minutes for item in items) + unit.minutes > budget: break
        items.append(PlanItem(f"new_{uid}", "new", unit.concept_ids, (uid,), unit.title, unit.minutes))
    if sum(item.minutes for item in items) + 4 <= budget: items.append(PlanItem(f"free_{anchor.id}", "free_play", anchor.concept_ids, anchor.unit_ids, "Complete the target conversation", 4))
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
    labels = [f"{cid} · {prompt}" for cid, prompt, _, _ in EXERCISES]
    selected = st.selectbox("Exercise", labels)
    cid, prompt, expected, hint = EXERCISES[labels.index(selected)]
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
        st.title("GoalCoach"); st.caption("Systematic HSK1 Chinese learning"); page = st.radio("Navigate", ["Today", "Learn", "Practice", "Pinyin Lab", "Curriculum", "Progress", "Profile"]); name = st.text_input("Learner", learner["name"]); minutes = st.number_input("Daily minutes", 5, 120, learner["minutes"], 5); interests = st.multiselect("Interest skin", sorted({concept.theme for concept in CONCEPTS}), default=list(filter(None, learner["interests"].split(","))))
        if st.button("Save profile"): repository.save_profile(learner_id, name, int(minutes), interests); st.success("Profile saved")
    if page == "Today": render_today(repository, learner_id)
    elif page == "Learn": render_learn(repository, learner_id)
    elif page == "Practice": render_practice(repository, learner_id)
    elif page == "Pinyin Lab": render_pinyin(repository, learner_id)
    elif page == "Curriculum": render_curriculum(repository, learner_id)
    elif page == "Profile": render_profile(repository, learner_id)
    else:
        rows = repository.progress(learner_id); coverage = sum(float(row["learned"]) > 0 for row in rows.values()) / len(CONCEPTS); readiness = sum(float(row["mastery"]) * retention(row) for row in rows.values()) / len(CONCEPTS); st.title("Progress"); first, second = st.columns(2); first.metric("Course coverage", f"{coverage:.0%}"); second.metric("Current readiness", f"{readiness:.0%}"); st.caption("Readiness can decay with time; course coverage does not.")


if __name__ == "__main__": main()
