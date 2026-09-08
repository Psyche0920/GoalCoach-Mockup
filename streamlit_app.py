"""GoalCoach Streamlit MVP.

This is the Python-facing presentation layer for the Streamlit migration. The
domain rules are intentionally small and deterministic so the app can be
deployed before the AI provider and persistent repository are wired in.
"""

from dataclasses import dataclass
from typing import Dict, List

import streamlit as st


@dataclass(frozen=True)
class Exercise:
    concept: str
    prompt: str
    expected: str
    hint: str


EXERCISES: List[Exercise] = [
    Exercise("自我介绍", "请用中文说：My name is Anna.", "我叫安娜。", "我叫 + 名字"),
    Exercise("问候", "请翻译：Hello!", "你好！", "日常问候语"),
    Exercise("数字", "请用中文写数字 3。", "三", "一、二、三"),
]


def initialise_state() -> None:
    """Create the learner state once per browser session."""
    defaults = {
        "learner_name": "Learner",
        "completed": set(),
        "answers": {},
        "goal": "完成 HSK1 基础中文学习",
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


def exercise_score(answer: str, expected: str) -> bool:
    """Apply a conservative exact-match score for the MVP."""
    normalised_answer = answer.strip().replace(" ", "")
    normalised_expected = expected.strip().replace(" ", "")
    return bool(normalised_answer) and normalised_answer == normalised_expected


def render_sidebar() -> None:
    with st.sidebar:
        st.title("GoalCoach")
        st.caption("Adaptive Chinese learning coach")
        st.divider()
        st.session_state["learner_name"] = st.text_input(
            "学习者", value=st.session_state["learner_name"]
        )
        st.session_state["goal"] = st.text_area(
            "当前目标", value=st.session_state["goal"], height=80
        )
        st.divider()
        st.info("当前版本使用浏览器会话保存状态。接入 SQLite 后可实现跨设备持久化。")


def render_dashboard() -> None:
    completed = len(st.session_state["completed"])
    progress = int(completed / len(EXERCISES) * 100)
    st.title("今天的学习计划")
    st.caption("Goal → Plan → Teach → Grade → Update")

    first, second, third = st.columns(3)
    first.metric("总体进度", f"{progress}%")
    second.metric("已完成练习", f"{completed}/{len(EXERCISES)}")
    third.metric("今日目标", "15 分钟")
    st.progress(progress / 100)

    st.subheader("学习路线")
    for index, exercise in enumerate(EXERCISES, start=1):
        status = "✅ 已完成" if exercise.concept in st.session_state["completed"] else "待学习"
        st.write(f"**{index}. {exercise.concept}**　{status}")


def render_exercise() -> None:
    st.title("练习与反馈")
    choices = [exercise.concept for exercise in EXERCISES]
    selected = st.selectbox("选择学习内容", choices)
    exercise = next(item for item in EXERCISES if item.concept == selected)
    st.subheader(exercise.concept)
    st.write(exercise.prompt)
    st.caption(f"提示：{exercise.hint}")

    answer = st.text_input("你的答案", key=f"answer_{selected}")
    if st.button("提交答案", type="primary"):
        correct = exercise_score(answer, exercise.expected)
        st.session_state["answers"][selected] = answer
        if correct:
            st.session_state["completed"].add(selected)
            st.success("回答正确！已更新学习进度。")
        else:
            st.warning(f"再试一次。参考答案：{exercise.expected}")


def render_curriculum() -> None:
    st.title("HSK1 课程路线")
    st.write("从高频表达开始，逐步建立发音、词汇和基础句型能力。")
    curriculum = {
        "第 1 单元：问候与自我介绍": ["你好", "我叫……", "你叫什么名字？"],
        "第 2 单元：数字与身份": ["一至十", "学生", "老师", "是 / 不是"],
        "第 3 单元：日常交流": ["谢谢", "再见", "请问", "我喜欢……"],
    }
    for unit, concepts in curriculum.items():
        with st.expander(unit, expanded=True):
            for concept in concepts:
                st.write(f"• {concept}")


def main() -> None:
    st.set_page_config(page_title="GoalCoach", page_icon="🎯", layout="wide")
    initialise_state()
    render_sidebar()
    tab_dashboard, tab_exercise, tab_curriculum = st.tabs(
        ["今日计划", "练习", "课程路线"]
    )
    with tab_dashboard:
        render_dashboard()
    with tab_exercise:
        render_exercise()
    with tab_curriculum:
        render_curriculum()


if __name__ == "__main__":
    main()
